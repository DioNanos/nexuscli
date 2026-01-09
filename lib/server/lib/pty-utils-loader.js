/**
 * Safe loader for @mmmbuto/pty-termux-utils with fallback adapter.
 * Prevents hard crashes if the dependency is missing or broken.
 */

const { spawn } = require('child_process');

let cachedUtils;
let warned = false;

function warnOnce(error) {
  if (warned) return;
  warned = true;
  const message = error && error.message ? error.message : String(error);
  console.warn('[PTY] Failed to load @mmmbuto/pty-termux-utils. Using fallback adapter.');
  console.warn(`[PTY] Reason: ${message}`);
}

function loadPtyUtils() {
  if (cachedUtils !== undefined) return cachedUtils;
  try {
    cachedUtils = require('@mmmbuto/pty-termux-utils');
  } catch (err) {
    warnOnce(err);
    cachedUtils = null;
  }
  return cachedUtils;
}

function ensurePtyInterface(proc) {
  if (!proc) return proc;
  if (typeof proc.onData === 'function' && typeof proc.onExit === 'function') {
    return proc;
  }

  const hasChildStd = !!(proc.stdout || proc.stderr);
  const dataHandlers = [];
  const exitHandlers = [];

  if (typeof proc.on === 'function' && !hasChildStd) {
    proc.on('data', (data) => {
      dataHandlers.forEach((fn) => fn(data));
    });
    proc.on('exit', (code, signal) => {
      exitHandlers.forEach((fn) => fn({ exitCode: code, signal }));
    });
  } else {
    proc.stdout?.on('data', (data) => {
      dataHandlers.forEach((fn) => fn(data.toString()));
    });
    proc.stderr?.on('data', (data) => {
      dataHandlers.forEach((fn) => fn(data.toString()));
    });
    proc.on?.('exit', (code, signal) => {
      exitHandlers.forEach((fn) => fn({ exitCode: code ?? -1, signal }));
    });
  }

  proc.onData = (fn) => dataHandlers.push(fn);
  proc.onExit = (fn) => exitHandlers.push(fn);

  if (typeof proc.onError !== 'function' && typeof proc.on === 'function') {
    proc.onError = (fn) => proc.on('error', fn);
  }
  if (typeof proc.write !== 'function') {
    proc.write = (data) => proc.stdin?.write(data);
  }
  if (typeof proc.sendEsc !== 'function') {
    proc.sendEsc = () => {
      if (proc.stdin?.writable) {
        proc.stdin.write('\x1B');
        return true;
      }
      return false;
    };
  }
  if (typeof proc.resize !== 'function') {
    proc.resize = () => {};
  }
  if (typeof proc.kill !== 'function' && proc.process?.kill) {
    proc.kill = (signal = 'SIGTERM') => proc.process.kill(signal);
  }
  if (proc.pid == null && proc.process?.pid != null) {
    proc.pid = proc.process.pid;
  }

  return proc;
}

function createLocalFallbackAdapter() {
  return {
    spawn: (file, args, options = {}) => {
      const child = spawn(file, args, {
        cwd: options.cwd,
        env: options.env ? { ...process.env, ...options.env } : undefined,
      });
      return ensurePtyInterface(child);
    }
  };
}

function getPtyFn() {
  const utils = loadPtyUtils();
  return utils?.getPty ? utils.getPty : async () => null;
}

function getSpawnPtyFn() {
  const utils = loadPtyUtils();
  return utils?.spawnPty
    ? utils.spawnPty
    : async () => { throw new Error('Native PTY utilities unavailable'); };
}

function getLogDebugFn() {
  const utils = loadPtyUtils();
  return utils?.logDebug ? utils.logDebug : () => {};
}

function getFallbackAdapter() {
  const utils = loadPtyUtils();
  if (utils?.createFallbackAdapter) {
    const base = utils.createFallbackAdapter();
    return {
      spawn: (...args) => ensurePtyInterface(base.spawn(...args))
    };
  }
  return createLocalFallbackAdapter();
}

module.exports = {
  getPtyFn,
  getSpawnPtyFn,
  getLogDebugFn,
  getFallbackAdapter,
  ensurePtyInterface
};
