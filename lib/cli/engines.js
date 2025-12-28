/**
 * nexuscli engines - Manage AI engines
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const { isInitialized, getConfig, setConfigValue } = require('../config/manager');
const { HOME } = require('../utils/paths');

/**
 * Detect available engines (TRI CLI v0.4.0)
 */
function detectEngines() {
  const engines = {
    claude: { available: false, path: null, version: null },
    codex: { available: false, path: null, version: null },
    gemini: { available: false, path: null, version: null },
    qwen: { available: false, path: null, version: null }
  };

  // Claude
  try {
    const claudePath = execSync('which claude 2>/dev/null', { encoding: 'utf8' }).trim();
    const claudeVersion = execSync('claude --version 2>/dev/null', { encoding: 'utf8' }).trim().split('\n')[0];
    engines.claude = { available: true, path: claudePath, version: claudeVersion };
  } catch {}

  // Codex
  try {
    const codexPath = execSync('which codex 2>/dev/null', { encoding: 'utf8' }).trim();
    const codexVersion = execSync('codex --version 2>/dev/null', { encoding: 'utf8' }).trim().split('\n')[0];
    engines.codex = { available: true, path: codexPath, version: codexVersion };
  } catch {}

  // Gemini
  try {
    const geminiPath = execSync('which gemini 2>/dev/null', { encoding: 'utf8' }).trim();
    const geminiVersion = execSync('gemini --version 2>/dev/null', { encoding: 'utf8' }).trim().split('\n')[0];
    engines.gemini = { available: true, path: geminiPath, version: geminiVersion };
  } catch {}

  // Qwen
  try {
    const qwenPath = execSync('which qwen 2>/dev/null', { encoding: 'utf8' }).trim();
    const qwenVersion = execSync('qwen --version 2>/dev/null', { encoding: 'utf8' }).trim().split('\n')[0];
    engines.qwen = { available: true, path: qwenPath, version: qwenVersion };
  } catch {}

  return engines;
}

/**
 * List engines status (TRI CLI v0.4.0)
 */
function listEngines() {
  const config = getConfig();
  const detected = detectEngines();

  console.log(chalk.bold('╔═══════════════════════════════════════════╗'));
  console.log(chalk.bold('║  AI Engines (TRI CLI)                     ║'));
  console.log(chalk.bold('╠═══════════════════════════════════════════╣'));

  // Claude
  const claudeEnabled = config.engines?.claude?.enabled !== false;
  const claudeModel = config.engines?.claude?.model || 'sonnet';
  if (detected.claude.available) {
    const status = claudeEnabled ? chalk.green('✓ enabled') : chalk.gray('○ disabled');
    console.log(chalk.bold(`║  Claude:  ${status} (${claudeModel})`));
    console.log(chalk.gray(`║           ${detected.claude.version}`));
  } else {
    console.log(chalk.bold(`║  Claude:  ${chalk.red('✗ not installed')}`));
  }

  // Codex
  const codexEnabled = config.engines?.codex?.enabled === true;
  if (detected.codex.available) {
    const status = codexEnabled ? chalk.green('✓ enabled') : chalk.gray('○ disabled');
    console.log(chalk.bold(`║  Codex:   ${status}`));
    console.log(chalk.gray(`║           ${detected.codex.version}`));
  } else {
    console.log(chalk.bold(`║  Codex:   ${chalk.gray('○ not installed')}`));
  }

  // Gemini
  const geminiEnabled = config.engines?.gemini?.enabled === true;
  if (detected.gemini.available) {
    const status = geminiEnabled ? chalk.green('✓ enabled') : chalk.gray('○ disabled');
    console.log(chalk.bold(`║  Gemini:  ${status}`));
    console.log(chalk.gray(`║           ${detected.gemini.version}`));
  } else {
    console.log(chalk.bold(`║  Gemini:  ${chalk.gray('○ not installed')}`));
  }

  // Qwen
  const qwenEnabled = config.engines?.qwen?.enabled === true;
  if (detected.qwen.available) {
    const status = qwenEnabled ? chalk.green('✓ enabled') : chalk.gray('○ disabled');
    console.log(chalk.bold(`║  QWEN:    ${status}`));
    console.log(chalk.gray(`║           ${detected.qwen.version}`));
  } else {
    console.log(chalk.bold(`║  QWEN:    ${chalk.gray('○ not installed')}`));
  }

  console.log(chalk.bold('╚═══════════════════════════════════════════╝'));
}

/**
 * Test an engine
 */
