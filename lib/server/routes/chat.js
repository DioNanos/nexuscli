const express = require('express');
const ClaudeWrapper = require('../services/claude-wrapper');
const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const { prepare } = require('../db');
const { v4: uuidv4 } = require('uuid');
const HistorySync = require('../services/history-sync');
const sessionManager = require('../services/session-manager');
const SummaryGenerator = require('../services/summary-generator');
const contextBridge = require('../services/context-bridge');
const { invalidateConversations } = require('../services/cache');

const router = express.Router();
const claudeWrapper = new ClaudeWrapper();
const historySync = new HistorySync();
const summaryGenerator = new SummaryGenerator();

function ensureConversation(conversationId, workspacePath) {
  try {
    const stmt = prepare(`
      INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const metadata = workspacePath ? JSON.stringify({ workspace: workspacePath }) : null;
    stmt.run(conversationId, 'New Chat', now, now, metadata);
  } catch (err) {
    console.warn('[Chat] Failed to ensure conversation exists:', err.message);
  }
}

/**
 * POST /api/v1/chat
 * Send message to Claude Code CLI with SSE streaming
 *
 * Request body:
 * {
 *   "conversationId": "uuid" (optional for new chat)
 *   "message": "user prompt",
 *   "model": "sonnet" (optional),
 *   "workspace": "/path" (optional for new chat)
 * }
 *
 * Response: SSE stream
 * - Status events (tool use, file ops, thinking)
 * - Final message text and sessionId
 */
router.post('/', async (req, res) => {
  try {
    console.log('[Chat] === NEW CHAT REQUEST ===');
    console.log('[Chat] Body:', JSON.stringify(req.body, null, 2));

    const { conversationId, message, model = 'sonnet', workspace } = req.body;

    console.log(`[Chat] conversationId: ${conversationId}`);
    console.log(`[Chat] message: ${message?.substring(0, 100)}`);
    console.log(`[Chat] model: ${model}`);
    console.log(`[Chat] workspace: ${workspace}`);

    if (!message) {
      console.log('[Chat] ERROR: message required');
      return res.status(400).json({ error: 'message required' });
    }

    // Resolve workspace path
    const workspacePath = workspace || process.cwd();

    // Use SessionManager for session sync pattern
    // conversationId → sessionId (per engine)
    const frontendConversationId = conversationId || uuidv4();
    ensureConversation(frontendConversationId, workspacePath);

    const { sessionId, isNew: isNewSession } = await sessionManager.getOrCreateSession(
      frontendConversationId,
      'claude',
      workspacePath
    );

    console.log(`[Chat] Session resolved: ${sessionId} (new: ${isNewSession})`);
    const isNewChat = isNewSession;

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'message_start', messageId: `user-${Date.now()}`, sessionId, conversationId: frontendConversationId })}\n\n`);

    // Check if this is an engine switch (requires context bridging)
    const lastEngine = Message.getLastEngine(frontendConversationId);
    const isEngineBridge = lastEngine && lastEngine !== 'claude';

    // IMPORTANT: Skip contextBridge for Claude native resume!
    // When Claude uses `-r sessionId`, it loads full history from .jsonl file.
    // ContextBridge is ONLY needed for:
    // 1. Engine switches (e.g., Codex → Claude)
    // 2. New sessions without history
    let promptToSend = message;

    if (isEngineBridge) {
      // Engine switch: need context from previous engine
      const contextResult = await contextBridge.buildContext({
        conversationId: frontendConversationId,
        sessionId,
        fromEngine: lastEngine,
        toEngine: 'claude',
        userMessage: message
      });
      promptToSend = contextResult.prompt;
      console.log(`[Chat] Engine bridge: ${contextResult.contextTokens} tokens from ${lastEngine}`);

      res.write(`data: ${JSON.stringify({
        type: 'status',
        category: 'engine_switch',
        message: `Continuing conversation from ${lastEngine}`
      })}\n\n`);
    } else if (!isNewSession) {
      // Native resume: Claude will load history from session file
      console.log(`[Chat] Native resume: Claude will use -r ${sessionId} (full history in .jsonl)`);
    } else {
      // New session: no context needed
      console.log(`[Chat] New session: starting fresh`);
    }

    try {
      // Save user message to database with engine tracking
      try {
        const userMessage = Message.create(
          frontendConversationId,
          'user',
          message,
          { workspace: workspacePath },
          Date.now(),
          'claude'  // Engine tracking for context bridging
        );
        console.log(`[Chat] Saved user message: ${userMessage.id} (engine: claude)`);
        sessionManager.bumpSessionActivity(sessionId, 1);

      } catch (msgErr) {
        console.warn('[Chat] Failed to save user message:', msgErr.message);
      }

      // Call Claude Code wrapper with workspace path for --cwd
      const result = await claudeWrapper.sendMessage({
        prompt: promptToSend,
        conversationId: sessionId,
        model,
        workspacePath,  // Pass workspace for Claude CLI --cwd
        onStatus: (event) => {
          // Stream status events to client
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

      // Save assistant response to database with engine tracking
      try {
        const assistantMessage = Message.create(
          frontendConversationId,
          'assistant',
          result.text,
          { usage: result.usage, model },
          Date.now(),
          'claude'  // Engine tracking for context bridging
        );
        console.log(`[Chat] Saved assistant message: ${assistantMessage.id} (engine: claude)`);
        sessionManager.bumpSessionActivity(sessionId, 1);
      } catch (msgErr) {
        console.warn('[Chat] Failed to save assistant message:', msgErr.message);
      }

      // Sync from history after new session to persist in DB
      if (isNewChat) {
        try {
          await historySync.sync(true);
          invalidateConversations(); // Clear cache for fresh sidebar
          res.write(`data: ${JSON.stringify({
            type: 'session_created',
            sessionId,
            conversationId: frontendConversationId
          })}\n\n`);
        } catch (syncErr) {
          console.warn('[Chat] History sync failed after new chat:', syncErr.message);
        }

        // Generate AI title in background (fire-and-forget)
        // Don't await - user shouldn't wait for title generation
        summaryGenerator.generateTitle(message, result.text)
          .then(title => {
            sessionManager.updateSessionTitle(sessionId, title);
            console.log(`[Chat] AI-generated title: ${title}`);
          })
          .catch(err => {
            console.warn('[Chat] Title generation failed, using fallback:', err.message);
            // Fallback: use truncated first message
            const fallbackTitle = sessionManager.extractTitle(message);
            sessionManager.updateSessionTitle(sessionId, fallbackTitle);
          });
      }

      // Smart auto-summary: trigger based on message count and engine bridging
      if (contextBridge.shouldTriggerSummary(frontendConversationId, isEngineBridge)) {
        contextBridge.triggerSummaryGeneration(frontendConversationId, '[Chat]');
      }

      // Send completion event
      res.write(`data: ${JSON.stringify({
        type: 'message_done',
        messageId: `assistant-${Date.now()}`,
        content: result.text,
        usage: result.usage,
        sessionId,
        conversationId: frontendConversationId
      })}\n\n`);

      res.end();

    } catch (error) {
      console.error('[Chat] Error:', error);

      // Send error event
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);

      res.end();
    }

  } catch (error) {
    console.error('[Chat] Request error:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * POST /api/v1/chat/interrupt
 * Interrupt running Claude CLI process
 *
 * Request body:
 * {
 *   "sessionId": "uuid" - Session to interrupt
 * }
 *
 * Response:
 * {
 *   "success": boolean,
 *   "method": "esc" | "sigint" (if success),
 *   "reason": string (if failed)
 * }
 */
router.post('/interrupt', async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    console.log(`[Chat] Interrupt request for session: ${sessionId}`);

    const result = claudeWrapper.interrupt(sessionId);

    if (result.success) {
      console.log(`[Chat] Interrupted session ${sessionId} via ${result.method}`);
    } else {
      console.log(`[Chat] Failed to interrupt session ${sessionId}: ${result.reason}`);
    }

    res.json(result);
  } catch (error) {
    console.error('[Chat] Interrupt error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
