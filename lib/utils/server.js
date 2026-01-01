/**
 * Server control helpers (PID-based)
 */

const fs = require('fs');
const { PATHS } = require('./paths');
const { isTermux, releaseWakeLock, sendNotification } = require('./termux');
const { getConfig } = require('../config/manager');

/**
 * Get running server PID (cleans stale PID file)
 */
function getServerPid() {
  if (!fs.existsSync(PATHS.PID_FILE)) {
    return null;
  }

  try {
    const pid = parseInt(fs.readFileSync(PATHS.PID_FILE, 'utf8').trim(), 10);
    if (!Number.isFinite(pid)) {
      fs.unlinkSync(PATHS.PID_FILE);
      return null;
    }

    // Check if process exists
    process.kill(pid, 0);
    return pid;
  } catch {
    // Process doesn't exist or PID invalid - cleanup
    try {
      fs.unlinkSync(PATHS.PID_FILE);
    } catch {}
    return null;
  }
}

/**
 * Check if server is running
 */
function isServerRunning() {
  return getServerPid() !== null;
}

/**
 * Stop the server if running
 */
function stopServer() {
  const pid = getServerPid();
  if (!pid) {
    return { running: false };
  }

  try {
    process.kill(pid, 'SIGTERM');
  } catch (err) {
    if (err.code !== 'ESRCH') {
      return { running: true, pid, error: err };
    }
  }

  // Remove PID file
  try {
    fs.unlinkSync(PATHS.PID_FILE);
  } catch {}

  // Release wake lock + notification (Termux)
  const config = getConfig();
  const wakeLockReleased = isTermux() && config.termux?.wake_lock
    ? releaseWakeLock()
    : false;
  const notificationSent = isTermux() && config.termux?.notifications
    ? sendNotification('NexusCLI', 'Server stopped')
    : false;

  return {
    running: true,
    pid,
    stopped: true,
    wakeLockReleased,
    notificationSent
  };
}

module.exports = {
  getServerPid,
  isServerRunning,
  stopServer
};
