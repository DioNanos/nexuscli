/**
 * nexuscli start - Start the server
 */

const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { spawn, execSync } = require('child_process');
const readline = require('readline');

const { isInitialized, getConfig } = require('../config/manager');
const { PATHS } = require('../utils/paths');
const { isTermux, acquireWakeLock, sendNotification } = require('../utils/termux');

/**
 * Check if server is already running
 */
function isServerRunning() {
  if (!fs.existsSync(PATHS.PID_FILE)) {
    return false;
  }

  try {
    const pid = parseInt(fs.readFileSync(PATHS.PID_FILE, 'utf8').trim());

    // Check if process exists
    process.kill(pid, 0);
    return pid;
  } catch {
    // Process doesn't exist, clean up stale PID file
    try {
      fs.unlinkSync(PATHS.PID_FILE);
    } catch {}
    return false;
  }
}

/**
 * Write PID file
 */
function writePidFile(pid) {
  fs.writeFileSync(PATHS.PID_FILE, String(pid));
}

/**
 * Open URL in browser (Termux-only)
 */
function openBrowser(url) {
  try {
    // Termux: use am start (Android intent) - most reliable
    try {
      execSync(`am start -a android.intent.action.VIEW -d "${url}"`, { stdio: 'ignore' });
    } catch {
      // Fallback to termux-open-url if am fails
      const child = spawn('termux-open-url', [url], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Ask yes/no question
 */
function askYesNo(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes' || normalized === 's' || normalized === 'si');
    });
  });
}

/**
 * Start server in foreground
 */
function startForeground(config) {
  const serverPath = path.join(__dirname, '..', 'server', 'server.js');

  // Set environment variables from config
  process.env.PORT = config.server.port;
  process.env.JWT_SECRET = config.auth.jwt_secret;
  process.env.NEXUSCLI_AUTO_SEED = '0'; // Don't auto-seed, we have config

  // Acquire wake lock on Termux
  if (isTermux() && config.termux.wake_lock) {
    acquireWakeLock();
    console.log(chalk.green('  ✓ Wake-lock acquired'));
  }

  // Start server
  console.log('');
  console.log(chalk.cyan(`Starting NexusCLI on port ${config.server.port}...`));
  console.log('');

  require(serverPath);
}

/**
 * Start server as daemon
 */
function startDaemon(config) {
  const serverPath = path.join(__dirname, '..', 'server', 'server.js');

  // Ensure log directory exists
  if (!fs.existsSync(PATHS.LOGS_DIR)) {
    fs.mkdirSync(PATHS.LOGS_DIR, { recursive: true });
  }

  // Open log file
  const logFile = fs.openSync(PATHS.SERVER_LOG, 'a');

  // Spawn detached process
  const child = spawn('node', [serverPath], {
    detached: true,
    stdio: ['ignore', logFile, logFile],
    env: {
      ...process.env,
      PORT: config.server.port,
      JWT_SECRET: config.auth.jwt_secret,
      NEXUSCLI_AUTO_SEED: '0',
      NEXUSCLI_DAEMON: '1'
    }
  });

  // Write PID file
  writePidFile(child.pid);

  // Unref to allow parent to exit
  child.unref();

  // Acquire wake lock on Termux
  if (isTermux() && config.termux.wake_lock) {
    acquireWakeLock();
  }

  // Send notification on Termux
  if (isTermux() && config.termux.notifications) {
    sendNotification('NexusCLI', `Server running on port ${config.server.port}`);
  }

  return child.pid;
}

/**
 * Main start command
 */
async function start(options) {
  console.log('');

  // Check if initialized
  if (!isInitialized()) {
    console.log(chalk.yellow('NexusCLI is not configured.'));
    console.log(`Run ${chalk.cyan('nexuscli init')} first.`);
    console.log('');
    process.exit(1);
  }

  // Check if already running
  const runningPid = isServerRunning();
  if (runningPid) {
    console.log(chalk.yellow(`Server already running (PID: ${runningPid})`));
    console.log(`Run ${chalk.cyan('nexuscli stop')} to stop it.`);
    console.log('');
    process.exit(1);
  }

  const config = getConfig();
  const port = options.port || config.server.port;
  config.server.port = port;

  const url = `http://localhost:${port}`;

  // Foreground mode (--foreground flag)
  if (options.foreground) {
    startForeground(config);
    return;
  }

  // Default: Daemon mode
  console.log(chalk.bold('Starting NexusCLI...'));
  console.log('');

  const pid = startDaemon(config);

  console.log(chalk.green(`  ✓ Server started (PID: ${pid})`));
  console.log(chalk.gray(`  Logs: ${PATHS.SERVER_LOG}`));
  console.log('');
  console.log(chalk.bold(`  ${chalk.cyan(url)}`));
  console.log('');

  // Ask to open browser (unless --no-browser)
  if (options.browser !== false) {
    const shouldOpen = await askYesNo(`  Open browser? ${chalk.gray('(Y/n)')} `);

    if (shouldOpen) {
      const opened = openBrowser(url);
      if (opened) {
        console.log(chalk.green('  ✓ Browser opened'));
      } else {
        console.log(chalk.yellow('  Could not open browser'));
      }
    }
  }

  console.log('');
}

module.exports = start;
