/**
 * Update + restart helpers
 */

const { spawn, spawnSync } = require('child_process');
const chalk = require('chalk');
const pkg = require('../../package.json');
const { getServerPid, stopServer } = require('./server');

function runUpdateCommand() {
  console.log(chalk.cyan(`Running npm update for ${pkg.name}...`));
  const result = spawnSync('npm', ['update', '-g', pkg.name], { stdio: 'inherit' });

  if (result.error) {
    console.log(chalk.red(`Update failed: ${result.error.message}`));
    return false;
  }

  if (typeof result.status === 'number' && result.status !== 0) {
    console.log(chalk.red(`Update exited with code ${result.status}`));
    return false;
  }

  return true;
}

function restartCli(restartArgs = []) {
  const args = restartArgs.length > 0 ? restartArgs : ['start'];
  const env = { ...process.env, NEXUSCLI_SKIP_UPDATE_CHECK: '1' };

  return new Promise((resolve) => {
    const child = spawn('nexuscli', args, { stdio: 'inherit', env });
    child.on('exit', (code) => resolve(code ?? 0));
  });
}

async function runUpdateAndRestart({ restartArgs = [] } = {}) {
  const runningPid = getServerPid();
  if (runningPid) {
    console.log(chalk.yellow(`Stopping NexusCLI (PID: ${runningPid})...`));
    const stopResult = stopServer();
    if (stopResult.error) {
      console.log(chalk.red(`Failed to stop server: ${stopResult.error.message}`));
      return { ok: false, error: stopResult.error };
    }
  }

  const updated = runUpdateCommand();
  if (!updated) {
    return { ok: false, error: new Error('Update failed') };
  }

  console.log(chalk.green('✓ Update complete. Restarting NexusCLI...'));
  const restartExitCode = await restartCli(restartArgs);
  return { ok: true, restartExitCode };
}

module.exports = {
  runUpdateCommand,
  restartCli,
  runUpdateAndRestart
};
