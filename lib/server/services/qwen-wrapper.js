/**
 * QwenWrapper - Wrapper for Qwen Code CLI (qwen command)
 *
 * Executes Qwen CLI with PTY adapter for Termux.
 * Uses stream-json output for structured parsing.
 */

const fs = require('fs');
const path = require('path');
const pty = require('../lib/pty-adapter');
const QwenOutputParser = require('./qwen-output-parser');
const BaseCliWrapper = require('./base-cli-wrapper');

const DEFAULT_MODEL = 'coder-model';
const CLI_TIMEOUT_MS = 600000; // 10 minutes

const DANGEROUS_PATTERNS = [
  /pkill\s+(-\d+\s+)?node/i,
  /killall\s+(-\d+\s+)?node/i,
  /kill\s+-9/i,
  /rm\s+-rf\s+[\/~]/i,
  /shutdown/i,
  /reboot/i,
  /systemctl\s+(stop|restart|disable)/i,
  /service\s+\w+\s+(stop|restart)/i,
  />\s*\/dev\/sd/i,
  /mkfs/i,
  /dd\s+if=.*of=\/dev/i,
];

class QwenWrapper extends BaseCliWrapper {
  constructor(options = {}) {
    super();
    this.qwenPath = this._resolveQwenPath(options.qwenPath);
    this.workspaceDir = options.workspaceDir || process.cwd();

    console.log(`[QwenWrapper] Initialized with binary: ${this.qwenPath}`);
  }

  _isDangerousCommand(command) {
    if (!command) return false;
    for (const pattern of DANGEROUS_PATTERNS) {
      if (pattern.test(command)) return true;
    }
    return false;
  }

  _resolveQwenPath(overridePath) {
    if (overridePath && fs.existsSync(overridePath)) return overridePath;

    const candidates = [
      path.join(process.env.HOME || '', '.local/bin/qwen'),
      path.join(process.env.PREFIX || '', 'bin/qwen'),
      '/usr/local/bin/qwen',
      '/usr/bin/qwen',
      'qwen',
    ];

    for (const candidate of candidates) {
      try {
        if (candidate === 'qwen' || fs.existsSync(candidate)) {
          return candidate;
        }
      } catch (_) {
        // ignore
      }
    }

    return 'qwen';
  }

  /**
   * Send a message to Qwen CLI
   * @param {Object} params
   * @param {string} params.prompt
   * @param {string} params.threadId - Native Qwen session ID for resume
   * @param {string} params.model
   * @param {string} params.workspacePath
   * @param {Function} params.onStatus
   */
  async sendMessage({
    prompt,
    threadId,
    model = DEFAULT_MODEL,
    workspacePath,
    onStatus,
    processId: processIdOverride
  }) {
    return new Promise((resolve, reject) => {
      const parser = new QwenOutputParser();
      let promiseSettled = false;

      const cwd = workspacePath || this.workspaceDir;

      const args = [
        '-y',
        '-m', model,
        '-o', 'stream-json',
        '--include-partial-messages',
      ];

      if (threadId) {
        args.push('--resume', threadId);
      }

      args.push(prompt);

      console.log(`[QwenWrapper] Model: ${model}`);
      console.log(`[QwenWrapper] ThreadId: ${threadId || '(new session)'}`);
      console.log(`[QwenWrapper] CWD: ${cwd}`);
      console.log(`[QwenWrapper] Prompt length: ${prompt.length}`);

      let ptyProcess;
      try {
        ptyProcess = pty.spawn(this.qwenPath, args, {
          name: 'xterm-color',
          cols: 120,
          rows: 40,
          cwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
          }
        });
      } catch (spawnError) {
        return reject(new Error(`Failed to spawn Qwen CLI: ${spawnError.message}`));
      }

      const processId = processIdOverride || threadId || `qwen-${Date.now()}`;
      this.registerProcess(processId, ptyProcess, 'pty');

      let stdout = '';

      ptyProcess.onData((data) => {
        stdout += data;

        const cleanData = data
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
          .replace(/\x1B\[\?[0-9;]*[a-zA-Z]/g, '')
          .replace(/\r/g, '');

        if (onStatus && cleanData.trim()) {
          try {
            const events = parser.parse(cleanData);
            events.forEach(event => {
              if (event.type === 'status' && event.message) {
                const msg = event.message;
                if (msg.startsWith('Shell:') || msg.includes('Shell:')) {
                  const shellCmd = msg.replace(/^Shell:\s*/, '');
                  if (this._isDangerousCommand(shellCmd)) {
                    console.warn(`[QwenWrapper] ⚠️  DANGEROUS COMMAND DETECTED: ${shellCmd.substring(0, 100)}`);
                  }
                }
              }
              onStatus(event);
            });
          } catch (parseError) {
            console.error('[QwenWrapper] Parser error:', parseError.message);
          }
        }
      });

      ptyProcess.onExit(({ exitCode }) => {
        this.unregisterProcess(processId);

        if (promiseSettled) return;
        promiseSettled = true;

        if (exitCode !== 0 && exitCode !== null) {
          reject(new Error(`Qwen CLI error (exit ${exitCode}): ${stdout.substring(0, 200)}`));
          return;
        }

        const finalResponse = parser.getFinalResponse();
        const usage = parser.getUsage();

        const promptTokens = usage?.input_tokens || Math.ceil(prompt.length / 4);
        const completionTokens = usage?.output_tokens || Math.ceil(finalResponse.length / 4);

        if (!finalResponse.trim()) {
          return reject(new Error('Qwen CLI returned empty response. Check CLI logs.'));
        }

        resolve({
          text: finalResponse,
          sessionId: parser.getSessionId(),
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          }
        });
      });

      if (ptyProcess.onError) {
        ptyProcess.onError((error) => {
          if (promiseSettled) return;
          promiseSettled = true;
          reject(new Error(`Qwen CLI PTY error: ${error.message}`));
        });
      }

      const timeout = setTimeout(() => {
        if (!promiseSettled) {
          promiseSettled = true;
          try { ptyProcess.kill(); } catch (_) {}
          reject(new Error('Qwen CLI timeout (10 minutes)'));
        }
      }, CLI_TIMEOUT_MS);

      ptyProcess.onExit(() => clearTimeout(timeout));
    });
  }

  async isAvailable() {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec(`${this.qwenPath} --version`, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          console.log('[QwenWrapper] CLI not available:', error.message);
          resolve(false);
        } else {
          console.log('[QwenWrapper] CLI available:', stdout.trim().substring(0, 50));
          resolve(true);
        }
      });
    });
  }

  getDefaultModel() {
    return DEFAULT_MODEL;
  }

  getAvailableModels() {
    return [
      {
        id: 'coder-model',
        name: 'coder-model',
        description: '🔧 Qwen Coder (default)',
        default: true
      },
      {
        id: 'vision-model',
        name: 'vision-model',
        description: '👁️ Qwen Vision'
      }
    ];
  }
}

module.exports = QwenWrapper;
