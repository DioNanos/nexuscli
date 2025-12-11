/**
 * GeminiWrapper - Wrapper for Gemini CLI (gemini command)
 *
 * Executes Gemini CLI with node-pty for real PTY support.
 * Uses JSON streaming output for structured event parsing.
 *
 * CLI Arguments:
 * - -y: YOLO mode (auto-approve all actions)
 * - -m <model>: Model selection (gemini-3-pro-preview, etc.)
 * - -o stream-json: JSON streaming output
 * - --include-directories: Workspace access
 *
 * @version 0.5.0 - Extended BaseCliWrapper for interrupt support
 */

const fs = require('fs');
const path = require('path');
const pty = require('../lib/pty-adapter');
const GeminiOutputParser = require('./gemini-output-parser');
const BaseCliWrapper = require('./base-cli-wrapper');

// Default model - Gemini 3 Pro Preview
const DEFAULT_MODEL = 'gemini-3-pro-preview';

// CLI timeout (10 minutes)
const CLI_TIMEOUT_MS = 600000;

class GeminiWrapper extends BaseCliWrapper {
  constructor(options = {}) {
    super();  // Initialize activeProcesses from BaseCliWrapper
    this.geminiPath = this._resolveGeminiPath(options.geminiPath);
    this.workspaceDir = options.workspaceDir || process.cwd();

    console.log(`[GeminiWrapper] Initialized with binary: ${this.geminiPath}`);
  }

  /**
   * Resolve path to gemini CLI binary
   */
  _resolveGeminiPath(overridePath) {
    if (overridePath && fs.existsSync(overridePath)) {
      return overridePath;
    }

    // Common installation paths
    const candidates = [
      path.join(process.env.HOME || '', '.local/bin/gemini'),
      path.join(process.env.PREFIX || '', 'bin/gemini'),
      '/usr/local/bin/gemini',
      '/usr/bin/gemini',
      'gemini', // Fallback to PATH lookup
    ];

    for (const candidate of candidates) {
      try {
        if (candidate === 'gemini' || fs.existsSync(candidate)) {
          return candidate;
        }
      } catch (_) {
        // Skip invalid paths
      }
    }

    return 'gemini'; // Assume in PATH
  }