async function testEngine(engine) {
  console.log(chalk.cyan(`Testing ${engine}...`));

  if (engine === 'claude') {
    try {
      execSync('claude --version', { stdio: 'inherit' });
      console.log(chalk.green(`  ✓ Claude CLI is working`));
      return true;
    } catch {
      console.log(chalk.red(`  ✗ Claude CLI failed`));
      return false;
    }
  }

  if (engine === 'codex') {
    try {
      execSync('codex --version', { stdio: 'inherit' });
      console.log(chalk.green(`  ✓ Codex CLI is working`));
      return true;
    } catch {
      console.log(chalk.red(`  ✗ Codex CLI not found`));
      return false;
    }
  }

  if (engine === 'gemini') {
    try {
      execSync('gemini --version', { stdio: 'inherit' });
      console.log(chalk.green(`  ✓ Gemini CLI is working`));
      return true;
    } catch {
      console.log(chalk.red(`  ✗ Gemini CLI not found`));
      return false;
    }
  }

  if (engine === 'qwen') {
    try {
      execSync('qwen --version', { stdio: 'inherit' });
      console.log(chalk.green(`  ✓ Qwen CLI is working`));
      return true;
    } catch {
      console.log(chalk.red(`  ✗ Qwen CLI not found`));
      return false;
    }
  }

  console.log(chalk.yellow(`  Engine ${engine} not testable`));
  return false;
}

/**
 * Add/configure an engine (TRI CLI v0.4.0)
 */
async function addEngine() {
  const detected = detectEngines();

  const choices = [];
  if (detected.claude.available) {
    choices.push({ name: `Claude (${detected.claude.version})`, value: 'claude' });
  }
  if (detected.codex.available) {
    choices.push({ name: `Codex (${detected.codex.version})`, value: 'codex' });
  }
  if (detected.gemini.available) {
    choices.push({ name: `Gemini (${detected.gemini.version})`, value: 'gemini' });
  }
  if (detected.qwen.available) {
    choices.push({ name: `QWEN (${detected.qwen.version})`, value: 'qwen' });
  }

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

  if (engine === 'claude') {
    const { model } = await inquirer.prompt([{
      type: 'list',
      name: 'model',
      message: 'Default Claude model:',
      choices: [
        { name: 'Haiku 4.5 (Fast)', value: 'haiku' },
        { name: 'Sonnet 4.5 (Balanced)', value: 'sonnet' },
        { name: 'Opus 4.5 (Most Intelligent)', value: 'opus' }
      ],
      default: 'sonnet'
    }]);

    setConfigValue('engines.claude.enabled', true);
    setConfigValue('engines.claude.model', model);
    console.log(chalk.green(`  ✓ Claude configured (${model})`));
  }

  if (engine === 'codex') {
    const { model } = await inquirer.prompt([{
      type: 'list',
      name: 'model',
      message: 'Default Codex model:',
      choices: [
        { name: 'GPT-5.2 (Next Gen)', value: 'gpt-5.2' },
        { name: 'GPT-5.1 Codex Max (Best)', value: 'gpt-5.1-codex-max' },
        { name: 'GPT-5.1 Codex', value: 'gpt-5.1-codex' },
        { name: 'GPT-5.1 Codex Mini (Fast)', value: 'gpt-5.1-codex-mini' },
        { name: 'GPT-5.1 (General)', value: 'gpt-5.1' }
      ],
      default: 'gpt-5.1-codex-max'
    }]);

    setConfigValue('engines.codex.enabled', true);
    setConfigValue('engines.codex.model', model);
    console.log(chalk.green(`  ✓ Codex configured (${model})`));
  }

  if (engine === 'gemini') {
    setConfigValue('engines.gemini.enabled', true);
    setConfigValue('engines.gemini.model', 'gemini-3-pro-preview');
    console.log(chalk.green(`  ✓ Gemini configured (gemini-3-pro-preview)`));
  }

  if (engine === 'qwen') {
    const { model } = await inquirer.prompt([{
      type: 'list',
      name: 'model',
      message: 'Default Qwen model:',
      choices: [
        { name: 'Coder (default)', value: 'coder-model' },
        { name: 'Vision', value: 'vision-model' }
      ],
      default: 'coder-model'
    }]);

    setConfigValue('engines.qwen.enabled', true);
    setConfigValue('engines.qwen.model', model);
    console.log(chalk.green(`  ✓ QWEN configured (${model})`));
  }
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
    listEngines();
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
