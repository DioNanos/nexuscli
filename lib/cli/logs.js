/**
 * nexuscli logs - View server logs
 */

const chalk = require('chalk');
const fs = require('fs');
const { spawn } = require('child_process');

const { PATHS } = require('../utils/paths');

/**
 * Main logs command
 */
async function logs(options) {
  console.log('');

  // Check if log file exists
  if (!fs.existsSync(PATHS.SERVER_LOG)) {
    console.log(chalk.yellow('No log file found.'));
    console.log(chalk.gray(`Expected: ${PATHS.SERVER_LOG}`));
    console.log('');
    console.log('Server may not have been started as daemon yet.');
    console.log(`Run ${chalk.cyan('nexuscli start --daemon')} first.`);
    console.log('');
    return;
  }

  const lines = parseInt(options.lines) || 50;

  if (options.follow) {
    // Follow mode (tail -f)
    console.log(chalk.cyan(`Following logs (Ctrl+C to exit)...`));
    console.log(chalk.gray(`File: ${PATHS.SERVER_LOG}`));
    console.log('');

    const tail = spawn('tail', ['-f', '-n', String(lines), PATHS.SERVER_LOG], {
      stdio: 'inherit'
    });

    // Handle Ctrl+C
    process.on('SIGINT', () => {
      tail.kill();
      console.log('');
      process.exit(0);
    });

    // Wait for tail to exit
    await new Promise((resolve) => {
      tail.on('exit', resolve);
    });
  } else {
    // Static mode (show last N lines)
    console.log(chalk.cyan(`Last ${lines} lines:`));
    console.log(chalk.gray(`File: ${PATHS.SERVER_LOG}`));
    console.log('');

    try {
      const content = fs.readFileSync(PATHS.SERVER_LOG, 'utf8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines).join('\n');
      console.log(lastLines);
    } catch (err) {
      console.log(chalk.red(`Error reading logs: ${err.message}`));
    }

    console.log('');
    console.log(chalk.gray(`Use ${chalk.white('nexuscli logs -f')} to follow live`));
    console.log('');
  }
}

module.exports = logs;