  /**
   * Send a message to Gemini CLI
   *
   * @param {Object} params
   * @param {string} params.prompt - User message/prompt
   * @param {string} params.threadId - Native Gemini session ID for resume
   * @param {string} [params.model='gemini-3-pro-preview'] - Model name
   * @param {string} [params.workspacePath] - Workspace directory
   * @param {Function} [params.onStatus] - Callback for status events (SSE streaming)
   * @returns {Promise<{text: string, usage: Object, sessionId: string}>}
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
      const parser = new GeminiOutputParser();
      let promiseSettled = false;

      const cwd = workspacePath || this.workspaceDir;

      // Build CLI arguments
      // If threadId exists, use --resume to continue native session
      const args = [
        '-y',                              // YOLO mode - auto-approve all actions
        '-m', model,                       // Model selection
        '-o', 'stream-json',               // JSON streaming for structured events
      ];

      // Add resume flag if continuing existing session
      if (threadId) {
        args.push('--resume', threadId);
      }

      // Add prompt as positional argument
      args.push(prompt);

      console.log(`[GeminiWrapper] Model: ${model}`);
      console.log(`[GeminiWrapper] ThreadId: ${threadId || '(new session)'}`);
      console.log(`[GeminiWrapper] CWD: ${cwd}`);
      console.log(`[GeminiWrapper] Prompt length: ${prompt.length}`);

      // Spawn Gemini CLI with PTY
      let ptyProcess;
      try {
        ptyProcess = pty.spawn(this.geminiPath, args, {
          name: 'xterm-color',
          cols: 120,
          rows: 40,
          cwd: cwd,
          env: {
            ...process.env,
            TERM: 'xterm-256color',
          }
        });
      } catch (spawnError) {
        return reject(new Error(`Failed to spawn Gemini CLI: ${spawnError.message}`));
      }

      // Register process for interrupt capability
      // Prefer external processId (Nexus sessionId), else threadId, else temp
      const processId = processIdOverride || threadId || `gemini-${Date.now()}`;
      this.registerProcess(processId, ptyProcess, 'pty');

      let stdout = '';

      // Handle PTY data
      ptyProcess.onData((data) => {
        stdout += data;

        // Clean ANSI escape codes before parsing
        const cleanData = data
          .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')  // Standard ANSI codes
          .replace(/\x1B\[\?[0-9;]*[a-zA-Z]/g, '') // Private modes
          .replace(/\r/g, '');                     // Carriage returns

        // Parse and emit events
        if (onStatus && cleanData.trim()) {
          try {
            const events = parser.parse(cleanData);
            events.forEach(event => {
              console.log(`[GeminiWrapper] Event: ${event.type}`, event.message || event.text?.substring(0, 50) || '');
              onStatus(event);
            });
          } catch (parseError) {
            console.error('[GeminiWrapper] Parser error:', parseError.message);
          }
        }
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode }) => {
        // Unregister process on exit
        this.unregisterProcess(processId);

        if (promiseSettled) return;
        promiseSettled = true;

        console.log(`[GeminiWrapper] Exit code: ${exitCode}`);

        // Non-zero exit is an error (except null which is normal)
        if (exitCode !== 0 && exitCode !== null) {
          console.error('[GeminiWrapper] Error output:', stdout.substring(0, 500));
          reject(new Error(`Gemini CLI error (exit ${exitCode}): ${stdout.substring(0, 200)}`));
          return;
        }

        // Get final response and usage from parser
        const finalResponse = parser.getFinalResponse();
        const usage = parser.getUsage();

        // Detect runtime errors surfaced as plain text (e.g., missing pty.node on Termux)
        const ptyMissing = stdout.includes("Cannot find module '../build/Debug/pty.node'") ||
          stdout.includes('pty.node');

        console.log(`[GeminiWrapper] Response length: ${finalResponse.length}`);
        console.log(`[GeminiWrapper] Usage:`, usage ? JSON.stringify(usage) : 'none');

        // Calculate token counts (fallback if parser didn't get them)
        const promptTokens = usage?.input_tokens || Math.ceil(prompt.length / 4);
        const completionTokens = usage?.output_tokens || Math.ceil(finalResponse.length / 4);

        // If no output was produced, treat as error with a clear hint
        if (!finalResponse.trim()) {
          const hint = ptyMissing
            ? 'Gemini CLI non riesce a caricare node-pty (pty.node mancante). Esegui: npm rebuild node-pty --build-from-source -g @anthropic/gemini-cli oppure reinstalla gemini-cli.'
            : 'Gemini CLI ha restituito una risposta vuota (0 token). Controlla i log CLI.';
          return reject(new Error(hint));
        }

        resolve({
          text: finalResponse,
          sessionId: parser.getSessionId(), // Native Gemini session ID for resume
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: promptTokens + completionTokens,
          }
        });
      });

      // Handle errors
      if (ptyProcess.onError) {
        ptyProcess.onError((error) => {
          if (promiseSettled) return;
          promiseSettled = true;
          console.error('[GeminiWrapper] PTY error:', error);
          reject(new Error(`Gemini CLI PTY error: ${error.message}`));
        });
      }

      // Timeout after 10 minutes
      const timeout = setTimeout(() => {
        if (!promiseSettled) {
          promiseSettled = true;
          console.error('[GeminiWrapper] Timeout after 10 minutes');
          try {
            ptyProcess.kill();
          } catch (_) {}
          reject(new Error('Gemini CLI timeout (10 minutes)'));
        }
      }, CLI_TIMEOUT_MS);

      // Clear timeout on exit
      ptyProcess.onExit(() => clearTimeout(timeout));
    });
  }

  /**
   * Check if Gemini CLI is available
   * @returns {Promise<boolean>}
   */
  async isAvailable() {
    return new Promise((resolve) => {
      const { exec } = require('child_process');
      exec(`${this.geminiPath} --version`, { timeout: 5000 }, (error, stdout) => {
        if (error) {
          console.log('[GeminiWrapper] CLI not available:', error.message);
          resolve(false);
        } else {
          console.log('[GeminiWrapper] CLI available:', stdout.trim().substring(0, 50));
          resolve(true);
        }
      });
    });
  }

  /**
   * Get the default model
   */
  getDefaultModel() {
    return DEFAULT_MODEL;
  }

  /**
   * Get available models
   */
  getAvailableModels() {
    return [
      {
        id: 'gemini-3-pro-preview',
        name: 'Gemini 3 Pro Preview',
        description: '🚀 Latest Gemini 3 model',
        default: true
      }
    ];
  }
}

module.exports = GeminiWrapper;
