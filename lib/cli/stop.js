/**
 * nexuscli stop - Stop the daemon
 */

const chalk = require('chalk');
const { stopServer } = require('../utils/server');

/**
 * Main stop command
 */
async function stop() {
  console.log('');

  const result = stopServer();

  if (!result.running) {
    console.log(chalk.yellow('No running daemon found.'));
    console.log('');
    return;
  }

  if (result.error) {
    console.log(chalk.red(`  ✗ Error stopping server: ${result.error.message}`));
    console.log('');
    process.exit(1);
  }

  console.log(chalk.green(`  ✓ Server stopped (PID: ${result.pid})`));
  if (result.wakeLockReleased) {
    console.log(chalk.gray('  Wake-lock released'));
  }
  console.log('');
}

module.exports = stop;
