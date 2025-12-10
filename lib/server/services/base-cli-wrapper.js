/**
 * Base CLI Wrapper - Common interrupt logic for all CLI wrappers
 *
 * Provides unified process tracking and interrupt capability for:
 * - ClaudeWrapper (PTY)
 * - GeminiWrapper (PTY)
 * - CodexWrapper (child_process.spawn)
 *
 * @version 0.5.0 - Interrupt Support
 */

class BaseCliWrapper {
  constructor() {
    // Map: sessionId → { process, type, startTime }
    this.activeProcesses = new Map();
  }

  /**
   * Register active process for interrupt capability
   * @param {string} sessionId - Session/conversation ID
   * @param {Object} process - PTY process or child_process
   * @param {string} type - 'pty' or 'spawn'
   */
  registerProcess(sessionId, process, type = 'pty') {
    this.activeProcesses.set(sessionId, {
      process,
      type,
      startTime: Date.now()
    });
    console.log(`[BaseWrapper] Registered ${type} process for session ${sessionId}`);
  }

  /**
   * Unregister process on completion
   * @param {string} sessionId
   */
  unregisterProcess(sessionId) {
    if (this.activeProcesses.has(sessionId)) {
      this.activeProcesses.delete(sessionId);
      console.log(`[BaseWrapper] Unregistered process for session ${sessionId}`);
    }
  }

  /**
   * Interrupt running process
   *
   * Strategy:
   * - PTY: Try ESC (0x1B) first, then SIGINT
   * - Spawn: SIGINT directly
   *
   * @param {string} sessionId
   * @returns {{ success: boolean, method?: string, reason?: string }}
   */
  interrupt(sessionId) {
    const entry = this.activeProcesses.get(sessionId);

    if (!entry) {
      console.log(`[BaseWrapper] No active process for session ${sessionId}`);
      return { success: false, reason: 'no_active_process' };
    }

    const { process, type } = entry;

    try {
      if (type === 'pty') {
        // PTY process: Try ESC first (gentler), then SIGINT
        if (typeof process.sendEsc === 'function' && process.sendEsc()) {
          console.log(`[BaseWrapper] Sent ESC to PTY session ${sessionId}`);
          // Don't remove yet - let onExit handle cleanup
          return { success: true, method: 'esc' };
        }

        // ESC failed or not available, use SIGINT
        if (typeof process.kill === 'function') {
          process.kill('SIGINT');
          console.log(`[BaseWrapper] Sent SIGINT to PTY session ${sessionId}`);
          return { success: true, method: 'sigint' };
        }
      } else if (type === 'spawn') {
        // child_process.spawn: SIGINT directly
        if (typeof process.kill === 'function') {
          process.kill('SIGINT');
          console.log(`[BaseWrapper] Sent SIGINT to spawn session ${sessionId}`);
          return { success: true, method: 'sigint' };
        }
      }

      return { success: false, reason: 'kill_not_available' };
    } catch (err) {
      console.error(`[BaseWrapper] Interrupt error for session ${sessionId}:`, err.message);
      return { success: false, reason: err.message };
    }
  }

  /**
   * Check if session has active process
   * @param {string} sessionId
   * @returns {boolean}
   */
  isActive(sessionId) {
    return this.activeProcesses.has(sessionId);
  }

  /**
   * Get count of active processes
   * @returns {number}
   */
  getActiveCount() {
    return this.activeProcesses.size;
  }

  /**
   * Get all active session IDs
   * @returns {string[]}
   */
  getActiveSessions() {
    return Array.from(this.activeProcesses.keys());
  }

  /**
   * Get process info for session
   * @param {string} sessionId
   * @returns {{ type: string, startTime: number, duration: number } | null}
   */
  getProcessInfo(sessionId) {
    const entry = this.activeProcesses.get(sessionId);
    if (!entry) return null;

    return {
      type: entry.type,
      startTime: entry.startTime,
      duration: Date.now() - entry.startTime
    };
  }
}

module.exports = BaseCliWrapper;
