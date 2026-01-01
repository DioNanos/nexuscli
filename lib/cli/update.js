/**
 * nexuscli update - Update NexusCLI and restart
 */

const chalk = require('chalk');
const { getUpdateInfo } = require('../utils/update-check');
const { runUpdateAndRestart } = require('../utils/update-runner');

async function updateCommand() {
  console.log('');

  try {
    const info = await getUpdateInfo({ force: true });
    if (info.latestVersion) {
      console.log(chalk.bold(`Current: ${info.currentVersion}`));
      console.log(chalk.bold(`Latest:  ${info.latestVersion}`));
    }
  } catch {}

  const result = await runUpdateAndRestart({ restartArgs: ['start'] });
  if (!result.ok) {
    process.exit(1);
  }

  process.exit(result.restartExitCode ?? 0);
}

module.exports = updateCommand;
