/**
 * Codex CLI Wrapper for NexusCLI (Termux)
 * Uses `codex exec --json` for non-interactive JSONL output
 *
 * Based on NexusChat codex-cli-wrapper.js pattern
 * Requires: codex-cli 0.62.1+ with exec subcommand
 */

const { spawn, exec } = require('child_process');
const CodexOutputParser = require('./codex-output-parser');

class CodexWrapper {
  constructor(options = {}) {
    this.workspaceDir = options.workspaceDir || process.cwd();
    this.codexBin = options.codexBin || 'codex';

    // Track active sessions
    this.activeSessions = new Set();

    console.log('[CodexWrapper] Initialized');
    console.log('[CodexWrapper] Workspace:', this.workspaceDir);
    console.log('[CodexWrapper] Binary:', this.codexBin);
  }

  /**
   * Send message and get response with streaming events
   * @param {Object} options - Message options
   * @param {string} options.prompt - User prompt
   * @param {string} options.model - Model name (e.g., gpt-5.1-codex-max)
   * @param {string} options.threadId - Native Codex thread ID for session resume
   * @param {string} options.reasoningEffort - Reasoning level (low, medium, high, xhigh)
   * @param {string} options.workspacePath - Working directory override
   * @param {string[]} options.imageFiles - Array of image file paths for multimodal
   * @param {Function} options.onStatus - Callback for status events
   * @returns {Promise<Object>} Response with text, usage, threadId
   */
  async sendMessage({ prompt, model, threadId, reasoningEffort, workspacePath, imageFiles = [], onStatus }) {
    return new Promise((resolve, reject) => {
      const parser = new CodexOutputParser();
      const cwd = workspacePath || this.workspaceDir;

      // Build CLI arguments
      // If threadId exists, use 'exec --json resume <threadId>' to continue session
      // Otherwise use 'exec --json' for new session
      // Note: --skip-git-repo-check is needed for both new and resume sessions
      const args = threadId
        ? ['exec', '--json', '--skip-git-repo-check', 'resume', threadId]
        : ['exec', '--json', '--skip-git-repo-check', '--dangerously-bypass-approvals-and-sandbox', '-C', cwd];

      // Add model if specified (only for new sessions)
      if (model && !threadId) {
        const baseModel = this.extractBaseModel(model);
        args.push('-m', baseModel);
      }

      // Add reasoning effort config override (only for new sessions)
      if (reasoningEffort && !threadId) {
        args.push('-c', `model_reasoning_effort="${reasoningEffort}"`);
      }

      // Add image files for multimodal support (only for new sessions)
      if (imageFiles && imageFiles.length > 0 && !threadId) {
        for (const imagePath of imageFiles) {
          args.push('-i', imagePath);
        }
        console.log('[CodexWrapper] Attached', imageFiles.length, 'image(s)');
      }

      // Add prompt as argument
      // For new sessions: use '--' to separate from options
      // For resume: prompt goes directly after threadId
      if (threadId) {
        args.push(prompt);
      } else {
        args.push('--', prompt);
      }

      console.log('[CodexWrapper] Model:', model);
      console.log('[CodexWrapper] Reasoning:', reasoningEffort);
      console.log('[CodexWrapper] ThreadId:', threadId || '(new session)');
      console.log('[CodexWrapper] CWD:', cwd);
      console.log('[CodexWrapper] Args:', args.slice(0, 6).join(' ') + '...');

      let stdout = '';

      const proc = spawn(this.codexBin, args, {
        cwd: cwd,
        env: {
          ...global.process.env,
          TERM: 'xterm-256color',
        },
      });

      proc.stdout.on('data', (data) => {
        const str = data.toString();
        stdout += str;
        this.handleOutput(str, parser, onStatus);
      });

      proc.stderr.on('data', (data) => {
        console.error('[CodexWrapper] stderr:', data.toString());
      });

      proc.on('close', (exitCode) => {
        clearTimeout(timeout);
        this.handleExit(exitCode, stdout, parser, prompt, resolve, reject);
      });

      // Timeout after 10 minutes
      const timeout = setTimeout(() => {
        console.error('[CodexWrapper] Timeout after 10 minutes');
        proc.kill('SIGTERM');
        reject(new Error('Codex CLI timeout'));
      }, 600000);
    });
  }

  /**
   * Handle output data from CLI
   */
  handleOutput(data, parser, onStatus) {
    // Clean ANSI escape codes
    const cleanData = data
      .replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
      .replace(/\x1B\[\?[0-9;]*[a-zA-Z]/g, '')
      .replace(/\r/g, '');

    // Parse and emit events
    if (onStatus && cleanData.trim()) {
      try {
        const events = parser.parse(cleanData);
        if (events.length > 0) {
          console.log('[CodexWrapper] Parsed', events.length, 'events');
        }
        events.forEach(event => {
          console.log('[CodexWrapper] → Emitting:', event.type, '-', event.category || '', '-', (event.message || event.text || '').substring(0, 50));
          onStatus(event);
        });
      } catch (parseError) {
        console.error('[CodexWrapper] Parser error:', parseError.message);
      }
    }
  }

  /**
   * Handle process exit
   */
  handleExit(exitCode, stdout, parser, prompt, resolve, reject) {
    console.log('[CodexWrapper] Exit code:', exitCode);

    if (exitCode !== 0 && exitCode !== null) {
      console.error('[CodexWrapper] Error output:', stdout.substring(0, 500));
      reject(new Error(`Codex CLI error (exit ${exitCode}): ${stdout.substring(0, 200)}`));
      return;
    }

    const finalResponse = parser.getFinalResponse();
    const usage = parser.getUsage();
    const threadId = parser.getThreadId();

    console.log('[CodexWrapper] Final response length:', finalResponse.length);
    console.log('[CodexWrapper] ThreadId:', threadId);

    // Calculate token counts (fallback)
    const promptTokens = usage?.input_tokens || Math.ceil(prompt.length / 4);
    const completionTokens = usage?.output_tokens || Math.ceil(finalResponse.length / 4);

    resolve({
      text: finalResponse,
      threadId, // Native Codex session ID for resume
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
        cached_tokens: usage?.cached_input_tokens || 0,
      },
    });
  }

  /**
   * Extract base model name (without reasoning suffix)
   * The CLI uses model name + config override for reasoning
   */
  extractBaseModel(modelName) {
    // Remove reasoning suffixes to get base model for CLI
    return modelName
      .replace(/-low$/, '')
      .replace(/-medium$/, '')
      .replace(/-high$/, '')
      .replace(/-xhigh$/, '')
      // Legacy suffixes
      .replace(/-fast$/, '')
      .replace(/-balanced$/, '')
      .replace(/-instant$/, '');
  }

  /**
   * Check if Codex CLI is available
   */
  async isAvailable() {
    return new Promise((resolve) => {
      exec(`${this.codexBin} --version`, (error, stdout) => {
        if (error) {
          console.log('[CodexWrapper] Codex CLI not available:', error.message);
          resolve(false);
        } else {
          console.log('[CodexWrapper] Codex CLI version:', stdout.trim());
          resolve(true);
        }
      });
    });
  }

  /**
   * Check if exec subcommand is available
   */
  async hasExecSupport() {
    return new Promise((resolve) => {
      exec(`${this.codexBin} exec --help`, (error, stdout) => {
        if (error) {
          console.log('[CodexWrapper] exec subcommand not available');
          resolve(false);
        } else {
          console.log('[CodexWrapper] exec subcommand available');
          resolve(true);
        }
      });
    });
  }
}

module.exports = CodexWrapper;
