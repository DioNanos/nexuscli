const express = require('express');
const WorkspaceManager = require('../services/workspace-manager');
const { prepare } = require('../db');

const router = express.Router();
const workspaceManager = new WorkspaceManager();

/**
 * GET /api/v1/workspaces
 * List all unique workspaces from sessions
 */
router.get('/', async (req, res) => {
  try {
    const stmt = prepare(`
      SELECT
        workspace_path,
        COUNT(*) as session_count,
        MAX(last_used_at) as last_activity
      FROM sessions
      GROUP BY workspace_path
      ORDER BY last_activity DESC
    `);

    const workspaces = stmt.all();

    res.json({ workspaces });
  } catch (error) {
    console.error('[Workspaces] Error listing workspaces:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/v1/workspaces/:path/mount
 * Mount workspace (validate + index sessions)
 */
router.post('/:path(*)/mount', async (req, res) => {
  try {
    // Replace __ back to / (avoid Apache encoding issues with slashes in paths)
    let workspacePath = req.params.path.replace(/__/g, '/');
    workspacePath = decodeURIComponent(workspacePath);

    const result = await workspaceManager.mountWorkspace(workspacePath);

    res.json(result);
  } catch (error) {
    console.error('[Workspaces] Mount error:', error);
    res.status(400).json({ error: error.message });
  }
});

/**
 * GET /api/v1/workspaces/:path/sessions
 * Get sessions in workspace (lightweight)
 */
router.get('/:path(*)/sessions', async (req, res) => {
  try {
    // Replace __ back to / (avoid Apache encoding issues with slashes in paths)
    let workspacePath = req.params.path.replace(/__/g, '/');
    workspacePath = decodeURIComponent(workspacePath);
    const { groupBy = 'date' } = req.query;

    // Get sessions from DB
    const stmt = prepare(`
      SELECT
        s.*,
        ss.summary_short,
        ss.updated_at as summary_updated_at
      FROM sessions s
      LEFT JOIN session_summaries ss ON s.id = ss.session_id
      WHERE s.workspace_path = ?
      ORDER BY s.last_used_at DESC
    `);

    const sessions = stmt.all(workspacePath);

    // Parse metadata JSON and ensure title is not empty
    sessions.forEach(session => {
      if (session.metadata) {
        try {
          session.metadata = JSON.parse(session.metadata);
        } catch (e) {
          session.metadata = {};
        }
      }

      // Ensure title is not empty (fallback to default if missing)
      if (!session.title || session.title.trim() === '') {
        console.warn(`[Workspaces] Session ${session.id} has empty title, using default`);
        session.title = 'Untitled Session';
      }
    });

    // Group by date if requested
    if (groupBy === 'date') {
      const grouped = groupSessionsByDate(sessions);
      return res.json(grouped);
    }

    res.json({ sessions });
  } catch (error) {
    console.error('[Workspaces] Error getting sessions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Group sessions by date
 */
function groupSessionsByDate(sessions) {
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const grouped = {
    pinned: [],
    today: [],
    yesterday: [],
    last7days: [],
    last30days: [],
    older: []
  };

  sessions.forEach(session => {
    // Pinned sessions go to separate group
    if (session.pinned) {
      grouped.pinned.push(session);
      return;
    }

    const age = now - session.last_used_at;

    if (age < oneDayMs) grouped.today.push(session);
    else if (age < 2 * oneDayMs) grouped.yesterday.push(session);
    else if (age < 7 * oneDayMs) grouped.last7days.push(session);
    else if (age < 30 * oneDayMs) grouped.last30days.push(session);
    else grouped.older.push(session);
  });

  return grouped;
}

module.exports = router;
