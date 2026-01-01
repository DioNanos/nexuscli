/**
 * CLI warning helper for settings that require restart
 */

const chalk = require('chalk');
const { getServerPid } = require('./server');

function warnIfServerRunning(message) {
  const pid = getServerPid();
  if (!pid) return false;
  const note = message || 'Changes will apply after restart (nexuscli stop && nexuscli start).';
  console.log(chalk.yellow(`  ⚠ Server running (PID: ${pid}). ${note}`));
  return true;
}

module.exports = {
  warnIfServerRunning
};
