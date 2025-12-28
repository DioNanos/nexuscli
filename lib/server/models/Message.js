const { prepare } = require('../db');
const { v4: uuidv4 } = require('uuid');
const Conversation = require('./Conversation');

/**
 * Message model - Individual chat messages
 */
class Message {
  /**
   * Create new message
   * @param {string} conversationId - Parent conversation ID
   * @param {string} role - Message role ('user' | 'assistant' | 'system')
   * @param {string} content - Message content (markdown)
   * @param {Object} metadata - Optional metadata
   * @param {number} createdAt - Optional timestamp override
   * @param {string} engine - Engine used ('claude' | 'codex' | 'gemini' | 'qwen')
   * @returns {Object} Created message
   */
  static create(conversationId, role, content, metadata = null, createdAt = Date.now(), engine = 'claude') {
    const id = uuidv4();
    const now = createdAt || Date.now();

    const stmt = prepare(`
      INSERT INTO messages (id, conversation_id, role, content, created_at, metadata, engine)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      conversationId,
      role,
      content,
      now,
      metadata ? JSON.stringify(metadata) : null,
      engine
    );

    // Touch conversation (update updated_at)
    Conversation.touch(conversationId);

    return {
      id,
      conversation_id: conversationId,
      role,
      content,
      created_at: now,
      metadata,
      engine
    };
  }

  /**
   * Get message by ID
   * @param {string} id - Message ID
   * @returns {Object|null} Message or null if not found
   */
  static getById(id) {
    const stmt = prepare('SELECT * FROM messages WHERE id = ?');
    const message = stmt.get(id);

    if (message && message.metadata) {
      try {
        message.metadata = JSON.parse(message.metadata);
      } catch (e) {
        message.metadata = null;
      }
    }

    return message;
  }

  /**
   * Get messages for conversation
   * @param {string} conversationId - Conversation ID
   * @param {number} limit - Max messages to return
   * @param {number} offset - Offset for pagination
   * @returns {Array} List of messages
   */
  static getByConversation(conversationId, limit = 100, offset = 0) {
    const stmt = prepare(`
      SELECT * FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at ASC
      LIMIT ? OFFSET ?
    `);

    const messages = stmt.all(conversationId, limit, offset);

    // Parse metadata
    messages.forEach(msg => {
      if (msg.metadata) {
        try {
          msg.metadata = JSON.parse(msg.metadata);
        } catch (e) {
          msg.metadata = null;
        }
      }
    });

    return messages;
  }

  /**
   * Get recent messages (across all conversations)
   * @param {number} limit - Max messages
   * @returns {Array} List of messages
   */
  static getRecent(limit = 50) {
    const stmt = prepare(`
      SELECT * FROM messages
      ORDER BY created_at DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  }

  /**
   * Update message content
   * @param {string} id - Message ID
   * @param {string} content - New content
   */
  static updateContent(id, content) {
    const stmt = prepare(`
      UPDATE messages
      SET content = ?
      WHERE id = ?
    `);

    const info = stmt.run(content, id);
    return info.changes > 0;
  }

  /**
   * Delete message
   * @param {string} id - Message ID
   */
  static delete(id) {
    const stmt = prepare('DELETE FROM messages WHERE id = ?');
    const info = stmt.run(id);
    return info.changes > 0;
  }

  /**
   * Count messages in conversation
   * @param {string} conversationId - Conversation ID
   * @returns {number} Message count
   */
  static countByConversation(conversationId) {
    const stmt = prepare(`
      SELECT COUNT(*) as count FROM messages
      WHERE conversation_id = ?
    `);
    const result = stmt.get(conversationId);
    return result.count;
  }

  /**
   * Get last engine used in conversation
   * @param {string} conversationId - Conversation ID
   * @returns {string|null} Last engine ('claude' | 'codex') or null
   */
  static getLastEngine(conversationId) {
    const stmt = prepare(`
      SELECT engine FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const result = stmt.get(conversationId);
    return result?.engine || null;
  }

  /**
   * Get recent messages for context bridging
   * Returns last N messages formatted for context injection
   * @param {string} conversationId - Conversation ID
   * @param {number} limit - Max messages (default 5)
   * @returns {Array} Messages with role, content, engine
   */
  static getContextMessages(conversationId, limit = 5) {
    const stmt = prepare(`
      SELECT role, content, engine, created_at FROM messages
      WHERE conversation_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `);
    const messages = stmt.all(conversationId, limit);
    // Reverse to chronological order
    return messages.reverse();
  }

  /**
   * Build context string for engine bridging
   * @param {string} conversationId - Conversation ID
   * @param {string} newEngine - Engine being switched to
   * @param {number} limit - Max messages for context
   * @returns {string|null} Context string or null if no bridging needed
   */
  static buildBridgeContext(conversationId, newEngine, limit = 5) {
    const lastEngine = this.getLastEngine(conversationId);

    // No bridging needed if same engine or no previous messages
    if (!lastEngine || lastEngine === newEngine) {
      return null;
    }

    const messages = this.getContextMessages(conversationId, limit);
    if (messages.length === 0) {
      return null;
    }

    // Build context string
    const contextLines = messages.map(m => {
      const role = m.role === 'user' ? 'User' : 'Assistant';
      const engineTag = m.engine ? ` [${m.engine}]` : '';
      // Truncate long messages
      const content = m.content.length > 500
        ? m.content.substring(0, 500) + '...'
        : m.content;
      return `${role}${engineTag}: ${content}`;
    });

    return `[Context from previous ${lastEngine} session]\n${contextLines.join('\n\n')}`;
  }
}

module.exports = Message;
