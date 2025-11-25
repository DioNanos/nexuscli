/**
 * nexuscli init - Setup wizard
 */

const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const { isInitialized, initializeConfig, getConfig, setConfigValue } = require('../config/manager');
const { PATHS, ensureDirectories, HOME } = require('../utils/paths');
const { isTermux, checkRequiredPackages, isTermuxApiWorking } = require('../utils/termux');
const pkg = require('../../package.json');

// AI CLI session directories
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const CODEX_SESSIONS = path.join(os.homedir(), '.codex', 'sessions');
const GEMINI_SESSIONS = path.join(os.homedir(), '.gemini', 'sessions');

// Default workspace path - always ~/nexuswork (user can change during setup)
const DEFAULT_WORKSPACE = path.join(os.homedir(), 'nexuswork');

/**
 * Detect Claude CLI path
 */
function detectClaudePath() {
  const candidates = [
    path.join(HOME, '.claude', 'local', 'claude'),
    path.join(process.env.PREFIX || '/usr', 'bin', 'claude'),
    '/usr/local/bin/claude',
    '/usr/bin/claude'
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  // Try which
  try {
    return execSync('which claude', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Detect Codex CLI path
 */
function detectCodexPath() {
  const candidates = [
    path.join(HOME, '.codex', 'bin', 'codex'),
    path.join(process.env.PREFIX || '/usr', 'bin', 'codex'),
    '/usr/local/bin/codex',
    '/usr/bin/codex'
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  try {
    return execSync('which codex', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Detect Gemini CLI path
 */
function detectGeminiPath() {
  const candidates = [
    path.join(HOME, '.local', 'bin', 'gemini'),
    path.join(process.env.PREFIX || '/usr', 'bin', 'gemini'),
    '/usr/local/bin/gemini',
    '/usr/bin/gemini'
  ];

  for (const p of candidates) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  try {
    return execSync('which gemini', { encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

/**
 * Detect all available AI engines (TRI CLI v0.4.0)
 */
function detectEngines() {
  return {
    claude: {
      path: detectClaudePath(),
      hasSessions: fs.existsSync(CLAUDE_PROJECTS)
    },
    codex: {
      path: detectCodexPath(),
      hasSessions: fs.existsSync(CODEX_SESSIONS)
    },
    gemini: {
      path: detectGeminiPath(),
      hasSessions: fs.existsSync(GEMINI_SESSIONS)
    }
  };
}

/**
 * Count sessions for each engine (TRI CLI v0.4.0)
 */
function countSessions() {
  const counts = { claude: 0, codex: 0, gemini: 0 };

  // Count Claude sessions
  if (fs.existsSync(CLAUDE_PROJECTS)) {
    try {
      const dirs = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true });
      for (const dir of dirs) {
        if (dir.isDirectory()) {
          const projectDir = path.join(CLAUDE_PROJECTS, dir.name);
          const sessions = fs.readdirSync(projectDir)
            .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));
          counts.claude += sessions.length;
        }
      }
    } catch {}
  }

  // Count Codex sessions
  if (fs.existsSync(CODEX_SESSIONS)) {
    try {
      const files = fs.readdirSync(CODEX_SESSIONS)
        .filter(f => f.endsWith('.json'));
      counts.codex = files.length;
    } catch {}
  }

  // Count Gemini sessions
  if (fs.existsSync(GEMINI_SESSIONS)) {
    try {
      const files = fs.readdirSync(GEMINI_SESSIONS)
        .filter(f => f.endsWith('.json') || f.endsWith('.jsonl'));
      counts.gemini = files.length;
    } catch {}
  }

  return counts;
}

/**
 * Find workspace directories (excluding DEFAULT_WORKSPACE to avoid duplication)
 */
function findWorkspaces() {
  // NOTE: Dev/ excluded - typically contains development repos, not user workspaces
  const candidates = [
    path.join(HOME, 'Projects'),
    path.join(HOME, 'projects'),
    path.join(HOME, 'src'),
    path.join(HOME, 'workspace'),
    path.join(HOME, 'work')
  ];

  // Return unique existing paths (DEFAULT_WORKSPACE handled separately)
  const existing = candidates.filter(p => fs.existsSync(p) && p !== DEFAULT_WORKSPACE);
  return [...new Set(existing)];
}

/**
 * Scan existing sessions and find workspaces with AI activity
 */
function scanExistingSessions() {
  const foundWorkspaces = new Map();

  // Scan Claude projects directory
  if (fs.existsSync(CLAUDE_PROJECTS)) {
    const dirs = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const projectDir = path.join(CLAUDE_PROJECTS, dir.name);
      try {
        const sessionFiles = fs.readdirSync(projectDir)
          .filter(f => f.endsWith('.jsonl') && !f.startsWith('agent-'));

        if (sessionFiles.length > 0) {
          // Read workspace path from first session file
          let workspacePath = null;
          try {
            const firstFile = path.join(projectDir, sessionFiles[0]);
            const firstLine = fs.readFileSync(firstFile, 'utf8').split('\n')[0];
            const entry = JSON.parse(firstLine);
            workspacePath = entry.cwd;
          } catch {
            // Fallback: convert slug back to path
            workspacePath = '/' + dir.name.replace(/^-/, '').replace(/-/g, '/');
          }

          if (workspacePath && fs.existsSync(workspacePath)) {
            const existing = foundWorkspaces.get(workspacePath) || { claude: 0, codex: 0 };
            existing.claude = sessionFiles.length;
            foundWorkspaces.set(workspacePath, existing);
          }
        }
      } catch {}
    }
  }

  return foundWorkspaces;
}

/**
 * Main init command
 */
async function init(options) {
  console.log('');
  console.log(chalk.bold('╔═══════════════════════════════════════════╗'));
  console.log(chalk.bold('║   🚀 NexusCLI Setup Wizard                ║'));
  console.log(chalk.bold(`║      TRI CLI v${pkg.version}                       ║`));
  console.log(chalk.bold('╚═══════════════════════════════════════════╝'));
  console.log('');

  // Check if already initialized
  if (isInitialized() && !options.yes) {
    const { overwrite } = await inquirer.prompt([{
      type: 'confirm',
      name: 'overwrite',
      message: 'NexusCLI is already configured. Overwrite?',
      default: false
    }]);

    if (!overwrite) {
      console.log(chalk.yellow('\nSetup cancelled.'));
      return;
    }
  }

  // Show environment
  console.log(chalk.cyan('Environment:'));
  if (isTermux()) {
    console.log(chalk.green('  ✓ Termux detected'));

    // Check packages
    const pkgStatus = checkRequiredPackages();
    for (const [pkg, installed] of Object.entries(pkgStatus)) {
      if (installed) {
        console.log(chalk.green(`  ✓ ${pkg} installed`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${pkg} not installed`));
      }
    }

    // Check API app
    if (isTermuxApiWorking()) {
      console.log(chalk.green('  ✓ Termux:API app working'));
    } else {
      console.log(chalk.yellow('  ⚠ Termux:API app not detected (optional)'));
    }
  } else {
    console.log(chalk.blue('  Desktop/VPS mode'));
  }
  console.log('');

  // Detect ALL AI engines
  const engines = detectEngines();
  const sessionCounts = countSessions();

  console.log(chalk.cyan('AI Engines Detected (TRI CLI):'));

  // Claude
  if (engines.claude.path) {
    const sessInfo = sessionCounts.claude > 0 ? chalk.gray(` (${sessionCounts.claude} sessions)`) : '';
    console.log(chalk.green(`  ✓ Claude CLI: ${engines.claude.path}${sessInfo}`));
  } else if (engines.claude.hasSessions) {
    console.log(chalk.yellow(`  ⚠ Claude: CLI not found but ${sessionCounts.claude} sessions exist`));
  } else {
    console.log(chalk.gray('  ○ Claude CLI: not installed'));
  }

  // Codex
  if (engines.codex.path) {
    const sessInfo = sessionCounts.codex > 0 ? chalk.gray(` (${sessionCounts.codex} sessions)`) : '';
    console.log(chalk.green(`  ✓ Codex CLI: ${engines.codex.path}${sessInfo}`));
  } else if (engines.codex.hasSessions) {
    console.log(chalk.yellow(`  ⚠ Codex: CLI not found but ${sessionCounts.codex} sessions exist`));
  } else {
    console.log(chalk.gray('  ○ Codex CLI: not installed'));
  }

  // Gemini
  if (engines.gemini.path) {
    const sessInfo = sessionCounts.gemini > 0 ? chalk.gray(` (${sessionCounts.gemini} sessions)`) : '';
    console.log(chalk.green(`  ✓ Gemini CLI: ${engines.gemini.path}${sessInfo}`));
  } else if (engines.gemini.hasSessions) {
    console.log(chalk.yellow(`  ⚠ Gemini: CLI not found but ${sessionCounts.gemini} sessions exist`));
  } else {
    console.log(chalk.gray('  ○ Gemini CLI: not installed'));
  }

  console.log('');

  let answers = {};

  // Build engine choices based on detection (TRI CLI v0.4.0)
  const engineChoices = [];
  if (engines.claude.path) {
    engineChoices.push({ name: 'Claude CLI (Anthropic)', value: 'claude', checked: true });
  }
  if (engines.codex.path) {
    engineChoices.push({ name: 'Codex CLI (OpenAI)', value: 'codex', checked: true });
  }
  if (engines.gemini.path) {
    engineChoices.push({ name: 'Gemini CLI (Google)', value: 'gemini', checked: true });
  }

  // Determine default workspace
  const existingWorkspaces = findWorkspaces();
  const defaultWsExists = fs.existsSync(DEFAULT_WORKSPACE);
  const defaultWorkspace = defaultWsExists ? DEFAULT_WORKSPACE : (existingWorkspaces[0] || HOME);

  if (options.yes) {
    // Use defaults
    answers = {
      username: 'tux',
      password: 'tux',
      port: 41800,
      defaultWorkspace: defaultWorkspace,
      workspaces: existingWorkspaces.slice(0, 3),
      enabledEngines: engineChoices.map(e => e.value),
      scanSessions: true,
      wakeLock: true,
      notifications: true,
      bootStart: false,
      checkEnginesOnBoot: false
    };
  } else {
    // Interactive prompts - Part 1: Basic setup
    const basicAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Admin username:',
        default: 'tux'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Admin password:',
        default: 'tux',
        mask: '*'
      },
      {
        type: 'number',
        name: 'port',
        message: 'Server port:',
        default: 41800
      }
    ]);
    answers = { ...answers, ...basicAnswers };

    // Part 2: Workspace configuration
    console.log('');
    console.log(chalk.cyan('Workspace Configuration:'));

    const workspaceAnswers = await inquirer.prompt([
      {
        type: 'input',
        name: 'defaultWorkspace',
        message: 'Default workspace path:',
        default: DEFAULT_WORKSPACE,
        validate: (input) => {
          if (!input) return 'Path is required';
          return true;
        }
      },
      {
        type: 'checkbox',
        name: 'workspaces',
        message: 'Additional workspace directories:',
        choices: existingWorkspaces.map(w => ({
          name: w.replace(HOME, '~'),
          value: w,
          checked: false
        }))
      }
    ]);
    answers = { ...answers, ...workspaceAnswers };

    // Part 3: Engine selection (if any detected)
    if (engineChoices.length > 0) {
      console.log('');
      console.log(chalk.cyan('AI Engine Configuration:'));

      const engineAnswers = await inquirer.prompt([
        {
          type: 'checkbox',
          name: 'enabledEngines',
          message: 'Select AI engines to enable:',
          choices: engineChoices
        }
      ]);
      answers = { ...answers, ...engineAnswers };
    } else {
      answers.enabledEngines = [];
    }

    // Part 4: Session scan option
    const totalSessions = sessionCounts.claude + sessionCounts.codex + sessionCounts.gemini;
    if (totalSessions > 0) {
      console.log('');
      console.log(chalk.cyan(`Found ${totalSessions} existing AI sessions.`));

      const scanAnswers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'scanSessions',
          message: 'Scan and import existing sessions?',
          default: true
        }
      ]);
      answers = { ...answers, ...scanAnswers };
    } else {
      answers.scanSessions = false;
    }

    // Part 5: Termux-specific options
    if (isTermux()) {
      console.log('');
      console.log(chalk.cyan('Termux Options:'));

      const termuxAnswers = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'wakeLock',
          message: 'Enable wake-lock (keep CPU active)?',
          default: true
        },
        {
          type: 'confirm',
          name: 'notifications',
          message: 'Enable notifications?',
          default: true
        },
        {
          type: 'confirm',
          name: 'bootStart',
          message: 'Auto-start on device boot?',
          default: false
        }
      ]);
      answers = { ...answers, ...termuxAnswers };

      // If boot start enabled, ask about engine re-check
      if (answers.bootStart && engineChoices.length > 0) {
        const bootCheckAnswers = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'checkEnginesOnBoot',
            message: 'Re-check AI engines availability on each boot?',
            default: true
          }
        ]);
        answers = { ...answers, ...bootCheckAnswers };
      } else {
        answers.checkEnginesOnBoot = false;
      }
    }
  }

  // Ensure at least one workspace
  if (!answers.workspaces || answers.workspaces.length === 0) {
    answers.workspaces = [HOME];
  }

  // Add default workspace to list if not present
  const allWorkspaces = [...new Set([answers.defaultWorkspace, ...answers.workspaces])];

  // Create default workspace directory if it doesn't exist
  if (answers.defaultWorkspace && !fs.existsSync(answers.defaultWorkspace)) {
    try {
      fs.mkdirSync(answers.defaultWorkspace, { recursive: true });
      console.log(chalk.green(`  ✓ Created workspace directory: ${answers.defaultWorkspace}`));
    } catch (err) {
      console.log(chalk.yellow(`  ⚠ Could not create ${answers.defaultWorkspace}: ${err.message}`));
    }
  }

  // Create config
  console.log('');
  const spinner = ora('Creating configuration...').start();

  ensureDirectories();

  const config = initializeConfig({
    username: answers.username,
    password: answers.password,
    port: answers.port,
    workspaces: allWorkspaces,
    defaultWorkspace: answers.defaultWorkspace,
    wakeLock: answers.wakeLock,
    notifications: answers.notifications,
    bootStart: answers.bootStart
  });

  if (!config) {
    spinner.fail('Failed to create configuration');
    process.exit(1);
  }

  spinner.succeed('Configuration created');

  // Configure engines based on selection
  if (answers.enabledEngines && answers.enabledEngines.length > 0) {
    const engineSpinner = ora('Configuring AI engines...').start();

    // Set enabled engines
    setConfigValue('engines.active', answers.enabledEngines);

    for (const engine of answers.enabledEngines) {
      setConfigValue(`engines.${engine}.enabled`, true);
      if (engines[engine]?.path) {
        setConfigValue(`engines.${engine}.path`, engines[engine].path);
      }
    }

    // Set check on boot option
    if (answers.checkEnginesOnBoot) {
      setConfigValue('engines.check_on_boot', true);
    }

    engineSpinner.succeed(`Configured ${answers.enabledEngines.length} AI engine(s)`);
  }

  // Scan existing sessions if requested
  if (answers.scanSessions) {
    const scanSpinner = ora('Scanning existing sessions...').start();

    const foundWorkspaces = scanExistingSessions();

    if (foundWorkspaces.size > 0) {
      // Add discovered workspaces to config
      const currentPaths = allWorkspaces.map(p => path.resolve(p));

      for (const [ws] of foundWorkspaces) {
        if (!currentPaths.includes(path.resolve(ws))) {
          allWorkspaces.push(ws);
        }
      }

      setConfigValue('workspaces.paths', allWorkspaces);
      scanSpinner.succeed(`Found ${foundWorkspaces.size} workspaces with sessions`);
    } else {
      scanSpinner.info('No additional workspaces found');
    }
  }

  // Setup boot if requested
  if (answers.bootStart && isTermux()) {
    const bootSpinner = ora('Setting up auto-start...').start();
    try {
      // Generate conditional script sections based on user preferences
      const wakeLockSection = answers.wakeLock ? `
# Acquire wake lock to keep CPU active
termux-wake-lock
` : '# Wake lock disabled by user';

      const engineCheckScript = (answers.checkEnginesOnBoot && answers.notifications) ? `
# Check AI engines availability
echo "Checking AI engines..."
nexuscli engines list > /tmp/nexuscli_engines.log 2>&1

# Notify available engines
ENGINES_AVAILABLE=$(nexuscli engines list 2>&1 | grep -c "✓")
if [ "$ENGINES_AVAILABLE" -gt 0 ]; then
  termux-notification --id nexuscli-engines --title "NexusCLI Engines" --content "$ENGINES_AVAILABLE AI engine(s) available"
else
  termux-notification --id nexuscli-engines --title "NexusCLI Engines" --content "No AI engines detected" --priority high
fi
` : (answers.checkEnginesOnBoot ? `
# Check AI engines availability (notifications disabled)
echo "Checking AI engines..."
nexuscli engines list > /tmp/nexuscli_engines.log 2>&1
` : '');

      const notifySection = answers.notifications ? `
# Notify user
termux-notification --id nexuscli --title "NexusCLI" --content "Server running on port ${answers.port}" --priority high
` : '# Notifications disabled by user';

      const bootScript = `#!/data/data/com.termux/files/usr/bin/bash
# NexusCLI Auto-Start - Generated by nexuscli init
# Config: wake_lock=${answers.wakeLock ? 'true' : 'false'}, notifications=${answers.notifications ? 'true' : 'false'}, check_engines=${answers.checkEnginesOnBoot ? 'true' : 'false'}
${wakeLockSection}
# Wait for system initialization
sleep 3
${engineCheckScript}
# Start NexusCLI daemon
nexuscli start --daemon
${notifySection}
`;
      fs.writeFileSync(PATHS.BOOT_SCRIPT, bootScript);
      fs.chmodSync(PATHS.BOOT_SCRIPT, 0o755);

      if (answers.checkEnginesOnBoot) {
        bootSpinner.succeed('Boot script created (with engine check)');
      } else {
        bootSpinner.succeed('Boot script created');
      }
    } catch (err) {
      bootSpinner.warn('Could not create boot script');
    }
  }

  // Summary
  console.log('');
  console.log(chalk.bold('╔═══════════════════════════════════════════╗'));
  console.log(chalk.bold('║  ✅ Setup Complete!                        ║'));
  console.log(chalk.bold('╚═══════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.cyan('Configuration:'));
  console.log(`  User:       ${chalk.white(answers.username)}`);
  console.log(`  Port:       ${chalk.white(answers.port)}`);
  console.log(`  Default WS: ${chalk.white(answers.defaultWorkspace)}`);
  console.log(`  Workspaces: ${chalk.white(allWorkspaces.length)}`);

  // Show engines
  if (answers.enabledEngines && answers.enabledEngines.length > 0) {
    console.log(`  AI Engines: ${chalk.green(answers.enabledEngines.join(', '))}`);
  } else {
    console.log(`  AI Engines: ${chalk.yellow('none configured')}`);
  }

  if (isTermux()) {
    console.log(`  Wake-lock:  ${answers.wakeLock ? chalk.green('enabled') : chalk.gray('disabled')}`);
    console.log(`  Boot-start: ${answers.bootStart ? chalk.green('enabled') : chalk.gray('disabled')}`);
    if (answers.bootStart && answers.checkEnginesOnBoot) {
      console.log(`  Engine check on boot: ${chalk.green('enabled')}`);
    }
  }
  console.log('');
  console.log(chalk.cyan('Next steps:'));
  console.log(`  ${chalk.white('nexuscli start')}      Start the server`);
  console.log(`  ${chalk.white('nexuscli status')}     Check status`);
  console.log(`  ${chalk.white('nexuscli engines')}    Manage AI engines`);
  console.log(`  ${chalk.white('nexuscli workspaces')} Manage workspaces`);
  console.log('');
}

module.exports = init;
