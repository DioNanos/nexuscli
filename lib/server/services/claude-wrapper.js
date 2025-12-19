const fs = require('fs');
const path = require('path');
const pty = require('../lib/pty-adapter');
const OutputParser = require('./output-parser');
const BaseCliWrapper = require('./base-cli-wrapper');
const { getApiKey } = require('../db');

/**
 * Wrapper for Claude Code CLI (local installation)
 *
 * Features:
 * - Uses local Claude Code installation (/home/dag/.claude/local/claude)
 * - OAuth authentication (handled by CLI)
 * - Real-time status streaming via onStatus callback
 * - Session management with conversation ID
 *
 * Architecture:
 * - Spawns Claude Code CLI with node-pty
 * - Parses stdout for tool use, thinking, file ops
 * - Emits status events → SSE stream
 * - Returns final response text → saved in DB
 *
 * @version 0.5.0 - Extended BaseCliWrapper for interrupt support
 */
class ClaudeWrapper extends BaseCliWrapper {
  constructor(options = {}) {
    super();  // Initialize activeProcesses from BaseCliWrapper
    this.claudePath = this.resolveClaudePath(options.claudePath);
    this.workspaceDir = options.workspaceDir || process.env.NEXUSCLI_WORKSPACE || process.cwd();
    this.rgPatched = false;
  }

  isExistingSession(sessionId, workspacePath) {
    // ONLY check filesystem - Claude CLI's .jsonl files are the source of truth
    // NexusCLI's database (sessions/conversations tables) may have IDs that
    // Claude CLI doesn't recognize, causing "No conversation found" errors
    try {
      const projectsDir = path.join(process.env.HOME || '', '.claude', 'projects');
      if (fs.existsSync(projectsDir)) {
        const dirs = fs.readdirSync(projectsDir);
        for (const dir of dirs) {
          const sessionFile = path.join(projectsDir, dir, `${sessionId}.jsonl`);
          if (fs.existsSync(sessionFile)) {
            console.log(`[ClaudeWrapper] Session ${sessionId} found in filesystem: ${sessionFile}`);
            return true;
          }
        }
      }
    } catch (err) {
      console.warn('[ClaudeWrapper] Filesystem lookup failed:', err.message);
    }

    console.log(`[ClaudeWrapper] Session ${sessionId} not found in Claude projects - treating as NEW`);
    return false;
  }

