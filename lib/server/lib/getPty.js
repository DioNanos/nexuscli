/**
 * PTY Loader for NexusCLI (Termux only)
 * Provides PTY detection with fallback to child_process adapter
 *
 * Strategy (Termux-only):
 * 1. Try Termux PTY: @mmmbuto/node-pty-android-arm64
 * 2. Fallback to child_process adapter (pty-adapter.js)
 *
 * @version 0.2.0
 */

module.exports = {
  /**
   * Get PTY implementation with fallback
   * @returns {Promise<{module: any, name: string}|null>}
   */
  async getPty() {
    // Termux/Android only: try native PTY
    try {
      const mmmbuto = require('@mmmbuto/node-pty-android-arm64');
      console.log('[getPty] Using @mmmbuto/node-pty-android-arm64 (Termux)');
      return { module: mmmbuto, name: 'mmmbuto-node-pty' };
    } catch (e) {
      console.log('[getPty] Termux PTY not available, using fallback adapter');
    }

    // Fallback: return null, use pty-adapter.js
    console.log('[getPty] Using child_process fallback adapter');
    return null;
  },

  /**
   * Synchronous check if PTY is available
   * @returns {boolean}
   */
  isPtyAvailable() {
    try {
      require('@mmmbuto/node-pty-android-arm64');
      return true;
    } catch (_) {
      return false;
    }
  }
};
