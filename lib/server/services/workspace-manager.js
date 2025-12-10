const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { prepare } = require('../db');

/**
 * Workspace Manager - Index CLI sessions by workspace
 */
class WorkspaceManager {
  constructor() {
    this.claudePath = path.join(process.env.HOME, '.claude');
    this.historyPath = path.join(this.claudePath, 'history.jsonl');
    this.projectsPath = path.join(this.claudePath, 'projects');
    this.cacheTtlMs = 5 * 60 * 1000; // 5 minutes
    this.historyCache = {
      entries: null,
      timestamp: 0
    };
    this.registerWatcher();
  }

  /**
   * Convert workspace path to slug (for .claude/projects/ directory)
   * @param {string} workspacePath - Absolute path
   * @returns {string} Slug
   */
  pathToSlug(workspacePath) {
    // Claude Code slugs: /data/data/com.termux → -data-data-com-termux
    return workspacePath.replace(/\//g, '-').replace(/\./g, '-');
  }

  /**
   * Convert slug back to workspace path
   * @param {string} slug - Directory name from .claude/projects/
   * @returns {string} Absolute path
   */
  slugToPath(slug) {
    return '/' + slug.replace(/^-/, '').replace(/-/g, '/');
  }

  /**
   * Discover all workspaces from .claude/projects/
   * Reads real workspace path from session file 'cwd' field
   * @returns {Promise<Array>} List of workspaces with session counts
   */
  async discoverWorkspaces() {
    if (!fs.existsSync(this.projectsPath)) {
      return [];
    }

    const entries = fs.readdirSync(this.projectsPath, { withFileTypes: true });
    const workspaces = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const projectDir = path.join(this.projectsPath, entry.name);

      // Count session files (exclude agent-* files)
      const sessionFiles = fs.readdirSync(projectDir)
        .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

      if (sessionFiles.length > 0) {
        // Read real workspace path from first session file 'cwd' field
        // NOTE: slugToPath is unreliable (dots vs dashes ambiguity), so cwd is the only source of truth
        let workspacePath = null;
        try {
          const firstFile = path.join(projectDir, sessionFiles[0]);
          const firstLine = fs.readFileSync(firstFile, 'utf8').split('\n')[0];
          const parsed = JSON.parse(firstLine);
          workspacePath = parsed.cwd;
        } catch (error) {
          // Silent - old sessions may not have cwd field
        }

        // Only add if we got a valid cwd and path exists
        if (workspacePath && fs.existsSync(workspacePath)) {
          workspaces.push({
            workspace_path: workspacePath,
            slug: entry.name,
            session_count: sessionFiles.length
          });
        }
        // Skip silently if cwd unavailable - these are legacy sessions
      }
    }

    console.log(`[WorkspaceManager] Discovered ${workspaces.length} workspaces from projects directory`);
    return workspaces;
  }

  /**
   * Mount a workspace (validate + index sessions)
   * @param {string} workspacePath - Absolute path to workspace
   * @returns {Promise<Object>} Workspace info + sessions
   */
  async mountWorkspace(workspacePath) {
    const startedAt = Date.now();
    console.log(`[WorkspaceManager] Mounting workspace: ${workspacePath}`);

    // 1. Validate workspace path
    const validatedPath = await this.validateWorkspace(workspacePath);

    // 2. Index CLI sessions in this workspace
    const sessions = await this.indexWorkspaceSessions(validatedPath);

    // 3. Get workspace memory (if exists)
    const memory = await this.getWorkspaceMemory(validatedPath);

    console.log(`[WorkspaceManager] Mount complete: ${sessions.length} sessions found (${Date.now() - startedAt}ms)`);

    return {
      workspacePath: validatedPath,
      sessions,
      memory,
      sessionCount: sessions.length
    };
  }

  /**
   * Validate workspace path
   * @param {string} workspacePath
   * @returns {Promise<string>} Resolved absolute path
   */
  async validateWorkspace(workspacePath) {
    // Check exists
    if (!fs.existsSync(workspacePath)) {
      throw new Error(`Workspace path does not exist: ${workspacePath}`);
    }

    // Check readable
    try {
      fs.accessSync(workspacePath, fs.constants.R_OK);
    } catch (e) {
      throw new Error(`No read permission: ${workspacePath}`);
    }

    // Resolve symlinks
    const realPath = fs.realpathSync(workspacePath);
    if (realPath !== workspacePath) {
      console.log(`[WorkspaceManager] Resolved symlink: ${workspacePath} → ${realPath}`);
    }

    // Path traversal protection
    const resolved = path.resolve(realPath);

    // On Termux/Android, HOME is /data/data/com.termux/files/home
    const homeDir = process.env.HOME || '/home';
    const allowedRoots = ['/home', '/var', '/opt', '/data', homeDir];
    const isAllowed = allowedRoots.some(root => resolved.startsWith(root));

    if (!isAllowed) {
      throw new Error(`Workspace path not in allowed directories: ${resolved}`);
    }

    return resolved;
  }

