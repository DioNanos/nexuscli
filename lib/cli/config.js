/**
 * nexuscli config - Manage configuration
 */

const chalk = require('chalk');
const inquirer = require('inquirer');

const {
  isInitialized,
  getConfig,
  getConfigValue,
  setConfigValue,
  getConfigKeys
} = require('../config/manager');
const { PATHS } = require('../utils/paths');
const { warnIfServerRunning } = require('../utils/restart-warning');

/**
 * List all config values
 */
function listConfig() {
  const keys = getConfigKeys();
  const maxKeyLen = Math.max(...keys.map(k => k.length));

  console.log(chalk.cyan('Configuration:'));
  console.log(chalk.gray(`  File: ${PATHS.CONFIG_FILE}`));
  console.log('');

  for (const key of keys) {
    const value = getConfigValue(key);
    const displayValue = formatValue(value);
    console.log(`  ${chalk.white(key.padEnd(maxKeyLen))}  ${displayValue}`);
  }
}

/**
 * Format a value for display
 */
function formatValue(value) {
  if (value === null || value === undefined) {
    return chalk.gray('null');
  }
  if (typeof value === 'boolean') {
    return value ? chalk.green('true') : chalk.red('false');
  }
  if (typeof value === 'number') {
    return chalk.yellow(String(value));
  }
  if (Array.isArray(value)) {
    return chalk.cyan(JSON.stringify(value));
  }
  if (typeof value === 'string') {
    // Hide sensitive values
    if (value.length > 20 && (value.includes('-') || value.includes('$'))) {
      return chalk.gray('***hidden***');
    }
    return chalk.white(value);
  }
  return chalk.gray(String(value));
}

/**
 * Main config command
 */
async function config(action, key, value) {
  console.log('');

  if (!isInitialized()) {
    console.log(chalk.yellow('NexusCLI is not configured.'));
    console.log(`Run ${chalk.cyan('nexuscli init')} first.`);
    console.log('');
    return;
  }

  // No action = list all
  if (!action || action === 'list') {
    listConfig();
    console.log('');
    return;
  }

  // Get value
  if (action === 'get') {
    if (!key) {
      console.log(chalk.red('Usage: nexuscli config get <key>'));
      console.log('');
      return;
    }

    const val = getConfigValue(key);
    if (val === undefined) {
      console.log(chalk.yellow(`Key not found: ${key}`));
    } else {
      console.log(formatValue(val));
    }
    console.log('');
    return;
  }

  // Set value
  if (action === 'set') {
    if (!key || value === undefined) {
      console.log(chalk.red('Usage: nexuscli config set <key> <value>'));
      console.log('');
      return;
    }

    // Confirm sensitive changes
    const sensitiveKeys = ['auth.jwt_secret', 'auth.pass_hash'];
    if (sensitiveKeys.includes(key)) {
      const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Changing ${key} may break authentication. Continue?`,
        default: false
      }]);

      if (!confirm) {
        console.log(chalk.yellow('Cancelled.'));
        console.log('');
        return;
      }
    }

    if (setConfigValue(key, value)) {
      console.log(chalk.green(`  ✓ ${key} = ${value}`));
      warnIfServerRunning();
    } else {
      console.log(chalk.red(`  ✗ Failed to set ${key}`));
    }
    console.log('');
    return;
  }

  // Interactive editor
  if (action === 'edit') {
    const currentConfig = getConfig();

    const answers = await inquirer.prompt([
      {
        type: 'number',
        name: 'port',
        message: 'Server port:',
        default: currentConfig.server.port
      },
      {
        type: 'list',
        name: 'claudeModel',
        message: 'Claude default model:',
        choices: ['haiku', 'sonnet', 'opus'],
        default: currentConfig.engines?.claude?.model || 'sonnet'
      },
      {
        type: 'confirm',
        name: 'wakeLock',
        message: 'Enable wake-lock?',
        default: currentConfig.termux?.wake_lock ?? true
      },
      {
        type: 'confirm',
        name: 'notifications',
        message: 'Enable notifications?',
        default: currentConfig.termux?.notifications ?? true
      }
    ]);

    setConfigValue('server.port', answers.port);
    setConfigValue('engines.claude.model', answers.claudeModel);
    setConfigValue('termux.wake_lock', answers.wakeLock);
    setConfigValue('termux.notifications', answers.notifications);

    console.log(chalk.green('  ✓ Configuration updated'));
    warnIfServerRunning();
    console.log('');
    return;
  }

  // Unknown action
  console.log(chalk.red(`Unknown action: ${action}`));
  console.log('Usage:');
  console.log('  nexuscli config           List all');
  console.log('  nexuscli config get <k>   Get value');
  console.log('  nexuscli config set <k> <v>  Set value');
  console.log('  nexuscli config edit      Interactive editor');
  console.log('');
}

module.exports = config;
