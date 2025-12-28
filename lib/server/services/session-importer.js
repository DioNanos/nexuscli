/**
 * SessionImporter - Importa sessioni CLI native in tabella sessions (indice NexusCLI)
 *
 * Scansione:
 *  - Claude: ~/.claude/projects/<slug>/<sessionId>.jsonl
 *  - Codex : ~/.codex/sessions/<sessionId>.jsonl
 *  - Gemini: ~/.gemini/sessions/<sessionId>.jsonl
 *  - Qwen  : ~/.qwen/projects/<sanitized>/chats/<sessionId>.jsonl
 *
 * Note:
 *  - Usa FILESYSTEM come source of truth: non legge contenuti, solo metadati.
 *  - workspace_path stimato da slug (best effort, non reversibile al 100%).
 *  - Non sovrascrive entry esistenti in DB.
 */

const fs = require('fs');
const path = require('path');
const { prepare, saveDb } = require('../db');
const { sanitizeWorkspacePath } = require('../../utils/workspace');

const HOME = process.env.HOME || '';

const CLAUDE_PROJECTS = path.join(HOME, '.claude', 'projects');
const CODEX_SESSIONS = path.join(HOME, '.codex', 'sessions');
const GEMINI_SESSIONS = path.join(HOME, '.gemini', 'sessions');
const QWEN_PROJECTS = path.join(HOME, '.qwen', 'projects');

class SessionImporter {
  constructor() {}

  /**
   * Importa tutte le sessioni per tutti gli engine
   * @returns {{claude:number, codex:number, gemini:number, qwen:number}}
   */
  importAll() {
    const claude = this.importClaudeSessions();
    const codex = this.importCodexSessions();
    const gemini = this.importGeminiSessions();
    const qwen = this.importQwenSessions();
    return { claude, codex, gemini, qwen };
  }

  /**
   * Claude: ~/.claude/projects/<slug>/<sessionId>.jsonl
   */
  importClaudeSessions() {
    let imported = 0;
    if (!fs.existsSync(CLAUDE_PROJECTS)) return imported;

    const projectSlugs = fs.readdirSync(CLAUDE_PROJECTS);
    for (const slug of projectSlugs) {
      const projectDir = path.join(CLAUDE_PROJECTS, slug);
      if (!fs.statSync(projectDir).isDirectory()) continue;

      const files = fs.readdirSync(projectDir).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        if (this.sessionExists(sessionId)) continue;

        const sessionFile = path.join(projectDir, file);
        const workspacePath = this.resolveWorkspacePath(sessionFile, slug);
        this.insertSession(sessionId, 'claude', workspacePath, null);
        imported++;
      }
    }

