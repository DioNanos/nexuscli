const express = require('express');
const path = require('path');
const os = require('os');
const fs = require('fs');

const router = express.Router();

// Config file path (same as lib/config/manager.js)
const CONFIG_DIR = path.join(os.homedir(), '.nexuscli');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Load config from file
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
  } catch (err) {
    console.warn('[Workspace] Failed to load config:', err.message);
  }
  return null;
}

/**
 * Expand ~ to home directory
 */
function expandPath(p) {
  if (!p) return p;
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return p;
}

/**
 * GET /api/v1/workspace
 * Returns configured default workspace and environment info
 */
router.get('/', (req, res) => {
  try {
    const home = os.homedir();
    const config = loadConfig();

    // Get default workspace from config, fallback to ~/Dev or HOME
    let defaultWorkspace = home;
    if (config?.workspaces?.default) {
      defaultWorkspace = expandPath(config.workspaces.default);
    }

    // CREATE the directory if it doesn't exist (user chose this path during init)
    if (!fs.existsSync(defaultWorkspace)) {
      try {
        fs.mkdirSync(defaultWorkspace, { recursive: true });
        console.log(`[Workspace] Created default workspace: ${defaultWorkspace}`);
      } catch (err) {
        console.warn(`[Workspace] Failed to create ${defaultWorkspace}: ${err.message}, using HOME`);
        defaultWorkspace = home;
      }
    }

    // Get configured workspace list
    const configuredPaths = (config?.workspaces?.paths || []).map(expandPath);

    res.json({
      current: defaultWorkspace,
      default: defaultWorkspace,
      configured: configuredPaths,
      home: home,
      platform: process.platform,
      user: process.env.USER || process.env.USERNAME || 'unknown'
    });
  } catch (error) {
    console.error('[Workspace] Error fetching workspace info:', error);
    res.status(500).json({ error: 'Failed to fetch workspace info' });
  }
});

module.exports = router;
