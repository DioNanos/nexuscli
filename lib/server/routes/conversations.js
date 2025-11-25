const express = require('express');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const HistorySync = require('../services/history-sync');
const sessionManager = require('../services/session-manager');
const { getOrSet, invalidateConversations, KEYS, getStats } = require('../services/cache');

const router = express.Router();
const historySync = new HistorySync();

/**
 * GET /api/v1/conversations
 * List conversations (optionally grouped by date)
 *
 * Query params:
 * - groupBy=date: Group conversations by date
 * - sync=true: Force sync with Claude Code history.jsonl (default: auto)
 * - limit=N: Limit per group (default: 20, 0 = unlimited)
 * - workspace=path: Filter by workspace path
 */
router.get('/', async (req, res) => {
  try {
    const startTime = Date.now();
    const groupBy = req.query.groupBy;
    const syncParam = req.query.sync;
    const workspace = req.query.workspace;
    const limit = parseInt(req.query.limit) || 20;
    const noCache = req.query.nocache === 'true' || req.query.nocache === '1';
    const forceSync = syncParam === 'true' || syncParam === '1';

    // Sync with Claude Code history.jsonl
    // Only sync if explicitly requested (removed auto-sync for performance)
    if (forceSync && historySync.exists()) {
      try {
        await historySync.sync(true);
        invalidateConversations(); // Clear cache after sync
      } catch (syncError) {
        console.error('[Conversations] Sync error:', syncError);
        // Continue even if sync fails (use cached data)
      }
    }

    // Filter by workspace if requested (returns grouped data)
    if (workspace) {
      const cacheKey = KEYS.CONVERSATIONS_WORKSPACE(workspace);
      const grouped = noCache
        ? await historySync.getWorkspaceSessions(workspace, limit)
        : await getOrSet(cacheKey, () => historySync.getWorkspaceSessions(workspace, limit), 30);

      console.log(`[Conversations] Workspace query took ${Date.now() - startTime}ms (cached: ${!noCache})`);
      return res.json(grouped);
    }

    // Return conversations grouped by date
    if (groupBy === 'date') {
      const grouped = noCache
        ? Conversation.listGroupedByDate(limit)
        : await getOrSet(KEYS.CONVERSATIONS_GROUPED, () => Conversation.listGroupedByDate(limit), 30);

      console.log(`[Conversations] Grouped query took ${Date.now() - startTime}ms (cached: ${!noCache})`);
      return res.json(grouped);
    }

    // Return flat list (not cached - less frequent)
    const conversations = Conversation.listRecent(limit);
    console.log(`[Conversations] List query took ${Date.now() - startTime}ms`);

    res.json({ conversations });
  } catch (error) {
    console.error('[Conversations] List error:', error);
    res.status(500).json({ error: 'Failed to list conversations' });
  }
});

/**
 * GET /api/v1/conversations/:id
 * Get conversation with messages
 *
 * Query params:
 * - limit=N: Max messages to return (default: 50)
 * - offset=N: Skip first N messages (default: 0)
 * - all=true: Return all messages (ignores limit/offset)
 */
router.get('/:id', (req, res) => {
  try {
    const conversation = Conversation.getById(req.params.id);

    if (!conversation) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get total message count
    const totalMessages = Message.countByConversation(req.params.id);

    // Parse query params
    const all = req.query.all === 'true';
    const limit = all ? totalMessages : (parseInt(req.query.limit) || 50);
    const offset = all ? 0 : (parseInt(req.query.offset) || 0);

    // Get messages for this conversation
    const messages = Message.getByConversation(req.params.id, limit, offset);

    res.json({
      ...conversation,
      messages,
      pagination: {
        total: totalMessages,
        limit,
        offset,
        hasMore: (offset + messages.length) < totalMessages
      }
    });
  } catch (error) {
    console.error('[Conversations] Get error:', error);
    res.status(500).json({ error: 'Failed to get conversation' });
  }
});

/**
 * PATCH /api/v1/conversations/:id
 * Update conversation title
 */
router.patch('/:id', (req, res) => {
  try {
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const updated = Conversation.updateTitle(req.params.id, title);

    if (!updated) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    invalidateConversations(); // Clear cache after update
    res.json({ success: true });
  } catch (error) {
    console.error('[Conversations] Update error:', error);
    res.status(500).json({ error: 'Failed to update conversation' });
  }
});

/**
 * DELETE /api/v1/conversations/:id
 * Delete conversation (cascade deletes messages and sessions)
 */
router.delete('/:id', (req, res) => {
  try {
    const conversationId = req.params.id;

    // First, cleanup sessions for this conversation
    const sessionsDeleted = sessionManager.deleteConversationSessions(conversationId);
    console.log(`[Conversations] Deleted ${sessionsDeleted} sessions for ${conversationId}`);

    // Then delete the conversation (cascade deletes messages)
    const deleted = Conversation.delete(conversationId);

    if (!deleted) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    invalidateConversations(); // Clear cache after delete
    res.json({ success: true, sessionsDeleted });
  } catch (error) {
    console.error('[Conversations] Delete error:', error);
    res.status(500).json({ error: 'Failed to delete conversation' });
  }
});

/**
 * POST /api/v1/conversations/:id/bookmark
 * Toggle bookmark status
 */
router.post('/:id/bookmark', (req, res) => {
  try {
    const bookmarked = Conversation.toggleBookmark(req.params.id);

    if (bookmarked === null) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    invalidateConversations(); // Clear cache after bookmark change
    res.json({ bookmarked });
  } catch (error) {
    console.error('[Conversations] Bookmark error:', error);
    res.status(500).json({ error: 'Failed to toggle bookmark' });
  }
});

/**
 * POST /api/v1/conversations/:id/pin
 * Toggle pin status (alias for bookmark for UI consistency)
 */
router.post('/:id/pin', (req, res) => {
  try {
    const pinned = Conversation.toggleBookmark(req.params.id);

    if (pinned === null) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    invalidateConversations(); // Clear cache after pin change
    res.json({ pinned });
  } catch (error) {
    console.error('[Conversations] Pin error:', error);
    res.status(500).json({ error: 'Failed to toggle pin' });
  }
});

/**
 * GET /api/v1/conversations/cache/stats
 * Get cache statistics (for debugging)
 */
router.get('/cache/stats', (req, res) => {
  try {
    res.json(getStats());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
