/**
 * nexuscli status - Show server and engine status
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const { isInitialized, getConfig } = require('../config/manager');
const { PATHS, HOME } = require('../utils/paths');
const { isTermux, isTermuxApiWorking } = require('../utils/termux');

// Get version from package.json
const packageJson = require('../../package.json');
const VERSION = packageJson.version;

/**
 * Check if server is running
 */
function getServerStatus() {
  if (!fs.existsSync(PATHS.PID_FILE)) {
    return { running: false };
  }

  try {
    const pid = parseInt(fs.readFileSync(PATHS.PID_FILE, 'utf8').trim());
    process.kill(pid, 0);

    // Try to get uptime from /proc
    let uptime = null;
    try {
      const stat = fs.statSync(`/proc/${pid}`);
      const uptimeMs = Date.now() - stat.ctimeMs;
      uptime = formatUptime(uptimeMs);
    } catch {}

    return { running: true, pid, uptime };
  } catch {
    return { running: false };
  }
}

/**
 * Format uptime in human readable format
 */
function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

/**
 * Check CLI status for an engine
 */
function getEngineStatus(engine) {
  try {
    const output = execSync(`${engine} --version 2>/dev/null`, { encoding: 'utf8' });
    const version = output.trim().split('\n')[0];
    return { available: true, version };
  } catch {
    return { available: false };
  }
}

/**
 * Count workspaces with sessions
 */
function countWorkspaces() {
  const projectsDir = path.join(HOME, '.claude', 'projects');
  if (!fs.existsSync(projectsDir)) {
    return 0;
  }

  try {
    const entries = fs.readdirSync(projectsDir, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).length;
  } catch {
    return 0;
  }
}

/**
 * Main status command (TRI CLI v0.4.0)
 */
async function status() {
  console.log('');

  if (!isInitialized()) {
    console.log(chalk.yellow('NexusCLI is not configured.'));
    console.log(`Run ${chalk.cyan('nexuscli init')} first.`);
    console.log('');
    return;
  }

  const config = getConfig();
  const serverStatus = getServerStatus();
  const claudeStatus = getEngineStatus('claude');
  const codexStatus = getEngineStatus('codex');
  const geminiStatus = getEngineStatus('gemini');
  const workspaceCount = countWorkspaces();

  // Header
  const header = `NexusCLI Status v${VERSION}`;
  const padding = ' '.repeat(Math.max(0, 41 - header.length));
  console.log(chalk.bold('╔═══════════════════════════════════════════╗'));
  console.log(chalk.bold(`║  ${header}${padding}║`));
  console.log(chalk.bold('╠═══════════════════════════════════════════╣'));

  // Server
  if (serverStatus.running) {
    const uptimeStr = serverStatus.uptime ? ` (${serverStatus.uptime})` : '';
    console.log(chalk.bold(`║  Server: ${chalk.green('✓ Running')} ${chalk.gray(`PID ${serverStatus.pid}`)}${uptimeStr}`));
  } else {
    console.log(chalk.bold(`║  Server: ${chalk.red('✗ Stopped')}`));
  }

  const httpPort = config.server.port;
  const httpsPort = parseInt(config.server.port) + 1;
  console.log(chalk.bold(`║  Ports:  HTTP ${chalk.white(httpPort)} / HTTPS ${chalk.white(httpsPort)}`));
  console.log(chalk.bold('║'));

  // Engines
  console.log(chalk.bold('║  Engines:'));

  // Claude
  if (claudeStatus.available) {
    const model = config.engines?.claude?.model || 'sonnet';
    console.log(chalk.bold(`║    Claude: ${chalk.green('✓')} ${chalk.gray(model)}`));
  } else {
    console.log(chalk.bold(`║    Claude: ${chalk.red('✗')} ${chalk.gray('not found')}`));
  }

  // Codex
  if (codexStatus.available) {
    const enabled = config.engines?.codex?.enabled;
    const model = config.engines?.codex?.model || 'gpt-5.1-codex-max';
    if (enabled) {
      console.log(chalk.bold(`║    Codex:  ${chalk.green('✓')} ${chalk.gray(model)}`));
    } else {
      console.log(chalk.bold(`║    Codex:  ${chalk.gray('○')} ${chalk.gray('disabled')}`));
    }
  } else {
    console.log(chalk.bold(`║    Codex:  ${chalk.gray('○')} ${chalk.gray('not found')}`));
  }

  // Gemini
  if (geminiStatus.available) {
    const enabled = config.engines?.gemini?.enabled;
    const model = config.engines?.gemini?.model || 'gemini-3-pro-preview';
    if (enabled) {
      console.log(chalk.bold(`║    Gemini: ${chalk.green('✓')} ${chalk.gray(model)}`));
    } else {
      console.log(chalk.bold(`║    Gemini: ${chalk.gray('○')} ${chalk.gray('disabled')}`));
    }
  } else {
    console.log(chalk.bold(`║    Gemini: ${chalk.gray('○')} ${chalk.gray('not found')}`));
  }

  console.log(chalk.bold('║'));

  // Workspaces
  console.log(chalk.bold(`║  Workspaces: ${chalk.white(workspaceCount)} indexed`));

  // Termux status
  if (isTermux()) {
    console.log(chalk.bold('║'));
    console.log(chalk.bold('║  Termux:'));
    console.log(chalk.bold(`║    Wake-lock:  ${config.termux?.wake_lock ? chalk.green('enabled') : chalk.gray('disabled')}`));
    console.log(chalk.bold(`║    Boot-start: ${config.termux?.boot_start ? chalk.green('enabled') : chalk.gray('disabled')}`));

    if (isTermuxApiWorking()) {
      console.log(chalk.bold(`║    API app:    ${chalk.green('working')}`));
    } else {
      console.log(chalk.bold(`║    API app:    ${chalk.yellow('not detected')}`));
    }
  }

  console.log(chalk.bold('╚═══════════════════════════════════════════╝'));
  console.log('');

  // URLs if running
  if (serverStatus.running) {
    console.log(`  HTTP:  ${chalk.cyan(`http://localhost:${httpPort}`)}`);
    console.log(`  HTTPS: ${chalk.cyan(`https://localhost:${httpsPort}`)} (remote + voice)`);
    console.log('');
  }
}

module.exports = status;
