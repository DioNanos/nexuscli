/**
 * PTY Adapter for NexusCLI (Termux + Linux ARM64)
 * Wrapper around @mmmbuto/pty-termux-utils shared library
 * Provides node-pty-like interface with graceful fallback
 *
 * @version 1.0.0
 */

const { createFallbackAdapter } = require('@mmmbuto/pty-termux-utils');
const tryRequire = (moduleName) => {
  try {
    require(moduleName);
    return true;
  } catch (_) {
    return false;
  }
};

// Create shared fallback adapter (always uses child_process)
const fallbackAdapter = createFallbackAdapter();

// Cache for native PTY (sync access)
let cachedNativePty = null;

/**
 * Initialize native PTY (called at startup)
 */
async function initNativePty() {
  if (cachedNativePty !== null) {
    return cachedNativePty;
  }
  
  try {
    const { getPty } = require('@mmmbuto/pty-termux-utils');
    cachedNativePty = await getPty();
    return cachedNativePty;
  } catch (e) {
    cachedNativePty = false; // Error loading
    return null;
  }
}

/**
 * Synchronous spawn (for compatibility with existing wrapper code)
 * Uses fallback adapter for simplicity (no native PTY in sync mode)
 * @param {string} command - Command to spawn
 * @param {string[]} args - Arguments
 * @param {Object} options - Spawn options (cwd, env)
 * @returns {Object} PTY-like interface
 */
function spawn(command, args, options = {}) {
  return fallbackAdapter.spawn(command, args, options);
}

/**
 * Async spawn with native PTY support
 * @param {string} command - Command to spawn
 * @param {string[]} args - Arguments
 * @param {Object} options - Spawn options (cwd, env)
 * @returns {Promise<Object>} PTY-like interface
 */
async function spawnAsync(command, args, options = {}) {
  const pty = await initNativePty();
  
  if (pty) {
    // Use native PTY
    const proc = pty.module.spawn(command, args, {
      cols: options.cols || 80,
      rows: options.rows || 24,
      cwd: options.cwd,
      env: options.env,
    });

    const dataHandlers = [];
    const exitHandlers = [];

    proc.on('data', (data) => {
      dataHandlers.forEach((fn) => fn(data));
    });

    proc.on('exit', (code, signal) => {
      exitHandlers.forEach((fn) => fn({ exitCode: code, signal }));
    });

    return {
      onData: (fn) => dataHandlers.push(fn),
      onExit: (fn) => exitHandlers.push(fn),
      onError: (fn) => {}, // No error event in native PTY
      write: (data) => proc.write(data),
      sendEsc: () => {
        proc.write('\x1B');
        return true;
      },
      resize: (cols, rows) => proc.resize(cols, rows),
      kill: (signal = 'SIGTERM') => proc.kill(signal),
      pid: proc.pid,
    };
  } else {
    // Use fallback adapter
    return fallbackAdapter.spawn(command, args, options);
  }
}

/**
 * Synchronous check if PTY is available
 * @returns {boolean}
 */
function isPtyAvailable() {
  return (
    tryRequire('@mmmbuto/node-pty-android-arm64') ||
    tryRequire('@lydell/node-pty-linux-arm64')
  );
}

// Initialize native PTY in background (non-blocking)
initNativePty().catch(() => {
  // Silently ignore initialization errors
});

module.exports = {
  spawn,           // Sync spawn (uses fallback)
  spawnAsync,      // Async spawn (uses native PTY if available)
  isPtyAvailable,
};