  resolveClaudePath(overridePath) {
    if (overridePath && fs.existsSync(overridePath)) return overridePath;
    const envPath = process.env.NEXUSCLI_CLAUDE_PATH;
    if (envPath && fs.existsSync(envPath)) return envPath;

    const candidates = [
      path.join(process.env.HOME || '', '.claude', 'local', 'claude'),
      path.join(process.env.PREFIX || '', 'bin', 'claude'),
      path.join(process.env.HOME || '', 'bin', 'claude'),
      '/usr/local/bin/claude',
      '/usr/bin/claude',
    ].filter(Boolean);

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).mode & 0o111) {
          return candidate;
        }
      } catch (_) {
        // ignore
      }
    }

    return null;
  }

  /**
   * Termux fix: Claude Code bundles ripgrep only for arm64-linux, but on Android
   * it looks for vendor/ripgrep/arm64-android/rg. Create a symlink on the fly so
   * fresh installs work without manual steps.
   */
  ensureRipgrepForTermux() {
    if (this.rgPatched) return;
    const isTermux = (process.env.PREFIX || '').includes('/com.termux/');
    if (!isTermux || !this.claudePath) return;

    try {
      // claudePath points to cli.js or wrapper binary; vendor lives alongside
      const cliDir = path.dirname(this.claudePath);
      const vendorDir = path.join(cliDir, 'vendor', 'ripgrep');
      const linuxRg = path.join(vendorDir, 'arm64-linux', 'rg');
      const androidDir = path.join(vendorDir, 'arm64-android');
      const androidRg = path.join(androidDir, 'rg');

      if (!fs.existsSync(vendorDir)) return;

      // Prefer bundled arm64-linux rg; fallback to system rg if bundle missing
      let rgSource = null;
      if (fs.existsSync(linuxRg)) {
        rgSource = linuxRg;
      } else {
        // Try system rg (Termux package ripgrep)
        try {
          const whichRg = require('child_process')
            .execSync('which rg', { encoding: 'utf8' })
            .trim();
          if (whichRg && fs.existsSync(whichRg)) {
            rgSource = whichRg;
            console.log('[ClaudeWrapper] Using system ripgrep for Termux:', whichRg);
          }
        } catch (_) {
          // leave rgSource null; we’ll exit gracefully
        }
      }

      if (!rgSource) return;
      if (fs.existsSync(androidRg)) {
        this.rgPatched = true;
        return;
      }

      fs.mkdirSync(androidDir, { recursive: true });
      fs.symlinkSync(rgSource, androidRg);
      console.log('[ClaudeWrapper] Created ripgrep symlink for Termux:', androidRg, '→', rgSource);
      this.rgPatched = true;
    } catch (err) {
      console.warn('[ClaudeWrapper] Failed to patch ripgrep for Termux:', err.message);
    }
  }

  /**
   * Send message to Claude Code CLI
   *
   * @param {Object} params
   * @param {string} params.prompt - User message
   * @param {string} params.conversationId - Session ID for Claude
   * @param {string} params.model - Model (sonnet, opus, haiku, or full name)
   * @param {string} params.workspacePath - Workspace directory for Claude CLI --cwd
   * @param {Function} params.onStatus - Callback for status events (tool use, thinking)
   * @returns {Promise<{text: string, usage: Object}>}
   */
  async sendMessage({ prompt, conversationId, model = 'sonnet', workspacePath, onStatus }) {
    return new Promise((resolve, reject) => {
      const parser = new OutputParser();
      // Prevent double-settling when PTY fires both error and exit events
      let promiseSettled = false;

      if (!this.claudePath || !fs.existsSync(this.claudePath)) {
        const msg = `Claude CLI not found (set NEXUSCLI_CLAUDE_PATH)`;
        console.error('[ClaudeWrapper]', msg);
        if (onStatus) {
          onStatus({ type: 'error', category: 'runtime', message: msg });
        }
        return reject(new Error(msg));
      }

      // Check if this is an existing session (DB is source of truth)
      const isExistingSession = this.isExistingSession(conversationId);

      // Detect alternative models early (needed for args construction)
      const isDeepSeek = model.startsWith('deepseek-');
      const isGLM = model === 'glm-4-6';
      const isAlternativeModel = isDeepSeek || isGLM;

      // Build Claude Code CLI args
      const args = [
        '--dangerously-skip-permissions', // Auto-approve all tool use
        '--print', // Non-interactive mode
        '--verbose', // Enable detailed output
        '--output-format', 'stream-json', // JSON streaming events
      ];

      // Only pass --model for native Claude models
      // Alternative models (DeepSeek, GLM) use ANTHROPIC_MODEL env var
      if (!isAlternativeModel) {
        args.push('--model', model);
      }

      // Session management: -r (resume) or --session-id (new)
      if (isExistingSession) {
        args.push('-r', conversationId); // Resume with full history
      } else {
        args.push('--session-id', conversationId); // Create new session
      }

      args.push(prompt);

      // Use provided workspace or fallback to default
      const cwd = workspacePath || this.workspaceDir;

      // Termux compatibility: make sure ripgrep path exists before spawn
      this.ensureRipgrepForTermux();

      // Build environment - configure API for alternative models
      const spawnEnv = { ...process.env };

      if (isDeepSeek) {
        // Get API key from database (priority) or fallback to env var
        const deepseekKey = getApiKey('deepseek') || process.env.DEEPSEEK_API_KEY;

        if (!deepseekKey) {
          const errorMsg = `DeepSeek API key not configured!\n\n` +
            `Run this command to add your API key:\n` +
            `  nexuscli api set deepseek YOUR_API_KEY\n\n` +
            `Get your key at: https://platform.deepseek.com/api_keys`;

          console.error(`[ClaudeWrapper] ❌ ${errorMsg}`);

          if (onStatus) {
            onStatus({
              type: 'error',
              category: 'config',
              message: errorMsg
            });
          }

          return reject(new Error(errorMsg));
        }

        // DeepSeek uses Anthropic-compatible API at different endpoint
        spawnEnv.ANTHROPIC_BASE_URL = 'https://api.deepseek.com/anthropic';
        spawnEnv.ANTHROPIC_AUTH_TOKEN = deepseekKey;
        spawnEnv.ANTHROPIC_MODEL = model; // Pass model name to API
        console.log(`[ClaudeWrapper] DeepSeek detected - using api.deepseek.com/anthropic`);
      } else if (isGLM) {
        // Get API key from database (priority) or fallback to env var
        const glmKey = getApiKey('zai') || process.env.ZAI_API_KEY;

        if (!glmKey) {
          const errorMsg = `Z.ai API key not configured for GLM-4.6!\n\n` +
            `Run this command to add your API key:\n` +
            `  nexuscli api set zai YOUR_API_KEY\n\n` +
            `Get your key at: https://z.ai`;

          console.error(`[ClaudeWrapper] ❌ ${errorMsg}`);

          if (onStatus) {
            onStatus({
              type: 'error',
              category: 'config',
              message: errorMsg
            });
          }

          return reject(new Error(errorMsg));
        }

        // GLM-4.6 uses Z.ai Anthropic-compatible API
        spawnEnv.ANTHROPIC_BASE_URL = 'https://api.z.ai/api/anthropic';
        spawnEnv.ANTHROPIC_AUTH_TOKEN = glmKey;
        spawnEnv.ANTHROPIC_MODEL = 'GLM-4.6'; // Z.ai model name
        spawnEnv.API_TIMEOUT_MS = '3000000'; // 50 minutes timeout
        console.log(`[ClaudeWrapper] GLM-4.6 detected - using Z.ai API with extended timeout`);
      }

      console.log(`[ClaudeWrapper] Model: ${model}${isDeepSeek ? ' (DeepSeek API)' : isGLM ? ' (Z.ai API)' : ''}`);
      console.log(`[ClaudeWrapper] Session: ${conversationId} (${isExistingSession ? 'RESUME' : 'NEW'})`);
      console.log(`[ClaudeWrapper] Working dir: ${cwd}`);

      // Spawn Claude Code CLI with PTY
      // On Termux, invoke node directly with the cli.js script for better compatibility
      let command = this.claudePath;
      let spawnArgs = args;

      if (!pty.isPtyAvailable() && this.claudePath.endsWith('/claude')) {
        // Resolve symlink to actual cli.js and invoke with node
        const fs = require('fs');
        try {
          const realPath = fs.realpathSync(this.claudePath);
          if (realPath.endsWith('.js')) {
            command = process.execPath; // node binary
            spawnArgs = [realPath, ...args];
            console.log('[ClaudeWrapper] Termux mode: invoking node directly with', realPath);
          }
        } catch (err) {
          console.warn('[ClaudeWrapper] Failed to resolve symlink, using path as-is:', err.message);
        }
      }

      let ptyProcess;
      try {
        // Try direct spawn for Termux compatibility
        const { spawn } = require('child_process');
        ptyProcess = spawn(command, spawnArgs, {
          cwd: cwd,
          env: spawnEnv,
          shell: false,
          stdio: ['pipe', 'pipe', 'pipe']
        });

        // Wrap to PTY interface
        const onDataHandlers = [];
        const onExitHandlers = [];
        const onErrorHandlers = [];
        const killProc = ptyProcess.kill.bind(ptyProcess);

        ptyProcess.stdout.on('data', (data) => {
          const text = data.toString();
          console.log('[ClaudeWrapper] Direct stdout:', text.substring(0, 200));
          onDataHandlers.forEach(fn => fn(text));
        });

        ptyProcess.stderr.on('data', (data) => {
          const text = data.toString();
          console.log('[ClaudeWrapper] Direct stderr:', text.substring(0, 200));
          onDataHandlers.forEach(fn => fn(text));
        });

        ptyProcess.on('close', (code) => {
          console.log('[ClaudeWrapper] Process closed with code:', code);
          onExitHandlers.forEach(fn => fn({ exitCode: code ?? 0 }));
        });

        ptyProcess.on('error', (err) => {
          console.error('[ClaudeWrapper] Process error:', err.message);
          onErrorHandlers.forEach(fn => fn(err));
        });

        // PTY-compatible wrapper
        ptyProcess.onData = (fn) => onDataHandlers.push(fn);
        ptyProcess.onExit = (fn) => onExitHandlers.push(fn);
        ptyProcess.onError = (fn) => onErrorHandlers.push(fn);
        ptyProcess.write = (data) => ptyProcess.stdin?.write(data);
        ptyProcess.sendEsc = () => {
          if (ptyProcess.stdin?.writable) {
            ptyProcess.stdin.write('\x1b');
            return true;
          }
          return false;
        };
        ptyProcess.kill = (signal) => killProc(signal);
        ptyProcess.pid = ptyProcess.pid;

        // Claude Code blocks waiting for stdin EOF when stdin is not a TTY.
        // In --print mode we don't need stdin, so close it to avoid hanging.
        if (ptyProcess.stdin && !ptyProcess.stdin.destroyed) {
          ptyProcess.stdin.end();
        }
      } catch (err) {
        const msg = `Failed to spawn Claude CLI: ${err.message}`;
        console.error('[ClaudeWrapper]', msg);
        if (onStatus) {
          onStatus({ type: 'error', category: 'runtime', message: msg });
        }
        return reject(new Error(msg));
      }

      // Register process for interrupt capability
      this.registerProcess(conversationId, ptyProcess, 'pty');

      let stdout = '';

      // Dynamic timeout based on model
      let timeoutMs = 600000; // 10 minutes default
      let timeoutLabel = '10 minutes';
      if (isGLM) {
        timeoutMs = 3600000; // 60 minutes for GLM-4.6 (slow responses)
        timeoutLabel = '60 minutes';
      } else if (isDeepSeek) {
        timeoutMs = 900000; // 15 minutes for DeepSeek
        timeoutLabel = '15 minutes';
      }

      const timeout = setTimeout(() => {
        console.error(`[ClaudeWrapper] Timeout after ${timeoutLabel}`);
        if (onStatus) {
          onStatus({ type: 'error', category: 'timeout', message: `Claude CLI timeout after ${timeoutLabel}` });
        }
        try {
          ptyProcess.kill();
        } catch (e) {
          console.error('[ClaudeWrapper] Failed to kill timed-out process:', e.message);
        }
        if (!promiseSettled) {
          promiseSettled = true;
          reject(new Error(`Claude CLI timeout after ${timeoutLabel}`));
        }
      }, timeoutMs);

      // Process output chunks
      ptyProcess.onData((data) => {
        stdout += data;
        console.log(`[ClaudeWrapper] PTY data chunk: ${data.substring(0, 200)}`);

        // Parse and emit status events
        if (onStatus) {
          try {
            const events = parser.parse(data);
            console.log(`[ClaudeWrapper] Parsed ${events.length} events`);
            events.forEach(event => {
              // Only emit status events (not response chunks)
              if (event.type === 'status' || event.type === 'status_update') {
                console.log(`[ClaudeWrapper] Status: ${event.category} - ${event.message}`);
                onStatus(event);
              }
            });
          } catch (parseError) {
            console.error('[ClaudeWrapper] Parser error:', parseError);
          }
        }
      });

      // Handle exit
      const handleError = (err) => {
        console.error('[ClaudeWrapper] spawn error:', err);

        // Ignore spurious EIO errors that occur after process exit (PTY race condition)
        if (err.code === 'EIO' && promiseSettled) {
          console.log('[ClaudeWrapper] Ignoring post-exit EIO error (PTY race condition)');
          return;
        }

        if (promiseSettled) {
          console.log('[ClaudeWrapper] PTY cleanup error (ignored):', err.code || err.message);
          return;
        }

        promiseSettled = true;

        if (onStatus) {
          onStatus({ type: 'error', category: 'runtime', message: err.message });
        }
        reject(new Error(`Claude CLI spawn error: ${err.message}`));
      };

      if (typeof ptyProcess.on === 'function') {
        ptyProcess.on('error', handleError);
      } else if (typeof ptyProcess.onError === 'function') {
        ptyProcess.onError(handleError);
      }

      ptyProcess.onExit(({ exitCode }) => {
        // Clear timeout on exit
        clearTimeout(timeout);

        // Unregister process on exit
        this.unregisterProcess(conversationId);

        console.log(`[ClaudeWrapper] Exit code: ${exitCode}`);

        if (exitCode !== 0) {
          if (promiseSettled) {
            console.log(`[ClaudeWrapper] Exit after settle (exit ${exitCode}) - ignoring`);
            return;
          }

          // Try to surface a friendlier error if available
          let friendly = null;
          try {
            const lastResult = parser.extractLastResult?.();
            if (lastResult?.is_error && lastResult?.result) {
              friendly = lastResult.result;
            }
          } catch (_) {}

          promiseSettled = true;
          const errMsg = friendly
            ? `Claude error: ${friendly}`
            : `Claude CLI error (exit ${exitCode}): ${stdout.substring(0, 200)}`;
          console.error('[ClaudeWrapper] Error output:', stdout.substring(0, 500));
          reject(new Error(errMsg));
          return;
        }

        if (promiseSettled) {
          console.log('[ClaudeWrapper] Exit already handled - skipping resolve');
          return;
        }

        promiseSettled = true;

        // Extract final response from JSON stream
        const finalResponse = parser.extractFinalResponse();

        // Get real token usage from JSON metadata
        const usageData = parser.getUsage();
        const usage = {
          prompt_tokens: usageData?.input_tokens || 0,
          completion_tokens: usageData?.output_tokens || 0,
          total_tokens: (usageData?.input_tokens || 0) + (usageData?.output_tokens || 0),
          cache_read_tokens: usageData?.cache_read_input_tokens || 0,
          cache_creation_tokens: usageData?.cache_creation_input_tokens || 0,
        };

        console.log(`[ClaudeWrapper] Response length: ${finalResponse.length} chars`);
        console.log(`[ClaudeWrapper] Token usage:`, usage);

        resolve({
          text: finalResponse,
          usage,
        });
      });

    });
  }

  /**
   * Clean up session tracking when conversation is deleted
   */
  deleteSession(conversationId) {
    console.log(`[ClaudeWrapper] Removed session tracking: ${conversationId}`);
  }
}

module.exports = ClaudeWrapper;
