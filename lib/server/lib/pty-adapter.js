/**
 * PTY Adapter for NexusCLI (Termux)
 * Provides node-pty-like interface using child_process.spawn
 * Termux-only: no native node-pty compilation needed
 */

const { spawn: cpSpawn } = require('child_process');

/**
 * Spawn a process with node-pty-like interface
 * @param {string} command - Command to spawn
 * @param {string[]} args - Arguments
 * @param {Object} options - Spawn options (cwd, env)
 * @returns {Object} PTY-like interface with onData, onExit, kill
 */
function spawn(command, args, options = {}) {
  const proc = cpSpawn(command, args, {
    cwd: options.cwd,
    env: options.env,
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const dataHandlers = [];
  const exitHandlers = [];
  const errorHandlers = [];

  proc.stdout.on('data', (buf) => {
    const data = buf.toString();
    dataHandlers.forEach((fn) => fn(data));
  });

  proc.stderr.on('data', (buf) => {
    const data = buf.toString();
    dataHandlers.forEach((fn) => fn(data));
  });

  proc.on('close', (code) => {
    exitHandlers.forEach((fn) => fn({ exitCode: code ?? 0 }));
  });

  proc.on('error', (err) => {
    console.error('[PTY-Adapter] Error:', err.message);
    errorHandlers.forEach((fn) => fn(err));
  });

  return {
    onData: (fn) => dataHandlers.push(fn),
    onExit: (fn) => exitHandlers.push(fn),
    onError: (fn) => errorHandlers.push(fn),
    write: (data) => proc.stdin?.writable && proc.stdin.write(data),
    kill: (signal = 'SIGTERM') => proc.kill(signal),
    pid: proc.pid,
  };
}

/**
 * Check if native PTY is available
 * Always returns false on Termux (we use spawn adapter)
 */
function isPtyAvailable() {
  return false;
}

module.exports = { spawn, isPtyAvailable };
