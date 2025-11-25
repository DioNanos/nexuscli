const { prepare } = require('../db');
const { v4: uuidv4 } = require('uuid');

/**
 * Conversation model - Manages chat sessions
 */
class Conversation {
  /**
   * Create new conversation
   * @param {string} title - Conversation title
   * @returns {Object} Created conversation
   */
  static create(title = 'New Conversation', workspacePath = null) {
    const id = uuidv4();
    const now = Date.now();

    // Insert conversation
    const stmt = prepare(`
      INSERT INTO conversations (id, title, created_at, updated_at)
      VALUES (?, ?, ?, ?)
    `);

    stmt.run(id, title, now, now);

    // Also create session entry (for sidebar visibility)
    // Use workspace where Claude CLI is executed (backend workdir)
    const workspace = workspacePath || process.cwd();

    const sessionStmt = prepare(`
      INSERT INTO sessions (
        id, engine, workspace_path, title,
        last_used_at, created_at, message_count
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    sessionStmt.run(
      id,
      'claude-code',
      workspace,
      title,
      now,
      now,
      0
    );

    console.log(`[Conversation] Created conversation + session: ${id} in workspace ${workspace}`);

    return {
      id,
      title,
      created_at: now,
      updated_at: now,
      metadata: null
    };
  }

  /**
   * Get conversation by ID
   * @param {string} id - Conversation ID
   * @returns {Object|null} Conversation or null if not found
   */
  static getById(id) {
    const stmt = prepare('SELECT * FROM conversations WHERE id = ?');
    const conversation = stmt.get(id);

    if (conversation && conversation.metadata) {
      try {
        conversation.metadata = JSON.parse(conversation.metadata);
        // Map bookmarked to pinned for frontend compatibility
        if (conversation.metadata.bookmarked !== undefined) {
          conversation.metadata.pinned = conversation.metadata.bookmarked;
        }
      } catch (e) {
        conversation.metadata = null;
      }
    }

    return conversation;
  }

  /**
   * List recent conversations
   * @param {number} limit - Max number of conversations
   * @returns {Array} List of conversations
   */
  static listRecent(limit = 20) {
    const stmt = prepare(`
      SELECT * FROM conversations
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    const conversations = stmt.all(limit);

    // Parse metadata and map bookmarked to pinned
    conversations.forEach(conv => {
      if (conv.metadata) {
        try {
          conv.metadata = JSON.parse(conv.metadata);
          // Map bookmarked to pinned for frontend compatibility
          if (conv.metadata.bookmarked !== undefined) {
            conv.metadata.pinned = conv.metadata.bookmarked;
          }
        } catch (e) {
          conv.metadata = null;
        }
      }
    });

    return conversations;
  }

  /**
   * Update conversation title
   * @param {string} id - Conversation ID
   * @param {string} title - New title
   */
  static updateTitle(id, title) {
    const stmt = prepare(`
      UPDATE conversations
      SET title = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(title, Date.now(), id);
  }

  /**
   * Touch conversation (update updated_at)
   * @param {string} id - Conversation ID
   */
  static touch(id) {
    const stmt = prepare(`
      UPDATE conversations
      SET updated_at = ?
      WHERE id = ?
    `);

    stmt.run(Date.now(), id);
  }

  /**
   * Update metadata
   * @param {string} id - Conversation ID
   * @param {Object} metadata - Metadata object
   */
  static updateMetadata(id, metadata) {
    const stmt = prepare(`
      UPDATE conversations
      SET metadata = ?, updated_at = ?
      WHERE id = ?
    `);

    stmt.run(JSON.stringify(metadata), Date.now(), id);
  }

  /**
   * Delete conversation (cascade deletes messages)
   * @param {string} id - Conversation ID
   */
  static delete(id) {
    const stmt = prepare('DELETE FROM conversations WHERE id = ?');
    stmt.run(id);
  }

  /**
   * Count total conversations
   * @returns {number} Total count
   */
  static count() {
    const stmt = prepare('SELECT COUNT(*) as count FROM conversations');
    const result = stmt.get();
    return result ? result.count : 0;
  }

  /**
   * List conversations grouped by date
   * @param {number} limit - Max conversations per group (default: 20, 0 = unlimited)
   * @returns {Object} Conversations grouped by: today, yesterday, last7days, last30days
   */
  static listGroupedByDate(limit = 20) {
    // Use SQL CASE for date grouping - much faster than JS loop
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    const stmt = prepare(`
      SELECT *,
        CASE
          WHEN (? - updated_at) < ? THEN 'today'
          WHEN (? - updated_at) < ? THEN 'yesterday'
          WHEN (? - updated_at) < ? THEN 'last7days'
          WHEN (? - updated_at) < ? THEN 'last30days'
          ELSE 'older'
        END as date_group
      FROM conversations
      ORDER BY updated_at DESC
      ${limit > 0 ? `LIMIT ${limit * 5}` : ''}
    `);

    const conversations = stmt.all(
      now, oneDayMs,           // today
      now, 2 * oneDayMs,       // yesterday
      now, 7 * oneDayMs,       // last7days
      now, 30 * oneDayMs       // last30days
    );

    const grouped = {
      today: [],
      yesterday: [],
      last7days: [],
      last30days: [],
      older: []
    };

    // Single pass - group and parse metadata
    for (const conv of conversations) {
      const group = conv.date_group;
      delete conv.date_group; // Clean up temp field

      // Parse metadata
      if (conv.metadata) {
        try {
          conv.metadata = JSON.parse(conv.metadata);
          if (conv.metadata.bookmarked !== undefined) {
            conv.metadata.pinned = conv.metadata.bookmarked;
          }
        } catch (e) {
          conv.metadata = null;
        }
      }

      // Add to group (respect limit per group)
      if (limit === 0 || grouped[group].length < limit) {
        grouped[group].push(conv);
      }
    }

    return grouped;
  }

  /**
   * Toggle bookmark status
   * @param {string} id - Conversation ID
   * @returns {boolean} New bookmark status
   */
  static toggleBookmark(id) {
    const conversation = this.getById(id);
    if (!conversation) return null;

    const metadata = conversation.metadata || {};
    metadata.bookmarked = !metadata.bookmarked;

    this.updateMetadata(id, metadata);
    return metadata.bookmarked;
  }
}

module.exports = Conversation;
