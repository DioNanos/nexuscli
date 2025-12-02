/**
 * CliLoader - Unified message loader for TRI CLI (Claude/Codex/Gemini)
 *
 * Loads messages on-demand from CLI history files (lazy loading).
 * Filesystem is the source of truth - no DB caching of messages.
 *
 * Session file locations:
 * - Claude: ~/.claude/projects/<workspace-slug>/<sessionId>.jsonl
 * - Codex:  ~/.codex/sessions/<sessionId>.jsonl (if available)
 * - Gemini: ~/.gemini/sessions/<sessionId>.jsonl (if available)
 *
 * @version 0.4.0 - TRI CLI Support
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DEFAULT_LIMIT = 30;

// Engine-specific paths
const ENGINE_PATHS = {
  claude: path.join(process.env.HOME || '', '.claude'),
  codex: path.join(process.env.HOME || '', '.codex'),
  gemini: path.join(process.env.HOME || '', '.gemini'),
};

class CliLoader {
  constructor() {
    this.claudePath = ENGINE_PATHS.claude;
    this.codexPath = ENGINE_PATHS.codex;
    this.geminiPath = ENGINE_PATHS.gemini;
  }

  /**
   * Load messages from CLI history by session.
   * Supports all three engines: Claude, Codex, Gemini.
   *
   * @param {Object} params
   * @param {string} params.sessionId - Session UUID
   * @param {string} params.engine - 'claude'|'claude-code'|'codex'|'gemini'
   * @param {string} params.workspacePath - Workspace directory (required for Claude)
   * @param {number} [params.limit=30] - Max messages to return
   * @param {number} [params.before] - Timestamp cursor for pagination (ms)
   * @param {string} [params.mode='asc'] - Return order ('asc'|'desc')
   * @returns {Promise<{messages: Array, pagination: Object}>}
   */
  async loadMessagesFromCLI({
    sessionId,
    threadId,          // optional native thread id (e.g., Codex exec thread)
    sessionPath,       // alias for compatibility
    engine = 'claude',
    workspacePath,
    limit = DEFAULT_LIMIT,
    before,
    mode = 'asc'
  }) {
    if (!sessionId) {
      throw new Error('sessionId is required');
    }

    const startedAt = Date.now();
    const normalizedEngine = this._normalizeEngine(engine);
    const nativeId = threadId || sessionPath || sessionId;

    let result;
    switch (normalizedEngine) {
      case 'claude':
        result = await this.loadClaudeMessages({ sessionId, workspacePath, limit, before, mode });
        break;

      case 'codex':
        result = await this.loadCodexMessages({ sessionId, nativeId, limit, before, mode });
        break;

      case 'gemini':
        result = await this.loadGeminiMessages({ sessionId, limit, before, mode });
        break;

      default:
        throw new Error(`Unsupported engine: ${engine}`);
    }

    console.log(`[CliLoader] ${normalizedEngine} messages loaded in ${Date.now() - startedAt}ms (session ${sessionId}, ${result.messages.length} msgs)`);
    return result;
  }

  /**
   * Normalize engine name variants
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
   * Same as Claude Code behavior: /path/to/dir → -path-to-dir
   * Also converts dots to dashes (e.g., com.termux → com-termux)
   */
  pathToSlug(workspacePath) {
    if (!workspacePath) return '-default';
    // Replace slashes AND dots with dashes (matches Claude Code behavior)
    return workspacePath.replace(/[\/\.]/g, '-');
  }

  // ============================================================
  // CLAUDE - Load from ~/.claude/projects/<slug>/<sessionId>.jsonl
  // ============================================================

  async loadClaudeMessages({ sessionId, workspacePath, limit, before, mode }) {
    if (!workspacePath) {
      console.warn('[CliLoader] No workspacePath for Claude, using cwd');
      workspacePath = process.cwd();
    }

    const slug = this.pathToSlug(workspacePath);
    const sessionFile = path.join(this.claudePath, 'projects', slug, `${sessionId}.jsonl`);

    if (!fs.existsSync(sessionFile)) {
      console.warn(`[CliLoader] Claude session file not found: ${sessionFile}`);
      return this._emptyResult();
    }

    const rawMessages = await this._parseJsonlFile(sessionFile);

    // Filter and normalize
    const messages = rawMessages
      .filter(entry => entry.type === 'user' || entry.type === 'assistant')
      .map(entry => this._normalizeClaudeEntry(entry));

    return this._paginateMessages(messages, limit, before, mode);
  }

  /**
   * Normalize Claude Code session entry to message shape
   */
  _normalizeClaudeEntry(entry) {
    // Extract content - handle both string and array of content blocks
    let content = '';
    const rawContent = entry.message?.content;

    if (typeof rawContent === 'string') {
      content = rawContent;
    } else if (Array.isArray(rawContent)) {
      // Claude Code uses array of content blocks: [{type: 'text', text: '...'}, ...]
      content = rawContent
        .filter(block => block.type === 'text' && block.text)
        .map(block => block.text)
        .join('\n');
    } else if (entry.display || entry.text) {
      // Fallback for older formats
      content = entry.display || entry.text || '';
    }

    const role = entry.message?.role || entry.type || 'assistant';
    const created_at = new Date(entry.timestamp).getTime() || Date.now();

    return {
      id: entry.message?.id || `claude-${created_at}`,
      role,
      content,
      engine: 'claude',
      created_at,
      metadata: {
        model: entry.message?.model,
        stop_reason: entry.message?.stop_reason
      }
    };
  }

  // ============================================================
  // CODEX - Load from ~/.codex/sessions/<sessionId>.jsonl
  // ============================================================

  async loadCodexMessages({ sessionId, nativeId, limit, before, mode }) {
    const baseDir = path.join(this.codexPath, 'sessions');
    let sessionFile = path.join(baseDir, `${nativeId || sessionId}.jsonl`);

    // If flat file missing, search nested rollout-* files by threadId
    if (!fs.existsSync(sessionFile)) {
      sessionFile = this.findCodexSessionFile(baseDir, nativeId || sessionId);
    }

    // Codex exec may not persist sessions; handle gracefully
    if (!sessionFile || !fs.existsSync(sessionFile)) {
      console.log(`[CliLoader] Codex session file not found (id=${nativeId || sessionId})`);
      return this._emptyResult();
    }

    const rawMessages = await this._parseJsonlFile(sessionFile);

    // Normalize then filter only chat messages
    const messages = rawMessages
      .map(entry => this._normalizeCodexEntry(entry))
      .filter(msg => msg && (msg.role === 'user' || msg.role === 'assistant'));

    return this._paginateMessages(messages, limit, before, mode);
  }

  /**
   * Normalize Codex session entry to message shape
   */
  _normalizeCodexEntry(entry) {
    // Skip non-chat bookkeeping events
    const skipTypes = ['session_meta', 'turn_context', 'event_msg', 'token_count'];
    if (skipTypes.includes(entry.type)) return null;

    const role =
      entry.role ||
      entry.payload?.role ||
      (entry.payload?.type === 'message' ? entry.payload.role : null) ||
      entry.message?.role ||
      'assistant';

    const created_at = entry.timestamp
      ? new Date(entry.timestamp).getTime()
      : (entry.payload?.timestamp ? new Date(entry.payload.timestamp).getTime() : Date.now());

    // Codex may store content in multiple shapes
    let content = '';
    if (typeof entry.content === 'string') {
      content = entry.content;
    } else if (typeof entry.payload?.content === 'string') {
      content = entry.payload.content;
    } else if (Array.isArray(entry.payload?.content)) {
      content = entry.payload.content
        .map(block => block.text || block.message || block.title || '')
        .filter(Boolean)
        .join('\n');
    } else if (entry.payload?.text) {
      content = entry.payload.text;
    } else if (entry.message) {
      content = typeof entry.message === 'string' ? entry.message : JSON.stringify(entry.message);
    }

    return {
      id: entry.id || `codex-${created_at}`,
      role,
      content,
      engine: 'codex',
      created_at,
      metadata: {
        model: entry.model,
        reasoning_effort: entry.reasoning_effort
      }
    };
  }

  /**
   * Find Codex rollout file by threadId within YYYY/MM/DD directories
   */
  findCodexSessionFile(baseDir, threadId) {
    if (!threadId || !fs.existsSync(baseDir)) return null;
    try {
      const years = fs.readdirSync(baseDir);
      for (const year of years) {
        const yearPath = path.join(baseDir, year);
        if (!fs.statSync(yearPath).isDirectory()) continue;
        const months = fs.readdirSync(yearPath);
        for (const month of months) {
          const monthPath = path.join(yearPath, month);
          if (!fs.statSync(monthPath).isDirectory()) continue;
          const days = fs.readdirSync(monthPath);
          for (const day of days) {
            const dayPath = path.join(monthPath, day);
            if (!fs.statSync(dayPath).isDirectory()) continue;
            const files = fs.readdirSync(dayPath);
            for (const file of files) {
              if (file.endsWith('.jsonl') && file.includes(threadId)) {
                return path.join(dayPath, file);
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[CliLoader] Failed to search Codex session file: ${err.message}`);
    }
    return null;
  }

  // ============================================================
  // GEMINI - Load from ~/.gemini/sessions/<sessionId>.jsonl
  // ============================================================

  async loadGeminiMessages({ sessionId, limit, before, mode }) {
    const sessionFile = path.join(this.geminiPath, 'sessions', `${sessionId}.jsonl`);

    // Gemini CLI may not save sessions - check if file exists
    if (!fs.existsSync(sessionFile)) {
      console.log(`[CliLoader] Gemini session file not found: ${sessionFile}`);
      return this._emptyResult();
    }

    const rawMessages = await this._parseJsonlFile(sessionFile);

    // Filter and normalize
    const messages = rawMessages
      .filter(entry => entry.role === 'user' || entry.role === 'model' || entry.role === 'assistant')
      .map(entry => this._normalizeGeminiEntry(entry));

    return this._paginateMessages(messages, limit, before, mode);
  }

  /**
   * Normalize Gemini session entry to message shape
   */
  _normalizeGeminiEntry(entry) {
    // Gemini uses 'model' instead of 'assistant'
    const role = entry.role === 'model' ? 'assistant' : (entry.role || 'assistant');
    const created_at = entry.timestamp ? new Date(entry.timestamp).getTime() : Date.now();

    // Gemini content format
    let content = '';
    if (typeof entry.content === 'string') {
      content = entry.content;
    } else if (Array.isArray(entry.parts)) {
      // Gemini uses parts array: [{text: '...'}]
      content = entry.parts
        .filter(p => p.text)
        .map(p => p.text)
        .join('\n');
    } else if (entry.text) {
      content = entry.text;
    }

    return {
      id: entry.id || `gemini-${created_at}`,
      role,
      content,
      engine: 'gemini',
      created_at,
      metadata: {
        model: entry.model
      }
    };
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Parse JSONL file line by line (memory efficient)
   */
  async _parseJsonlFile(filePath) {
    const entries = [];

    const fileStream = fs.createReadStream(filePath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });

    for await (const line of rl) {
      if (!line.trim()) continue;

      try {
        const entry = JSON.parse(line);
        entries.push(entry);
      } catch (e) {
        // Skip malformed lines
        console.warn(`[CliLoader] Skipping malformed JSON line in ${filePath}`);
      }
    }

    return entries;
  }

  /**
   * Apply pagination to messages array
   */
  _paginateMessages(messages, limit, before, mode) {
    // Filter by timestamp if 'before' cursor provided
    let filtered = messages;
    if (before) {
      filtered = messages.filter(m => m.created_at < Number(before));
    }

    // Sort newest first for pagination slicing
    filtered.sort((a, b) => b.created_at - a.created_at);

    // Apply limit
    const page = filtered.slice(0, limit);
    const hasMore = filtered.length > limit;
    const oldestTimestamp = page.length ? page[page.length - 1].created_at : null;

    // Return in requested order (default asc for UI rendering)
    const ordered = mode === 'desc'
      ? page
      : [...page].sort((a, b) => a.created_at - b.created_at);

    return {
      messages: ordered,
      pagination: {
        hasMore,
        oldestTimestamp,
        total: messages.length
      }
    };
  }

  /**
   * Return empty result structure
   */
  _emptyResult() {
    return {
      messages: [],
      pagination: {
        hasMore: false,
        oldestTimestamp: null,
        total: 0
      }
    };
  }

  /**
   * Get session file path for an engine
   * Useful for external checks
   */
  getSessionFilePath(sessionId, engine, workspacePath) {
    const normalizedEngine = this._normalizeEngine(engine);

    switch (normalizedEngine) {
      case 'claude':
        const slug = this.pathToSlug(workspacePath);
        return path.join(this.claudePath, 'projects', slug, `${sessionId}.jsonl`);

      case 'codex':
        return path.join(this.codexPath, 'sessions', `${sessionId}.jsonl`);

      case 'gemini':
        return path.join(this.geminiPath, 'sessions', `${sessionId}.jsonl`);

      default:
        return null;
    }
  }
}

module.exports = CliLoader;
