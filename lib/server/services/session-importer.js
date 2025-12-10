/**
 * SessionImporter - Importa sessioni CLI native in tabella sessions (indice NexusCLI)
 *
 * Scansione:
 *  - Claude: ~/.claude/projects/<slug>/<sessionId>.jsonl
 *  - Codex : ~/.codex/sessions/<sessionId>.jsonl
 *  - Gemini: ~/.gemini/sessions/<sessionId>.jsonl
 *
 * Note:
 *  - Usa FILESYSTEM come source of truth: non legge contenuti, solo metadati.
 *  - workspace_path stimato da slug (best effort, non reversibile al 100%).
 *  - Non sovrascrive entry esistenti in DB.
 */

const fs = require('fs');
const path = require('path');
const { prepare, saveDb } = require('../db');

const HOME = process.env.HOME || '';

const CLAUDE_PROJECTS = path.join(HOME, '.claude', 'projects');
const CODEX_SESSIONS = path.join(HOME, '.codex', 'sessions');
const GEMINI_SESSIONS = path.join(HOME, '.gemini', 'sessions');

class SessionImporter {
  constructor() {}

  /**
   * Importa tutte le sessioni per tutti gli engine
   * @returns {{claude:number, codex:number, gemini:number}}
   */
  importAll() {
    const claude = this.importClaudeSessions();
    const codex = this.importCodexSessions();
    const gemini = this.importGeminiSessions();
    return { claude, codex, gemini };
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

        const workspacePath = this.slugToPath(slug);
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
   * Conserva i punti.
   */
  slugToPath(slug) {
    if (!slug) return '';
    // Claude slug era workspacePath.replace(/\//g, '-'); mantiene i punti
    // Invertiamo: leading '-' → '/', i restanti '-' → '/'
    let tmp = slug;
    if (tmp.startsWith('-')) tmp = '/' + tmp.slice(1);
    return tmp.replace(/-/g, '/');
  }
}

module.exports = new SessionImporter();
