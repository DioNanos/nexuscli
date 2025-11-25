const fs = require('fs');
const path = require('path');
const readline = require('readline');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { prepare } = require('../db');

/**
 * HistorySync - Sync Claude Code history.jsonl with database
 *
 * Reads ~/.claude/history.jsonl (JSONL format) and syncs to SQLite:
 * - Groups messages by sessionId
 * - Creates conversations (id = sessionId)
 * - Populates messages table
 * - Extracts title from first message display
 *
 * Architecture:
 * - Claude Code saves all messages to history.jsonl natively
 * - This service bridges history.jsonl → SQLite database
 * - Frontend sidebar reads from database (synced from history)
 *
 * Features:
 * - Incremental sync (only new messages)
 * - Grouped by date (today, yesterday, last 7 days, etc.)
 * - Preserves sessionId for resume (-r flag)
 */
class HistorySync {
  constructor(options = {}) {
    // Default to user's home directory
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    this.historyPath = options.historyPath || path.join(homeDir, '.claude', 'history.jsonl');
    this.lastSyncTime = 0;
    this.syncCacheMs = options.syncCacheMs || 30000; // Cache for 30 seconds
  }

  /**
   * Check if history file exists
   */
  exists() {
    try {
      return fs.existsSync(this.historyPath);
    } catch (error) {
      console.error('[HistorySync] Error checking history file:', error);
      return false;
    }
  }

  /**
   * Parse history.jsonl and group by sessionId
   * @returns {Promise<Map<sessionId, Session>>}
   */
  async parseHistory() {
    const startTime = Date.now();
    const sessions = new Map();
    let totalMessages = 0;

    if (!this.exists()) {
      console.warn(`[HistorySync] History file not found: ${this.historyPath}`);
      return sessions;
    }

    const fileStream = fs.createReadStream(this.historyPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        totalMessages++;

        // Only process entries with sessionId
        if (!entry.sessionId) continue;

        const timestamp = entry.timestamp || Date.now();

        // Initialize session bag
        if (!sessions.has(entry.sessionId)) {
          sessions.set(entry.sessionId, {
            id: entry.sessionId,
            project: entry.project || null,
            messages: [],
            firstTimestamp: timestamp,
            lastTimestamp: timestamp
          });
        }

        const session = sessions.get(entry.sessionId);

        session.messages.push({
          display: entry.display || '',
          timestamp,
          project: entry.project || null,
          pastedContents: entry.pastedContents || {}
        });

        session.firstTimestamp = Math.min(session.firstTimestamp, timestamp);
        session.lastTimestamp = Math.max(session.lastTimestamp, timestamp);

        // Keep most recent non-null project as workspace hint
        if (entry.project) {
          session.project = entry.project;
        }
      } catch (parseError) {
        console.error('[HistorySync] Failed to parse line:', parseError.message);
      }
    }

    const parseTime = Date.now() - startTime;
    console.log(`[HistorySync] Parsed ${totalMessages} messages from history.jsonl in ${parseTime}ms`);
    console.log(`[HistorySync] Found ${sessions.size} unique sessions`);

