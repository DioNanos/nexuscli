const express = require('express');
const fs = require('fs');
const path = require('path');
const { prepare, saveDb } = require('../db');
const CliLoader = require('../services/cli-loader');
const SummaryGenerator = require('../services/summary-generator');
const sessionImporter = require('../services/session-importer');

const router = express.Router();
const cliLoader = new CliLoader();
const summaryGenerator = new SummaryGenerator();

// Engine-specific session directories
const SESSION_DIRS = {
  claude: path.join(process.env.HOME || '', '.claude', 'projects'),
  codex: path.join(process.env.HOME || '', '.codex', 'sessions'),
  gemini: path.join(process.env.HOME || '', '.gemini', 'sessions'),
  qwen: path.join(process.env.HOME || '', '.qwen', 'projects'),
};

/**
 * POST /api/v1/sessions/import
 * Importa tutte le sessioni native (Claude/Codex/Gemini/Qwen) nel DB
 */
router.post('/import', async (_req, res) => {
  try {
    const imported = sessionImporter.importAll();
    res.json({ success: true, imported });
  } catch (error) {
    console.error('[Sessions] Import error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/v1/sessions/:id
 * Return session metadata from DB (sessions table)
 */
router.get('/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const stmt = prepare('SELECT * FROM sessions WHERE id = ?');
    const session = stmt.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    if (session.metadata) {
      try {
        session.metadata = JSON.parse(session.metadata);
      } catch (_) {
        session.metadata = {};
      }
    }

    res.json({ session });
  } catch (error) {
    console.error('[Sessions] Metadata fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/sessions/:id/messages
 * Lazy load messages from CLI files (not from DB)
 */
router.get('/:id/messages', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const limit = Math.min(Number(req.query.limit) || 30, 200);
    const before = req.query.before ? Number(req.query.before) : undefined;
    const mode = req.query.mode === 'desc' ? 'desc' : 'asc';

    // Fetch session to get workspace path & engine
    const sessionStmt = prepare('SELECT * FROM sessions WHERE id = ?');
    const session = sessionStmt.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    const { messages, pagination } = await cliLoader.loadMessagesFromCLI({
      sessionId,
      threadId: session.session_path,     // native Codex/Gemini thread id
      sessionPath: session.session_path,  // alias for compatibility
      engine: session.engine || 'claude-code',
      workspacePath: session.workspace_path,
      limit,
      before,
      mode
    });

    res.json({
      session: {
        id: session.id,
        workspace_path: session.workspace_path,
        title: session.title,
        engine: session.engine,
        conversation_id: session.conversation_id,
        last_used_at: session.last_used_at,
        created_at: session.created_at,
        message_count: session.message_count
      },
      messages,
      pagination
    });
  } catch (error) {
    console.error('[Sessions] Messages fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/sessions/:id/summary
 * Placeholder for Phase 4 (summary generation)
 */
router.get('/:id/summary', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const stmt = prepare(`
      SELECT ss.*
      FROM session_summaries ss
      WHERE ss.session_id = ?
    `);
    const summaryRow = stmt.get(sessionId);

    if (summaryRow) {
      ['key_decisions', 'tools_used', 'files_modified'].forEach(key => {
        if (summaryRow[key]) {
          try {
            summaryRow[key] = JSON.parse(summaryRow[key]);
          } catch (_) {
            summaryRow[key] = [];
          }
        } else {
          summaryRow[key] = [];
        }
      });
    }

    res.json({ summary: summaryRow || null });
  } catch (error) {
    console.error('[Sessions] Summary fetch error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/sessions/:id/summarize
 * Generate or refresh summary using Claude Haiku
 */
router.post('/:id/summarize', async (req, res) => {
  try {
    const sessionId = req.params.id;
    const limit = Math.min(Number(req.body?.limit) || 120, 300);
    const before = req.body?.before ? Number(req.body.before) : undefined;

    // Fetch session metadata
    const sessionStmt = prepare('SELECT * FROM sessions WHERE id = ?');
    const session = sessionStmt.get(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Load messages from CLI history
    const { messages } = await cliLoader.loadMessagesFromCLI({
      sessionId,
      threadId: session.session_path,
      sessionPath: session.session_path,
      engine: session.engine || 'claude-code',
      workspacePath: session.workspace_path,
      limit,
      before,
      mode: 'asc'
    });

    // Pull existing summary (if any)
    const existingStmt = prepare('SELECT * FROM session_summaries WHERE session_id = ?');
    const existingSummary = existingStmt.get(sessionId);

    const summary = await summaryGenerator.generateSummary({
      sessionId,
      messages,
      existingSummary
    });

    const updatedAt = Date.now();

    // Upsert summary table
    const upsertStmt = prepare(`
      INSERT INTO session_summaries (
        session_id, summary_short, summary_long, key_decisions,
        tools_used, files_modified, updated_at, version
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      ON CONFLICT(session_id) DO UPDATE SET
        summary_short = excluded.summary_short,
        summary_long = excluded.summary_long,
        key_decisions = excluded.key_decisions,
        tools_used = excluded.tools_used,
        files_modified = excluded.files_modified,
        updated_at = excluded.updated_at,
        version = session_summaries.version + 1
    `);

    upsertStmt.run(
      sessionId,
      summary.summary_short || '',
      summary.summary_long || '',
      JSON.stringify(summary.key_decisions || []),
      JSON.stringify(summary.tools_used || []),
      JSON.stringify(summary.files_modified || []),
      updatedAt
    );

    res.json({
      summary: {
        session_id: sessionId,
        ...summary,
        updated_at: updatedAt
      }
    });
  } catch (error) {
    console.error('[Sessions] Summarize error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * DELETE /api/v1/sessions/:id
 * Delete session from DB AND the original .jsonl file (SYNC DELETE)
 */
router.delete('/:id', async (req, res) => {
  try {
    const sessionId = req.params.id;
    console.log(`[Sessions] Deleting session: ${sessionId}`);

    // Fetch session to get workspace path & engine for file deletion
    const sessionStmt = prepare('SELECT * FROM sessions WHERE id = ?');
    const session = sessionStmt.get(sessionId);

    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }

    // Delete the original .jsonl file (SYNC DELETE)
    let fileDeleted = false;
    const sessionFile = getSessionFilePath(sessionId, session.engine, session.workspace_path, session.session_path);
    if (sessionFile && fs.existsSync(sessionFile)) {
      try {
        fs.unlinkSync(sessionFile);
        fileDeleted = true;
        console.log(`[Sessions] Deleted session file: ${sessionFile}`);
      } catch (e) {
        console.warn(`[Sessions] Failed to delete file ${sessionFile}: ${e.message}`);
      }
    }

    // Delete from session_summaries (cascade should handle this, but be explicit)
    const deleteSummaryStmt = prepare('DELETE FROM session_summaries WHERE session_id = ?');
    deleteSummaryStmt.run(sessionId);

    // Delete from sessions table
    const deleteStmt = prepare('DELETE FROM sessions WHERE id = ?');
    deleteStmt.run(sessionId);
    saveDb();

    console.log(`[Sessions] Session ${sessionId} deleted (file: ${fileDeleted})`);
    res.json({ success: true, fileDeleted });
  } catch (error) {
    console.error('[Sessions] Delete error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Helper: Convert workspace path to slug (matches Claude Code behavior)
 */
function pathToSlug(workspacePath) {
  if (!workspacePath) return '-default';
  return workspacePath.replace(/[\/\.]/g, '-');
}

function qwenProjectDir(workspacePath) {
  if (!workspacePath) return 'default';
  return workspacePath.replace(/[^a-zA-Z0-9]/g, '-');
}

/**
 * Helper: Get the filesystem path for a session file
 */
function getSessionFilePath(sessionId, engine, workspacePath, sessionPath) {
  const normalizedEngine = engine?.toLowerCase().includes('claude') ? 'claude'
    : engine?.toLowerCase().includes('codex') ? 'codex'
    : engine?.toLowerCase().includes('gemini') ? 'gemini'
    : engine?.toLowerCase().includes('qwen') ? 'qwen'
    : 'claude';

  switch (normalizedEngine) {
    case 'claude':
      const slug = pathToSlug(workspacePath);
      return path.join(SESSION_DIRS.claude, slug, `${sessionId}.jsonl`);
    case 'codex':
      // Try native threadId first, then legacy sessionId
      const nativeId = sessionPath || sessionId;
      const baseDir = SESSION_DIRS.codex;
      const flatPath = path.join(baseDir, `${nativeId}.jsonl`);
      if (fs.existsSync(flatPath)) return flatPath;
      // Search nested rollout-*.jsonl files containing the threadId
      return findCodexSessionFile(baseDir, nativeId);
    case 'gemini':
      return path.join(SESSION_DIRS.gemini, `${sessionId}.jsonl`);
    case 'qwen': {
      const project = qwenProjectDir(workspacePath);
      const fileId = sessionPath || sessionId;
      return path.join(SESSION_DIRS.qwen, project, 'chats', `${fileId}.jsonl`);
    }
    default:
      return null;
  }
}

/**
 * Find Codex rollout file by threadId within YYYY/MM/DD directories
 */
function findCodexSessionFile(baseDir, threadId) {
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
    console.warn(`[Sessions] Failed to search Codex session file: ${err.message}`);
  }
  return null;
}

module.exports = router;
