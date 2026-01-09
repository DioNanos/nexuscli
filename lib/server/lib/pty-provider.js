/**
 * PTY Provider for NexusCLI (Termux + Linux ARM64)
 * Provides PTY detection with fallback to child_process adapter
 * Uses @mmmbuto/pty-termux-utils shared library
 *
 * @version 1.0.0
 */

const { getPty: getSharedPty, createFallbackAdapter } = require('@mmmbuto/pty-termux-utils');
const tryRequire = (moduleName) => {
  try {
    require(moduleName);
    return true;
  } catch (_) {
    return false;
  }
};

/**
 * Get PTY implementation with fallback
 * @returns {Promise<{module: any, name: string}|null>}
 */
async function getPty() {
  const pty = await getSharedPty();
  if (pty) {
    return pty;
  }
  return null;
}

/**
 * Get fallback adapter (child_process)
 * @returns {Object} Adapter with spawn method
 */
function getFallbackAdapter() {
  return createFallbackAdapter();
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

module.exports = {
  getPty,
  getFallbackAdapter,
  isPtyAvailable,
  // Re-export from shared library
  spawnPty: require('@mmmbuto/pty-termux-utils').spawnPty,
};
