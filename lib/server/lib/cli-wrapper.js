const pty = require('./pty-adapter');
const OutputParser = require('./output-parser');

/**
 * CLI Wrapper - Generic CLI tool execution (adapted from NexusChat claude-wrapper)
 * Spawns PTY processes for any CLI tool (bash, git, docker, python, etc.)
 * Streams output via SSE
 */
class CliWrapper {
  constructor(options = {}) {
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.activeJobs = new Map();
  }

  /**
   * Execute command via PTY
   * @param {Object} params - { jobId, tool, command, workingDir, timeout, onStatus }
   * @returns {Promise<Object>} - { exitCode, stdout, stderr, duration }
   */
  async execute({ jobId, tool = 'bash', command, workingDir, timeout = 30000, onStatus }) {
    return new Promise((resolve, reject) => {
      const parser = new OutputParser();
      const startTime = Date.now();

      // Determine shell command
      let shellCmd = '/bin/bash';
      let args = ['-c', command];

      // Tool-specific handling
      if (tool === 'bash') {
        shellCmd = '/bin/bash';
        args = ['-c', command];
      } else if (tool === 'python') {
        shellCmd = '/usr/bin/python3';
        args = ['-c', command];
      } else if (tool === 'node') {
        shellCmd = '/usr/bin/node';
        args = ['-e', command];
      } else {
        // Generic: assume tool is in PATH
        shellCmd = tool;
        args = command.split(' ');
      }

      console.log(`[CliWrapper] Executing: ${tool} - ${command.substring(0, 50)}...`);
      console.log(`[CliWrapper] Working dir: ${workingDir || this.workspaceDir}`);

      // Spawn PTY process
      let ptyProcess;
      try {
        ptyProcess = pty.spawn(shellCmd, args, {
        name: 'xterm-color',
        cols: 80,
        rows: 30,
        cwd: workingDir || this.workspaceDir,
        env: process.env,
      });
      } catch (err) {
        return reject(err);
      }

      this.activeJobs.set(jobId, ptyProcess);

      let stdout = '';
      let stderr = '';

      // Handle timeout
      const timer = setTimeout(() => {
        console.log(`[CliWrapper] Job ${jobId} timeout`);
        ptyProcess.kill('SIGTERM');

        if (onStatus) {
          onStatus({
            type: 'error',
            error: 'Command timeout exceeded',
            timeout
          });
        }
      }, timeout);

      // Handle process errors
      if (typeof ptyProcess.on === 'function') {
        ptyProcess.on('error', (err) => {
          console.error('[CliWrapper] Spawn error:', err);
          reject(err);
        });
      } else if (typeof ptyProcess.onError === 'function') {
        ptyProcess.onError((err) => {
          console.error('[CliWrapper] Spawn error:', err);
          reject(err);
        });
      }

      // Handle output
      ptyProcess.onData((data) => {
        stdout += data;

        // Parse output and emit status events
        if (onStatus) {
          try {
            const events = parser.parse(data);
            events.forEach(event => {
              onStatus(event);
            });
          } catch (parseError) {
            console.error('[CliWrapper] Parser error:', parseError);
          }
        }
      });

      // Handle exit
      ptyProcess.onExit(({ exitCode }) => {
        clearTimeout(timer);
        this.activeJobs.delete(jobId);

        const duration = Date.now() - startTime;

        // Clean ANSI escape codes
        const cleanStdout = stdout
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')  // ANSI codes
          .replace(/\x1B\[\?[0-9;]*[a-zA-Z]/g, '') // Private modes
          .trim();

        console.log(`[CliWrapper] Job ${jobId} exit: ${exitCode} (${duration}ms)`);

        if (exitCode !== 0) {
          // Extract stderr (if any)
          stderr = cleanStdout; // In PTY mode, stderr is mixed with stdout
        }

        resolve({
          exitCode,
          stdout: cleanStdout,
          stderr,
          duration
        });
      });
    });
  }

  /**
   * Kill running job
   * @param {string} jobId - Job ID
   */
  kill(jobId) {
    const ptyProcess = this.activeJobs.get(jobId);
    if (ptyProcess) {
      ptyProcess.kill('SIGTERM');
      this.activeJobs.delete(jobId);
      console.log(`[CliWrapper] Killed job ${jobId}`);
      return true;
    }
    return false;
  }

  /**
   * Get active job count
   */
  getActiveJobCount() {
    return this.activeJobs.size;
  }
}

module.exports = CliWrapper;
