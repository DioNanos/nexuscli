/**
 * Standard Paths for NexusCLI
 * Termux Mobile First - all paths relative to $HOME
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HOME = process.env.HOME || os.homedir();

/**
 * NexusCLI standard paths
 */
const PATHS = {
  // Main config directory
  CONFIG_DIR: path.join(HOME, '.nexuscli'),

  // Config file
  CONFIG_FILE: path.join(HOME, '.nexuscli', 'config.json'),

  // Data directory (database, cache)
  DATA_DIR: path.join(HOME, '.nexuscli', 'data'),

  // Database file
  DATABASE: path.join(HOME, '.nexuscli', 'data', 'nexuscli.db'),

  // Logs directory
  LOGS_DIR: path.join(HOME, '.nexuscli', 'logs'),

  // Server log
  SERVER_LOG: path.join(HOME, '.nexuscli', 'logs', 'server.log'),

  // PID file for daemon
  PID_FILE: path.join(HOME, '.nexuscli', 'nexuscli.pid'),

  // Engines config directory
  ENGINES_DIR: path.join(HOME, '.nexuscli', 'engines'),

  // Termux boot script
  BOOT_SCRIPT: path.join(HOME, '.termux', 'boot', 'nexuscli-start.sh'),

  // Claude CLI history (read-only)
  CLAUDE_HISTORY: path.join(HOME, '.claude', 'history.jsonl'),
  CLAUDE_PROJECTS: path.join(HOME, '.claude', 'projects'),

  // Default workspace
  DEFAULT_WORKSPACE: path.join(HOME, 'Dev')
};

/**
 * Ensure all required directories exist
 */
function ensureDirectories() {
  const dirs = [
    PATHS.CONFIG_DIR,
    PATHS.DATA_DIR,
    PATHS.LOGS_DIR,
    PATHS.ENGINES_DIR
  ];

  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

/**
 * Ensure Termux boot directory exists
 */
function ensureBootDirectory() {
  const bootDir = path.join(HOME, '.termux', 'boot');
  if (!fs.existsSync(bootDir)) {
    fs.mkdirSync(bootDir, { recursive: true });
  }
  return bootDir;
}

/**
 * Get path resolving ~ to HOME
 */
function resolvePath(p) {
  if (p.startsWith('~')) {
    return path.join(HOME, p.slice(1));
  }
  return path.resolve(p);
}

/**
 * Get relative path from HOME (for display)
 */
function toDisplayPath(p) {
  if (p.startsWith(HOME)) {
    return '~' + p.slice(HOME.length);
  }
  return p;
}

module.exports = {
  PATHS,
  HOME,
  ensureDirectories,
  ensureBootDirectory,
  resolvePath,
  toDisplayPath
};