    if (imported > 0) saveDb();
    console.log(`[SessionImporter] Claude imported: ${imported}`);
    return imported;
  }

  /**
   * Codex: ~/.codex/sessions/<sessionId>.jsonl
   */
  importCodexSessions() {
    let imported = 0;
    if (!fs.existsSync(CODEX_SESSIONS)) return imported;

    const files = fs.readdirSync(CODEX_SESSIONS)
      .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'));
    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      if (this.sessionExists(sessionId)) continue;

      this.insertSession(sessionId, 'codex', '', null);
      imported++;
    }

    if (imported > 0) saveDb();
    console.log(`[SessionImporter] Codex imported: ${imported}`);
    return imported;
  }

  /**
   * Gemini: ~/.gemini/sessions/<sessionId>.jsonl
   */
  importGeminiSessions() {
    let imported = 0;
    if (!fs.existsSync(GEMINI_SESSIONS)) return imported;

    const files = fs.readdirSync(GEMINI_SESSIONS)
      .filter(f => f.endsWith('.jsonl') || f.endsWith('.json'));
    for (const file of files) {
      const sessionId = file.replace('.jsonl', '');
      if (this.sessionExists(sessionId)) continue;

      this.insertSession(sessionId, 'gemini', '', null);
      imported++;
    }

    if (imported > 0) saveDb();
    console.log(`[SessionImporter] Gemini imported: ${imported}`);
    return imported;
  }

  /**
   * Qwen: ~/.qwen/projects/<sanitized>/chats/<sessionId>.jsonl
   */
  importQwenSessions() {
    let imported = 0;
    if (!fs.existsSync(QWEN_PROJECTS)) return imported;

    const projects = fs.readdirSync(QWEN_PROJECTS);
    for (const project of projects) {
      const projectDir = path.join(QWEN_PROJECTS, project);
      if (!fs.statSync(projectDir).isDirectory()) continue;

      const chatsDir = path.join(projectDir, 'chats');
      if (!fs.existsSync(chatsDir)) continue;

      const files = fs.readdirSync(chatsDir).filter(f => f.endsWith('.jsonl'));
      for (const file of files) {
        const sessionId = file.replace('.jsonl', '');
        if (this.sessionExists(sessionId)) continue;

        this.insertSession(sessionId, 'qwen', '', null);
        imported++;
      }
    }

    if (imported > 0) saveDb();
    console.log(`[SessionImporter] Qwen imported: ${imported}`);
    return imported;
  }

  /**
   * Inserisce riga minima in sessions
   */
  insertSession(id, engine, workspacePath, conversationId) {
    try {
      const now = Date.now();
      const stmt = prepare(`
        INSERT INTO sessions (id, engine, workspace_path, conversation_id, title, created_at, last_used_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      stmt.run(id, engine, workspacePath || '', conversationId || null, 'Imported Chat', now, now);
    } catch (err) {
      console.warn(`[SessionImporter] insert failed for ${id}: ${err.message}`);
    }
  }

  /**
   * Controlla se la sessione esiste già
   */
  sessionExists(sessionId) {
    try {
      const stmt = prepare('SELECT 1 FROM sessions WHERE id = ?');
      return !!stmt.get(sessionId);
    } catch (err) {
      console.warn(`[SessionImporter] exists check failed: ${err.message}`);
      return true; // default to skip to avoid duplicates
    }
  }

  /**
   * Best-effort reverse di slug Claude in path
   * -path-to-dir → /path/to/dir
   * Nota: i punti non sono recuperabili dallo slug (fallback only).
   */
  slugToPath(slug) {
    if (!slug) return '';
    // Claude slug era workspacePath.replace(/\//g, '-'); mantiene i punti
    // Invertiamo: leading '-' → '/', i restanti '-' → '/'
    let tmp = slug;
    if (tmp.startsWith('-')) tmp = '/' + tmp.slice(1);
    return tmp.replace(/-/g, '/');
  }

  /**
   * Extract workspace path from a Claude session file (reads first chunk)
   */
  extractCwdFromSession(sessionFile) {
    try {
      const fd = fs.openSync(sessionFile, 'r');
      const buf = Buffer.alloc(64 * 1024);
      const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
      fs.closeSync(fd);
      if (!bytesRead) return null;

      const chunk = buf.slice(0, bytesRead).toString('utf8');
      const lines = chunk.split('\n');
      for (const line of lines) {
        if (!line) continue;
        try {
          const parsed = JSON.parse(line);
          if (parsed && parsed.cwd) return parsed.cwd;
        } catch (_) {
          // ignore malformed line
        }
      }
    } catch (err) {
      // ignore read/parse errors
    }
    return null;
  }

  /**
   * Resolve workspace path for Claude sessions
   */
  resolveWorkspacePath(sessionFile, slug) {
    const cwd = this.extractCwdFromSession(sessionFile);
    const sanitizedCwd = sanitizeWorkspacePath(cwd);
    if (sanitizedCwd) return sanitizedCwd;

    const fallback = sanitizeWorkspacePath(this.slugToPath(slug));
    return fallback || '';
  }
}

module.exports = new SessionImporter();