    return sessions;
  }

  /**
   * Sync history to database
   * @param {Map<string, Session>|boolean} sessionsOrForce - Session map or force flag
   * @param {Object} options
   * @param {boolean} options.force - Force sync even if cache is valid
   * @returns {Promise<{synced: number, skipped: number, cached?: boolean}>}
   */
  async syncToDatabase(sessionsOrForce = false, options = {}) {
    let sessions = null;
    let force = false;

    if (sessionsOrForce instanceof Map) {
      sessions = sessionsOrForce;
      force = Boolean(options.force);
    } else {
      force = Boolean(sessionsOrForce);
    }

    const now = Date.now();

    // Check cache (only when we are allowed to self-parse)
    if (!sessions && !force && (now - this.lastSyncTime) < this.syncCacheMs) {
      console.log('[HistorySync] Using cached sync (< 30s old)');
      return { synced: 0, skipped: 0, cached: true };
    }

    const startTime = Date.now();
    const parsedSessions = sessions || await this.parseHistory();

    let conversationsCreated = 0;
    let messagesCreated = 0;
    let conversationsSkipped = 0;

    // Process each session
    for (const [sessionId, sessionData] of parsedSessions.entries()) {
      if (!sessionData.messages || sessionData.messages.length === 0) continue;

      // Sort messages by timestamp
      const messages = [...sessionData.messages].sort((a, b) => a.timestamp - b.timestamp);

      // Check if conversation exists
      let conversation = Conversation.getById(sessionId);

      if (!conversation) {
        // Create new conversation
        const firstMessage = messages[0];
        const title = this.extractTitle(firstMessage.display);

        try {
          // Use sessionId as conversation ID
          conversation = {
            id: sessionId,
            title,
            created_at: sessionData.firstTimestamp || firstMessage.timestamp,
            updated_at: sessionData.lastTimestamp || messages[messages.length - 1].timestamp,
            metadata: sessionData.project ? JSON.stringify({ workspace: sessionData.project }) : null
          };

          // Insert directly (bypass UUID generation in Conversation.create)
          const stmt = prepare(`
            INSERT OR REPLACE INTO conversations (id, title, created_at, updated_at, metadata)
            VALUES (?, ?, ?, ?, ?)
          `);
          stmt.run(sessionId, title, conversation.created_at, conversation.updated_at, conversation.metadata);

          conversationsCreated++;
          console.log(`[HistorySync] Created conversation: ${sessionId} - "${title}"`);

        } catch (error) {
          console.error(`[HistorySync] Failed to create conversation ${sessionId}:`, error.message);
          continue;
        }
      } else {
        conversationsSkipped++;
      }

      // Get existing messages for this conversation
      const existingMessages = Message.getByConversation(sessionId);
      const existingTimestamps = new Set(existingMessages.map(m => m.created_at));
      let newMessagesForSession = 0;
      let sessionInserted = false;

      // Insert new messages
      for (const historyMsg of messages) {
        // Skip if message already exists (by timestamp)
        if (existingTimestamps.has(historyMsg.timestamp)) continue;

        try {
          Message.create(
            sessionId,
            'user', // All history entries are user messages
            historyMsg.display,
            {
              project: historyMsg.project,
              pastedContents: historyMsg.pastedContents
            },
            historyMsg.timestamp
          );
          messagesCreated++;
          newMessagesForSession++;
        } catch (error) {
          console.error(`[HistorySync] Failed to create message:`, error.message);
        }
      }

      // Ensure session row exists (for workspace filtering)
      try {
        const sessionCheckStmt = prepare('SELECT id FROM sessions WHERE id = ?');
        const hasSession = sessionCheckStmt.get(sessionId);

        if (!hasSession) {
          const insertSessionStmt = prepare(`
            INSERT INTO sessions (
              id, engine, workspace_path, session_path, title,
              last_used_at, created_at, pinned, importance, message_count, metadata,
              conversation_id
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          insertSessionStmt.run(
            sessionId,
            'claude-code',
            sessionData.project || process.cwd(),
            null,
            conversation.title,
            conversation.updated_at,
            conversation.created_at,
            0,
            0,
            existingMessages.length + newMessagesForSession,
            conversation.metadata,
            sessionId  // conversation_id = sessionId for history sync
          );
          sessionInserted = true;
        }
      } catch (sessionErr) {
        console.warn('[HistorySync] Failed to ensure session row:', sessionErr.message);
      }

      // Update sessions.message_count / last_used_at if we added new messages
      if (newMessagesForSession > 0 && !sessionInserted) {
        try {
          const updateSessionStmt = prepare(`
            UPDATE sessions
            SET message_count = COALESCE(message_count, 0) + ?, last_used_at = ?
            WHERE id = ?
          `);
          updateSessionStmt.run(newMessagesForSession, sessionData.lastTimestamp || Date.now(), sessionId);
        } catch (updateErr) {
          console.warn('[HistorySync] Failed to update session counters:', updateErr.message);
        }
      }
    }

    const syncTime = Date.now() - startTime;
    this.lastSyncTime = now;

    console.log(`[HistorySync] Sync completed in ${syncTime}ms`);
    console.log(`[HistorySync] - Conversations: ${conversationsCreated} created, ${conversationsSkipped} skipped`);
    console.log(`[HistorySync] - Messages: ${messagesCreated} created`);

    return {
      synced: conversationsCreated + messagesCreated,
      skipped: conversationsSkipped,
      newConversations: conversationsCreated,
      newMessages: messagesCreated,
      cached: false
    };
  }

  /**
   * Wrapper to perform full sync with cache control
   * @param {boolean} force
   */
  async sync(force = false) {
    const sessions = await this.parseHistory();
    return this.syncToDatabase(sessions, { force });
  }

  /**
   * Extract conversation title from display message
   * @param {string} display - First message display text
   * @returns {string} Title (max 80 chars)
   */
  extractTitle(display) {
    if (!display) return 'Untitled Conversation';

    // Truncate to 80 characters
    let title = display.substring(0, 80);

    // If truncated, add ellipsis
    if (display.length > 80) {
      title += '...';
    }

    return title;
  }

  /**
   * Get grouped conversations by date
   * @returns {Promise<Object>} Grouped conversations
   */
  async getGroupedConversations() {
    // Sync first
    await this.syncToDatabase();

    // Use existing Conversation.listGroupedByDate()
    return Conversation.listGroupedByDate();
  }

  /**
   * Get conversations filtered by workspace (sessions.workspace_path)
   * @param {string} workspacePath
   * @param {number} limit - Max conversations (default: 50)
   * @returns {Promise<Object>} Grouped by date like listGroupedByDate
   */
  async getWorkspaceSessions(workspacePath, limit = 50) {
    if (!workspacePath) return { today: [], yesterday: [], last7days: [], last30days: [], older: [] };

    // Skip sync if cached - workspace query is fast enough
    // await this.sync(); // Removed - too slow!

    try {
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;

      // Optimized query: use index on workspace_path, limit results
      const stmt = prepare(`
        SELECT c.*,
          CASE
            WHEN (? - c.updated_at) < ? THEN 'today'
            WHEN (? - c.updated_at) < ? THEN 'yesterday'
            WHEN (? - c.updated_at) < ? THEN 'last7days'
            WHEN (? - c.updated_at) < ? THEN 'last30days'
            ELSE 'older'
          END as date_group
        FROM conversations c
        INNER JOIN sessions s ON c.id = s.id
        WHERE s.workspace_path = ?
        ORDER BY c.updated_at DESC
        LIMIT ?
      `);

      const rows = stmt.all(
        now, oneDayMs,           // today
        now, 2 * oneDayMs,       // yesterday
        now, 7 * oneDayMs,       // last7days
        now, 30 * oneDayMs,      // last30days
        workspacePath,
        limit
      );

      // Group results
      const grouped = {
        today: [],
        yesterday: [],
        last7days: [],
        last30days: [],
        older: []
      };

      for (const row of rows) {
        const group = row.date_group;
        delete row.date_group;

        // Parse metadata
        if (row.metadata) {
          try {
            row.metadata = JSON.parse(row.metadata);
            if (row.metadata.bookmarked !== undefined) {
              row.metadata.pinned = row.metadata.bookmarked;
            }
          } catch (e) {
            row.metadata = null;
          }
        }

        grouped[group].push(row);
      }

      return grouped;
    } catch (err) {
      console.error('[HistorySync] Workspace filter error:', err.message);
      return { today: [], yesterday: [], last7days: [], last30days: [], older: [] };
    }
  }
}

module.exports = HistorySync;