  /**
   * Index all CLI sessions in workspace
   * @param {string} workspacePath
   * @returns {Promise<Array>} Sessions found
   */
  async indexWorkspaceSessions(workspacePath) {
    const startedAt = Date.now();
    const sessions = [];

    // Index Claude Code sessions
    const claudeSessions = await this.indexClaudeCodeSessions(workspacePath);
    sessions.push(...claudeSessions);

    // TODO: Index other CLI tools (Codex, Aider, etc.)

    // Sync sessions to database (batch mode to avoid "Statement closed" errors)
    try {
      await this.batchSyncSessions(sessions);
    } catch (error) {
      console.error('[WorkspaceManager] Batch sync error:', error);
      throw error;  // Re-throw to see full stack trace
    }

    console.log(`[WorkspaceManager] Indexed ${sessions.length} sessions in ${Date.now() - startedAt}ms`);
    return sessions;
  }

  /**
   * Batch sync sessions to database (avoids sql.js statement closure issues)
   * @param {Array} sessions
   */
  async batchSyncSessions(sessions) {
    // Process each session individually with fresh statements
    // sql.js closes statements unpredictably, so we can't reuse them
    for (const session of sessions) {
      try {
        // Check if session exists (fresh statement each time)
        const checkStmt = prepare('SELECT id, message_count FROM sessions WHERE id = ?');
        const existing = checkStmt.get(session.id);

        if (existing) {
          if (existing.message_count !== session.message_count) {
            const updateStmt = prepare('UPDATE sessions SET last_used_at = ?, message_count = ? WHERE id = ?');
            updateStmt.run(session.last_used_at, session.message_count, session.id);
            console.log(`[WorkspaceManager] Updated session: ${session.id}`);
          }
        } else {
          const insertStmt = prepare('INSERT INTO sessions (id, engine, workspace_path, session_path, title, last_used_at, created_at, message_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
          insertStmt.run(
            session.id,
            session.engine,
            session.workspace_path,
            session.session_path,
            session.title,
            session.last_used_at,
            session.created_at,
            session.message_count
          );
          console.log(`[WorkspaceManager] Indexed new session: ${session.id}`);
        }

        // Sync messages (fresh statement for each session)
        if (session.messages && session.messages.length > 0) {
          for (const msg of session.messages) {
            const msgStmt = prepare('INSERT OR REPLACE INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)');
            const msgId = `${session.id}-${msg.timestamp}`;
            const timestamp = new Date(msg.timestamp).getTime();
            msgStmt.run(msgId, session.id, msg.role, msg.content, timestamp);
          }
        }
      } catch (error) {
        console.error(`[WorkspaceManager] Error syncing session ${session.id}:`, error);
        // Continue with next session even if one fails
      }
    }
  }

  /**
   * Index Claude Code sessions from .claude/projects/[workspace-slug]/
   * @param {string} workspacePath
   * @returns {Promise<Array>}
   */
  async indexClaudeCodeSessions(workspacePath) {
    const slug = this.pathToSlug(workspacePath);
    const projectDir = path.join(this.projectsPath, slug);

    if (!fs.existsSync(projectDir)) {
      console.log(`[WorkspaceManager] No project directory for workspace: ${workspacePath}`);
      return [];
    }

    // List session files (exclude agent-* files)
    const sessionFiles = fs.readdirSync(projectDir)
      .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

    console.log(`[WorkspaceManager] Found ${sessionFiles.length} session files in ${slug}`);

    const sessions = [];

    for (const file of sessionFiles) {
      const sessionId = file.replace('.jsonl', '');
      const sessionPath = path.join(projectDir, file);

      // Read session file line by line
      const messages = [];
      let firstTimestamp = null;
      let lastTimestamp = null;

      try {
        const fileStream = fs.createReadStream(sessionPath);
        const rl = readline.createInterface({
          input: fileStream,
          crlfDelay: Infinity
        });

        for await (const line of rl) {
          if (!line.trim()) continue;
          try {
            const entry = JSON.parse(line);

            // Only include user/assistant messages (skip queue operations)
            if (entry.type === 'user' || entry.type === 'assistant') {
              const timestamp = new Date(entry.timestamp).getTime();
              if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp;
              if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp;

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
              }

              messages.push({
                role: entry.message?.role || entry.type,
                content: content,
                timestamp: entry.timestamp
              });
            }
          } catch (e) {
            // Skip malformed lines
          }
        }
      } catch (error) {
        console.error(`[WorkspaceManager] Error reading session ${sessionId}:`, error.message);
        continue;
      }

      if (messages.length > 0) {
        sessions.push({
          id: sessionId,
          engine: 'claude-code',
          workspace_path: workspacePath,
          session_path: sessionPath,
          title: this.extractTitle(messages),
          message_count: messages.length,
          last_used_at: lastTimestamp,
          created_at: firstTimestamp
          // NOTE: messages NOT included - loaded on-demand by CliLoader (filesystem = source of truth)
        });
      }
    }

    // Sort by most recent first
    sessions.sort((a, b) => b.last_used_at - a.last_used_at);

    console.log(`[WorkspaceManager] Loaded ${sessions.length} sessions (sorted by recency)`);
    return sessions;
  }

