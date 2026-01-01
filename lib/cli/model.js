/**
 * Model Management CLI Command
 * Set/get default model preference
 */

const chalk = require('chalk');
const {
  getConfig,
  setConfigValue,
  isInitialized
} = require('../config/manager');
const {
  getCliTools,
  isValidModelId,
  getAllModels
} = require('../config/models');
const { warnIfServerRunning } = require('../utils/restart-warning');

async function modelCommand(modelId) {
  if (!isInitialized()) {
    console.log(chalk.red('NexusCLI is not initialized.'));
    console.log(chalk.yellow('Run first: nexuscli init'));
    return;
  }

  const cliTools = getCliTools();
  const allModels = getAllModels();

  const printAvailableModels = () => {
    console.log(chalk.bold('\nAvailable models:'));
    for (const [key, cli] of Object.entries(cliTools)) {
      console.log(chalk.dim(`${cli.name}:`));
      for (const model of cli.models || []) {
        const label = model.label || model.name;
        const defaultTag = model.default ? chalk.green(' (default)') : '';
        console.log(`  ${model.id} ${chalk.gray(`- ${label}`)}${defaultTag}`);
      }
    }
  };

  // If no model specified, show current default
  if (!modelId) {
    const config = getConfig();
    const current = config.preferences?.defaultModel;

    if (current) {
      console.log(chalk.bold('Current default model:'));
      console.log(chalk.cyan(`  ${current}`));
    } else {
      console.log(chalk.yellow('No default model set.'));
      console.log(chalk.dim('Usage: nexuscli model <model-id>'));
    }

    printAvailableModels();

    return;
  }

  if (!isValidModelId(modelId)) {
    console.log(chalk.red(`✗ Invalid model: ${modelId}`));
    printAvailableModels();
    process.exitCode = 1;
    return;
  }

  // Set default model
  const success = setConfigValue('preferences.defaultModel', modelId);

  if (success) {
    console.log(chalk.green('✓') + ' Default model set to: ' + chalk.cyan(modelId));
    console.log(chalk.dim('The frontend will now auto-select this model on load.'));
    warnIfServerRunning('If the UI is already open, refresh or restart to apply.');
  } else {
    console.error(chalk.red('✗') + ' Failed to save config');
    process.exit(1);
  }
}

module.exports = { modelCommand };
