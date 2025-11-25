/**
 * nexuscli stop - Stop the daemon
 */

const chalk = require('chalk');
const fs = require('fs');

const { PATHS } = require('../utils/paths');
const { isTermux, releaseWakeLock, sendNotification } = require('../utils/termux');
const { getConfig } = require('../config/manager');

/**
 * Main stop command
 */
async function stop() {
  console.log('');

  // Check PID file
  if (!fs.existsSync(PATHS.PID_FILE)) {
    console.log(chalk.yellow('No running daemon found.'));
    console.log('');
    return;
  }

  try {
    const pid = parseInt(fs.readFileSync(PATHS.PID_FILE, 'utf8').trim());

    // Try to kill the process
    try {
      process.kill(pid, 'SIGTERM');
      console.log(chalk.green(`  ✓ Server stopped (PID: ${pid})`));
    } catch (err) {
      if (err.code === 'ESRCH') {
        console.log(chalk.yellow('  Process not found (may have already stopped)'));
      } else {
        throw err;
      }
    }

    // Remove PID file
    fs.unlinkSync(PATHS.PID_FILE);

    // Release wake lock on Termux
    const config = getConfig();
    if (isTermux() && config.termux?.wake_lock) {
      releaseWakeLock();
      console.log(chalk.gray('  Wake-lock released'));
    }

    // Send notification on Termux
    if (isTermux() && config.termux?.notifications) {
      sendNotification('NexusCLI', 'Server stopped');
    }

    console.log('');

  } catch (err) {
    console.log(chalk.red(`  ✗ Error stopping server: ${err.message}`));
    console.log('');
    process.exit(1);
  }
}

module.exports = stop;
