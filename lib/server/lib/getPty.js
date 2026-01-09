/**
 * PTY Loader for NexusCLI (legacy compatibility wrapper)
 * Delegates to @mmmbuto/pty-termux-utils multi-provider strategy.
 *
 * Provider priority:
 * 1. Termux: @mmmbuto/node-pty-android-arm64
 * 2. Linux ARM64: @lydell/node-pty-linux-arm64
 * 3. Fallback: child_process adapter (pty-adapter.js)
 *
 * @version 1.1.0
 */

const { getPty: getSharedPty, logDebug } = require('@mmmbuto/pty-termux-utils');
const tryRequire = (moduleName) => {
  try {
    require(moduleName);
    return true;
  } catch (_) {
    return false;
  }
};

module.exports = {
  /**
   * Get PTY implementation with fallback
   * @returns {Promise<{module: any, name: string}|null>}
   */
  async getPty() {
    const pty = await getSharedPty();
    if (pty) {
      logDebug(`Using native PTY provider: ${pty.name}`);
      return pty;
    }
    logDebug('Native PTY not available, using fallback adapter');
    return null;
  },

  /**
   * Synchronous check if PTY is available
   * @returns {boolean}
   */
  isPtyAvailable() {
    return (
      tryRequire('@mmmbuto/node-pty-android-arm64') ||
      tryRequire('@lydell/node-pty-linux-arm64')
    );
  }
};
