/**
 * SessionManager - Session Sync Pattern Implementation (TRI CLI v0.4.0)
 *
 * Simplified session management for Claude/Codex/Gemini engines.
 * Principle: FILESYSTEM = SOURCE OF TRUTH
 *
 * Flow:
 * 1. Check if session file exists on filesystem
 * 2. If exists → reuse session
 * 3. If not → create new session, CLI will create file on first message
 *
 * @see docs/PLAN_TRI_CLI_ARCHITECTURE.md
 */

const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../db');

// Engine-specific session directories
const SESSION_DIRS = {
  claude: path.join(process.env.HOME || '', '.claude', 'projects'),
  codex: path.join(process.env.HOME || '', '.codex', 'sessions'),
  gemini: path.join(process.env.HOME || '', '.gemini', 'sessions'),
};

class SessionManager {
  constructor() {
    // RAM cache: Map<`${conversationId}:${engine}`, sessionId>
    this.sessionMap = new Map();

    // Track last access for cache cleanup
    this.lastAccess = new Map();

    // Cache TTL (30 minutes)
    this.cacheTTL = 30 * 60 * 1000;
  }

  /**
   * Get cache key for conversation + engine
   */
  _getCacheKey(conversationId, engine) {
    return `${conversationId}:${engine}`;
  }

  /**
   * Check if session file exists on disk
   * Claude: ~/.claude/projects/<workspace-slug>/<sessionId>.jsonl
   * Codex: Uses exec mode (no session files) - DB is source of truth
   * Gemini: ~/.gemini/sessions/<sessionId>.jsonl (if available)
   */
  sessionFileExists(sessionId, engine, workspacePath) {
    const normalizedEngine = this._normalizeEngine(engine);

    // Codex/Gemini exec mode doesn't create session files - trust DB mapping
    // Session continuity is managed via NexusCLI's message DB + contextBridge
    if (normalizedEngine === 'codex' || normalizedEngine === 'gemini') {
      return true; // Always trust DB for exec-mode CLI sessions
    }

    // For Claude: search ALL project folders (session might be in different workspace)
    if (normalizedEngine === 'claude') {
      try {
        const projectsDir = SESSION_DIRS.claude;
        if (fs.existsSync(projectsDir)) {
          const dirs = fs.readdirSync(projectsDir);
          for (const dir of dirs) {
            const sessionFile = path.join(projectsDir, dir, `${sessionId}.jsonl`);
            if (fs.existsSync(sessionFile)) {
              console.log(`[SessionManager] Claude session found: ${sessionFile}`);
              return true;
            }
          }
        }
      } catch (err) {
        console.warn(`[SessionManager] Claude session lookup failed:`, err.message);
      }
      return false;
    }

    try {
      const sessionPath = this.getSessionFilePath(sessionId, engine, workspacePath);
      if (!sessionPath) return false;
      return fs.existsSync(sessionPath);
    } catch (error) {
      console.warn(`[SessionManager] Error checking session file:`, error.message);
      return false;
    }
  }

  /**
   * Get the full path to a session file
   * @returns {string|null} Full path or null if engine not supported
   */
  getSessionFilePath(sessionId, engine, workspacePath) {
    const normalizedEngine = this._normalizeEngine(engine);

    switch (normalizedEngine) {
      case 'claude':
        // Claude stores sessions per workspace: ~/.claude/projects/<slug>/<sessionId>.jsonl
        const slug = this._pathToSlug(workspacePath);
        return path.join(SESSION_DIRS.claude, slug, `${sessionId}.jsonl`);

      case 'codex':
        // Codex may store sessions globally: ~/.codex/sessions/<sessionId>.jsonl
        return path.join(SESSION_DIRS.codex, `${sessionId}.jsonl`);

      case 'gemini':
        // Gemini sessions: ~/.gemini/sessions/<sessionId>.jsonl
        return path.join(SESSION_DIRS.gemini, `${sessionId}.jsonl`);

      default:
        console.warn(`[SessionManager] Unknown engine: ${engine}`);
        return null;
    }
  }

  /**
   * Normalize engine name (handle variants like 'claude-code')
   */
  _normalizeEngine(engine) {
    if (!engine) return 'claude';
    const lower = engine.toLowerCase();
    if (lower.includes('claude')) return 'claude';
    if (lower.includes('codex') || lower.includes('openai')) return 'codex';
    if (lower.includes('gemini') || lower.includes('google')) return 'gemini';
    return lower;
  }

