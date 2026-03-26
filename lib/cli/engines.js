/**
 * nexuscli engines - Manage AI engines
 */

const chalk = require('chalk');
const inquirer = require('inquirer');

const { isInitialized, getConfig, setConfigValue } = require('../config/manager');
const { getCliTools } = require('../config/models');
const { warnIfServerRunning } = require('../utils/restart-warning');
const RuntimeManager = require('../server/services/runtime-manager');

const runtimeManager = new RuntimeManager();

function formatAvailability(runtime) {
  if (runtime.available) {
    return chalk.green('available');
  }
  return chalk.gray('missing');
}

/**
 * List engines status (TRI CLI v0.4.0)
 */
async function listEngines() {
  const config = getConfig();
  const tools = getCliTools();
  const inventory = await runtimeManager.getRuntimeInventory();
  const inventoryByEngine = inventory.reduce((acc, runtime) => {
    if (!acc[runtime.engine]) acc[runtime.engine] = [];
    acc[runtime.engine].push(runtime);
    return acc;
  }, {});

  console.log(chalk.bold('╔═══════════════════════════════════════════╗'));
  console.log(chalk.bold('║  AI Engines (Runtime-Aware)               ║'));
  console.log(chalk.bold('╠═══════════════════════════════════════════╣'));

  for (const [engineId, engine] of Object.entries(tools)) {
    const enabled = config.engines?.[engineId]?.enabled === true || engineId === 'claude';
    const defaultModel = config.engines?.[engineId]?.model || engine.models.find((m) => m.default)?.id || 'n/a';
    const status = enabled ? chalk.green('✓ enabled') : chalk.gray('○ disabled');
    console.log(chalk.bold(`║  ${engine.name.padEnd(8)} ${status} (${defaultModel})`));

    for (const runtime of inventoryByEngine[engineId] || []) {
      const laneLabel = runtime.laneLabel || runtime.lane;
      const version = runtime.installedVersion || 'not installed';
      console.log(chalk.gray(`║           ${laneLabel}: ${runtime.command} · ${formatAvailability(runtime)} · ${version}`));
    }
  }

  console.log(chalk.bold('╚═══════════════════════════════════════════╝'));
}

/**
 * Test an engine
 */
async function testEngine(engine) {
  const inventory = await runtimeManager.getRuntimeInventory();
  const runtimes = inventory.filter((runtime) => runtime.engine === engine);

  console.log(chalk.cyan(`Testing ${engine} runtimes...`));
  for (const runtime of runtimes) {
    const status = runtime.available
      ? chalk.green(`  ✓ ${runtime.lane}: ${runtime.command} (${runtime.installedVersion || 'ok'})`)
      : chalk.red(`  ✗ ${runtime.lane}: ${runtime.command} (${runtime.error || 'missing'})`);
    console.log(status);
  }

  return runtimes.some((runtime) => runtime.available);
}

/**
 * Add/configure an engine (TRI CLI v0.4.0)
 */
async function addEngine() {
  const tools = getCliTools();
  const inventory = await runtimeManager.getRuntimeInventory();
  const choices = Object.entries(tools).map(([engineId, engine]) => {
    const hasRuntime = inventory.some((runtime) => runtime.engine === engineId && runtime.available);
    const status = hasRuntime ? chalk.green('available') : chalk.gray('not installed');
    return {
      name: `${engine.name} (${status})`,
      value: engineId,
    };
  });

  if (choices.length === 0) {
    console.log(chalk.yellow('  No AI engines detected.'));
    console.log(chalk.gray('  Install: claude, codex, gemini, or qwen CLI'));
    return;
  }

  const { engine } = await inquirer.prompt([{
    type: 'list',
    name: 'engine',
    message: 'Select engine to configure:',
    choices
  }]);

  const engineCatalog = tools[engine];
  const runtimeChoices = inventory
    .filter((runtime) => runtime.engine === engine)
    .map((runtime) => ({
      name: `${runtime.laneLabel} (${runtime.command}${runtime.available ? ` · ${runtime.installedVersion || 'available'}` : ' · missing'})`,
      value: runtime.lane,
      disabled: false,
    }));

  const answers = await inquirer.prompt([
    {
      type: 'list',
      name: 'lane',
      message: `Default ${engineCatalog.name} lane:`,
      choices: runtimeChoices,
      default: 'native',
    },
    {
      type: 'list',
      name: 'model',
      message: `Default ${engineCatalog.name} model:`,
      choices: (answers) => engineCatalog.models
        .filter((model) => model.lane === answers.lane)
        .map((model) => ({
          name: model.label || model.name,
          value: model.id,
        })),
      default: (answers) => engineCatalog.models.find((model) => model.lane === answers.lane && model.default)?.id
        || engineCatalog.models.find((model) => model.lane === answers.lane)?.id,
    }
  ]);

  const active = Array.from(new Set([...(getConfig().engines?.active || []), engine]));
  setConfigValue('engines.active', active);
  setConfigValue(`engines.${engine}.enabled`, true);
  setConfigValue(`engines.${engine}.model`, answers.model);
  setConfigValue(`engines.${engine}.lanes.${answers.lane}.enabled`, true);
  console.log(chalk.green(`  ✓ ${engineCatalog.name} configured (${answers.model}, ${answers.lane})`));
  warnIfServerRunning();
}

/**
 * Main engines command
 */
async function engines(action) {
  console.log('');

  if (!isInitialized()) {
    console.log(chalk.yellow('NexusCLI is not configured.'));
    console.log(`Run ${chalk.cyan('nexuscli init')} first.`);
    console.log('');
    return;
  }

  // No action = list
  if (!action || action === 'list') {
    await listEngines();
    console.log('');
    return;
  }

  // Add engine
  if (action === 'add') {
    await addEngine();
    console.log('');
    return;
  }

  // Test engine
  if (action === 'test') {
    const config = getConfig();
    const active = config.engines?.active || ['claude'];

    for (const eng of active) {
      await testEngine(eng);
    }
    console.log('');
    return;
  }

  console.log(chalk.red(`Unknown action: ${action}`));
  console.log('Usage:');
  console.log('  nexuscli engines         List engines');
  console.log('  nexuscli engines add     Add/configure engine');
  console.log('  nexuscli engines test    Test active engines');
  console.log('');
}

module.exports = engines;