  /**
   * Return cached history entries with TTL and fs.watch invalidation.
   */
  async getHistoryEntries() {
    const now = Date.now();

    if (this.historyCache.entries && now - this.historyCache.timestamp < this.cacheTtlMs) {
      return this.historyCache.entries;
    }

    if (!fs.existsSync(this.historyPath)) {
      return null;
    }

    const entries = [];
    const fileStream = fs.createReadStream(this.historyPath);
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
        // skip malformed
      }
    }

    this.historyCache = {
      entries,
      timestamp: now
    };

    return entries;
  }

  /**
   * Watch history file and invalidate cache on change.
   */
  registerWatcher() {
    try {
      fs.watch(this.historyPath, () => {
        this.historyCache = { entries: null, timestamp: 0 };
        console.log('[WorkspaceManager] history cache invalidated (fs watch)');
      });
    } catch (error) {
      // File may not exist yet; noop
    }
  }

  /**
   * Get session path for Claude Code
   * @param {string} workspacePath
   * @returns {string}
   */
  getSessionPath(workspacePath) {
    // Convert /var/www/myapp → -var-www-myapp
    const projectDir = workspacePath.replace(/\//g, '-').replace(/^-/, '');
    return path.join(this.claudePath, 'projects', projectDir);
  }

  /**
   * Extract title from messages (like NexusChat)
   * Uses first user message content, truncated to ~50 chars at word boundary
   * @param {Array} messages
   * @returns {string}
   */
  extractTitle(messages) {
    if (messages.length === 0) return 'Empty Session';

    // Find first user message
    const firstUserMessage = messages.find(m => m.role === 'user');
    if (!firstUserMessage) return 'New Chat';

    // Get content (support both 'content' and 'display' fields)
    const content = firstUserMessage.content || firstUserMessage.display || '';
    if (!content || content.trim() === '') return 'New Chat';

    // Clean up: normalize whitespace, remove newlines
    const cleaned = content.replace(/\s+/g, ' ').trim();

    // Truncate to 50 chars at word boundary (like NexusChat)
    if (cleaned.length <= 50) {
      return cleaned;
    }

    const truncated = cleaned.substring(0, 50);
    const lastSpace = truncated.lastIndexOf(' ');

    // If space found after first 20 chars, cut at word boundary
    if (lastSpace > 20) {
      return truncated.substring(0, lastSpace) + '...';
    }

    return truncated + '...';
  }

  /**
   * Sync session to database
   * @param {Object} session
   */
  async syncSessionToDb(session) {
    // Check if exists
    const existingStmt = prepare('SELECT id, message_count FROM sessions WHERE id = ?');
    const existing = existingStmt.get(session.id);

    if (existing) {
      // Update only if message count changed
      if (existing.message_count !== session.message_count) {
        const updateStmt = prepare(`
          UPDATE sessions
          SET last_used_at = ?, message_count = ?
          WHERE id = ?
        `);
        updateStmt.run(session.last_used_at, session.message_count, session.id);
        console.log(`[WorkspaceManager] Updated session: ${session.id}`);
      }
    } else {
      // Insert new session
      const insertStmt = prepare(`
        INSERT INTO sessions (
          id, engine, workspace_path, session_path, title,
          last_used_at, created_at, message_count
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertStmt.run(
        session.id,
        session.engine,
        session.workspace_path,
        session.session_path,
        session.title,
        session.last_used_at,
        session.created_at,
        session.message_count
      );
      console.log(`[WorkspaceManager] Indexed new session: ${session.id}`);
    }

    // Sync messages to database (if available)
    if (session.messages && session.messages.length > 0) {
      const msgStmt = prepare(`
        INSERT OR REPLACE INTO messages (
          id, conversation_id, role, content, created_at
        ) VALUES (?, ?, ?, ?, ?)
      `);

      for (const msg of session.messages) {
        const msgId = `${session.id}-${msg.timestamp}`;
        const timestamp = new Date(msg.timestamp).getTime();
        msgStmt.run(msgId, session.id, msg.role, msg.content, timestamp);
      }
    }
  }

  /**
   * Get workspace memory
   * @param {string} workspacePath
   * @returns {Promise<Object|null>}
   */
  async getWorkspaceMemory(workspacePath) {
    const stmt = prepare('SELECT * FROM workspace_memory WHERE workspace_path = ?');
    const memory = stmt.get(workspacePath);

    if (memory) {
      // Parse JSON fields
      if (memory.tech_stack) memory.tech_stack = JSON.parse(memory.tech_stack);
      if (memory.important_files) memory.important_files = JSON.parse(memory.important_files);
    }

    return memory || null;
  }
}

module.exports = WorkspaceManager;