  /**
   * Convert workspace path to slug (for .claude/projects/ directory)
   * Same as Claude Code: /path/to/dir → -path-to-dir
   * Fixed: dots are preserved to avoid collisions
   */
  _pathToSlug(workspacePath) {
    if (!workspacePath) return '-default';
    // Replace only slashes with dashes, preserve dots
    return workspacePath.replace(/\//g, '-');
  }

  /**
   * Generate workspace hash (legacy method, kept for compatibility)
   * @deprecated Use _pathToSlug instead (matches Claude Code behavior)
   */
  _getWorkspaceHash(workspacePath) {
    const crypto = require('crypto');
    return crypto.createHash('md5').update(workspacePath).digest('hex').substring(0, 8);
  }

  /**
   * Normalize workspace path (remove trailing slashes)
   * Prevents duplicate entries like /path and /path/
   */
  _normalizePath(workspacePath) {
    if (!workspacePath) return '';
    return workspacePath.replace(/\/+$/, '');
  }

  /**
   * Get or create session for conversation + engine
   *
   * SIMPLIFIED FLOW (TRI CLI v0.4.0):
   * 1. Check RAM cache (fastest)
   * 2. Check DB for existing mapping
   * 3. Verify session file exists on filesystem (source of truth)
   * 4. If invalid/missing → create new session
   * 5. Save to DB + RAM cache
   *
   * @param {string} conversationId - Frontend conversation ID
   * @param {string} engine - 'claude' | 'codex' | 'gemini'
   * @param {string} workspacePath - Workspace directory path
   * @returns {{ sessionId: string, isNew: boolean }}
   */
  async getOrCreateSession(conversationId, engine, workspacePath) {
    const normalizedEngine = this._normalizeEngine(engine);
    const normalizedPath = this._normalizePath(workspacePath);
    const cacheKey = this._getCacheKey(conversationId, normalizedEngine);

    console.log(`[SessionManager] getOrCreateSession(${conversationId}, ${normalizedEngine}, ${normalizedPath})`);

    // 1. Check RAM cache first (fastest path)
    if (this.sessionMap.has(cacheKey)) {
      const cachedId = this.sessionMap.get(cacheKey);

      // Verify it still exists on filesystem
      if (this.sessionFileExists(cachedId, normalizedEngine, normalizedPath)) {
        this.lastAccess.set(cacheKey, Date.now());
        console.log(`[SessionManager] Cache hit: ${cachedId}`);
        return { sessionId: cachedId, isNew: false };
      }

      // Invalid cache entry - remove it
      console.log(`[SessionManager] Cache entry invalid, removing: ${cachedId}`);
      this.sessionMap.delete(cacheKey);
    }

    // 2. Check DB for existing session mapping
    // Note: Frontend may send sessionId as conversationId, so check both columns
    try {
      const stmt = prepare(`
        SELECT id, workspace_path FROM sessions
        WHERE (conversation_id = ? OR id = ?) AND engine = ?
      `);
      const row = stmt.get(conversationId, conversationId, normalizedEngine);

      if (row) {
        // 3. Verify session file exists on filesystem
        if (this.sessionFileExists(row.id, normalizedEngine, row.workspace_path || normalizedPath)) {
          // Valid session - update cache and return
          this.sessionMap.set(cacheKey, row.id);
          this.lastAccess.set(cacheKey, Date.now());
          console.log(`[SessionManager] DB hit, verified: ${row.id}`);
          return { sessionId: row.id, isNew: false };
        }

        // Session file deleted - clean up DB entry
        console.log(`[SessionManager] Session ${row.id} file missing, cleaning up`);
        this._deleteSession(row.id);
      }
    } catch (dbErr) {
      console.warn(`[SessionManager] DB lookup failed:`, dbErr.message);
    }

    // 4. Create new session (file will be created by CLI on first message)
    const sessionId = uuidv4();
    const now = Date.now();
    console.log(`[SessionManager] Creating new session: ${sessionId} (${normalizedEngine})`);

    // 5. Save to DB (metadata only - file created by CLI)
    try {
      const insertStmt = prepare(`
        INSERT INTO sessions (id, workspace_path, engine, conversation_id, title, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const title = 'New Chat'; // Will be updated after first response
      insertStmt.run(sessionId, normalizedPath, normalizedEngine, conversationId, title, now, now);
      saveDb();
      console.log(`[SessionManager] Saved to DB: ${sessionId}`);
    } catch (dbErr) {
      console.error(`[SessionManager] DB save failed (continuing):`, dbErr.message);
      // Continue - session will work, just not persisted in DB
    }

    // 6. Save to RAM cache
    this.sessionMap.set(cacheKey, sessionId);
    this.lastAccess.set(cacheKey, Date.now());

    return { sessionId, isNew: true };
  }

  /**
   * Get existing session without creating new one
   */
  getSession(conversationId, engine) {
    const cacheKey = this._getCacheKey(conversationId, engine);

    // Check cache first
    if (this.sessionMap.has(cacheKey)) {
      this.lastAccess.set(cacheKey, Date.now());
      return this.sessionMap.get(cacheKey);
    }

    // Check DB
    try {
      const stmt = prepare(`
        SELECT id FROM sessions
        WHERE conversation_id = ? AND engine = ?
      `);
      const row = stmt.get(conversationId, engine);

      if (row) {
        this.sessionMap.set(cacheKey, row.id);
        this.lastAccess.set(cacheKey, Date.now());
        return row.id;
      }
    } catch (dbErr) {
      console.warn(`[SessionManager] DB lookup failed:`, dbErr.message);
    }

    return null;
  }

  /**
   * Delete session from DB
   */
  _deleteSession(sessionId) {
    try {
      const stmt = prepare('DELETE FROM sessions WHERE id = ?');
      stmt.run(sessionId);
      saveDb();
      console.log(`[SessionManager] Deleted session: ${sessionId}`);
    } catch (error) {
      console.error(`[SessionManager] Failed to delete session:`, error.message);
    }
  }

  /**
   * Convert workspace path to slug (matches Claude Code behavior)
   * /path/to/dir → -path-to-dir (also converts dots to dashes)
   */
  _pathToSlug(workspacePath) {
    if (!workspacePath) return '-default';
    return workspacePath.replace(/[\/\.]/g, '-');
  }

  /**
   * Delete all sessions for a conversation (cleanup)
   * Called when conversation is deleted
   * SYNC DELETE: Also removes the original .jsonl session files
   */
  deleteConversationSessions(conversationId) {
    console.log(`[SessionManager] Deleting all sessions for conversation: ${conversationId}`);

    try {
      // Get all sessions with workspace_path for file deletion
      const selectStmt = prepare('SELECT id, engine, workspace_path FROM sessions WHERE conversation_id = ?');
      const sessions = selectStmt.all(conversationId);

      let filesDeleted = 0;

      // Remove from cache AND delete session files
      for (const session of sessions) {
        const cacheKey = this._getCacheKey(conversationId, session.engine);
        this.sessionMap.delete(cacheKey);
        this.lastAccess.delete(cacheKey);

        // Delete the original .jsonl file (SYNC DELETE)
        const sessionFile = this._getSessionFilePath(session.id, session.engine, session.workspace_path);
        if (sessionFile && fs.existsSync(sessionFile)) {
          try {
            fs.unlinkSync(sessionFile);
            filesDeleted++;
            console.log(`[SessionManager] Deleted session file: ${sessionFile}`);
          } catch (e) {
            console.warn(`[SessionManager] Failed to delete file ${sessionFile}: ${e.message}`);
          }
        }
      }

      // Delete from DB
      const deleteStmt = prepare('DELETE FROM sessions WHERE conversation_id = ?');
      deleteStmt.run(conversationId);
      saveDb();

      console.log(`[SessionManager] Deleted ${sessions.length} sessions (${filesDeleted} files)`);
      return sessions.length;
    } catch (error) {
      console.error(`[SessionManager] Failed to delete conversation sessions:`, error.message);
      return 0;
    }
  }

  /**
   * Get the filesystem path for a session file
   */
  _getSessionFilePath(sessionId, engine, workspacePath) {
    const normalizedEngine = engine?.toLowerCase().includes('claude') ? 'claude'
      : engine?.toLowerCase().includes('codex') ? 'codex'
      : engine?.toLowerCase().includes('gemini') ? 'gemini'
      : 'claude';

    switch (normalizedEngine) {
      case 'claude':
        const slug = this._pathToSlug(workspacePath);
        return path.join(SESSION_DIRS.claude, slug, `${sessionId}.jsonl`);
      case 'codex':
        return path.join(SESSION_DIRS.codex, `${sessionId}.jsonl`);
      case 'gemini':
        return path.join(SESSION_DIRS.gemini, `${sessionId}.jsonl`);
      default:
        return null;
    }
  }

  /**
   * Update session title (called after first user message)
   * @param {string} sessionId
   * @param {string} title
   * @returns {boolean}
   */
  updateSessionTitle(sessionId, title) {
    try {
      const stmt = prepare(`UPDATE sessions SET title = ? WHERE id = ?`);
      stmt.run(title, sessionId);
      saveDb();
      console.log(`[SessionManager] Updated session ${sessionId} title: ${title}`);
      return true;
    } catch (error) {
      console.error(`[SessionManager] Failed to update title:`, error.message);
      return false;
    }
  }

  /**
   * Extract title from message (50 chars, word boundary)
   * @param {string} message
   * @returns {string}
   */
  extractTitle(message) {
    if (!message || message.trim() === '') return 'New Chat';

    // Clean up: normalize whitespace, remove newlines
    const cleaned = message.replace(/\s+/g, ' ').trim();

    if (cleaned.length <= 50) {
      return cleaned;
    }

    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');

    // Cut at word boundary if space found after first 20 chars
    if (lastSpace > 20) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Update session's conversation_id mapping
   * Used when a new conversation needs to use an existing session
   */
  updateSessionConversation(sessionId, conversationId, engine) {
    try {
      const stmt = prepare(`
        UPDATE sessions SET conversation_id = ?, last_used_at = ? WHERE id = ?
      `);
      stmt.run(conversationId, Date.now(), sessionId);
      saveDb();

      // Update cache
      const cacheKey = this._getCacheKey(conversationId, engine);
      this.sessionMap.set(cacheKey, sessionId);
      this.lastAccess.set(cacheKey, Date.now());

      console.log(`[SessionManager] Updated session ${sessionId} → conversation ${conversationId}`);
      return true;
    } catch (error) {
      console.error(`[SessionManager] Failed to update session:`, error.message);
      return false;
    }
  }

  /**
   * Get all sessions for a conversation
   */
  getConversationSessions(conversationId) {
    try {
      const stmt = prepare(`
        SELECT id, engine, workspace_path, created_at, updated_at
        FROM sessions
        WHERE conversation_id = ?
      `);
      return stmt.all(conversationId);
    } catch (error) {
      console.error(`[SessionManager] Failed to get conversation sessions:`, error.message);
      return [];
    }
  }

  /**
   * Clean expired cache entries
   */
  cleanCache() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, lastAccess] of this.lastAccess.entries()) {
      if (now - lastAccess > this.cacheTTL) {
        this.sessionMap.delete(key);
        this.lastAccess.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      console.log(`[SessionManager] Cleaned ${cleaned} expired cache entries`);
    }

    return cleaned;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      cacheSize: this.sessionMap.size,
      cacheTTL: this.cacheTTL,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get native thread ID for Codex/Gemini sessions
   * Uses session_path column to store native CLI thread ID
   * @param {string} sessionId - NexusCLI session ID
   * @returns {string|null} Native thread ID or null
   */
  getNativeThreadId(sessionId) {
    try {
      const stmt = prepare('SELECT session_path FROM sessions WHERE id = ?');
      const row = stmt.get(sessionId);
      return row?.session_path || null;
    } catch (error) {
      console.warn(`[SessionManager] Failed to get native threadId:`, error.message);
      return null;
    }
  }

  /**
   * Set native thread ID for Codex/Gemini sessions
   * @param {string} sessionId - NexusCLI session ID
   * @param {string} threadId - Native CLI thread ID
   */
  setNativeThreadId(sessionId, threadId) {
    if (!threadId) return;
    try {
      const stmt = prepare('UPDATE sessions SET session_path = ? WHERE id = ?');
      stmt.run(threadId, sessionId);
      saveDb();
      console.log(`[SessionManager] Set native threadId: ${sessionId} → ${threadId}`);
    } catch (error) {
      console.warn(`[SessionManager] Failed to set native threadId:`, error.message);
    }
  }
}

// Singleton instance
const sessionManager = new SessionManager();

// Periodic cache cleanup (every 10 minutes)
setInterval(() => {
  sessionManager.cleanCache();
}, 10 * 60 * 1000);

module.exports = sessionManager;
