/**
 * nexuscli workspaces - Manage workspace directories
 *
 * Usage:
 *   nexuscli workspaces                - List configured workspaces
 *   nexuscli workspaces list           - List configured workspaces
 *   nexuscli workspaces set-default <path> - Set default workspace
 *   nexuscli workspaces add <path>     - Add workspace to list
 *   nexuscli workspaces remove <path>  - Remove workspace from list
 *   nexuscli workspaces scan           - Scan for Claude/Codex sessions
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const chalk = require('chalk');
const { getConfig, setConfigValue, getConfigValue } = require('../config/manager');
const { warnIfServerRunning } = require('../utils/restart-warning');

// Directories to scan for sessions
const SCAN_ROOTS = [
  path.join(os.homedir(), 'Dev'),
  path.join(os.homedir(), 'Projects'),
  path.join(os.homedir(), 'projects'),
  path.join(os.homedir(), 'src'),
  path.join(os.homedir(), 'code'),
  path.join(os.homedir(), 'work'),
  os.homedir()
];

// CLI session directories
const CLAUDE_PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const CODEX_SESSIONS = path.join(os.homedir(), '.codex', 'sessions');

/**
 * Expand ~ to home directory
 */
function expandPath(p) {
  if (!p) return p;
  if (p.startsWith('~/')) {
    return path.join(os.homedir(), p.slice(2));
  }
  return path.resolve(p);
}

/**
 * Collapse home directory to ~
 */
function collapsePath(p) {
  const home = os.homedir();
  if (p.startsWith(home)) {
    return '~' + p.slice(home.length);
  }
  return p;
}

/**
 * Convert workspace path to Claude projects slug
 */
function pathToSlug(workspacePath) {
  return workspacePath.replace(/\//g, '-').replace(/\./g, '-');
}

/**
 * List configured workspaces
 */
function listWorkspaces() {
  const config = getConfig();
  const defaultWs = expandPath(config.workspaces?.default || '~/Dev');
  const paths = config.workspaces?.paths || [];

  console.log('\n' + chalk.cyan('📁 Configured Workspaces:\n'));

  if (paths.length === 0) {
    console.log(chalk.gray('  No workspaces configured.'));
    console.log(chalk.gray('  Run: nexuscli workspaces scan'));
  } else {
    paths.forEach(ws => {
      const expanded = expandPath(ws);
      const isDefault = expanded === defaultWs;
      const exists = fs.existsSync(expanded);

      const marker = isDefault ? chalk.green('★ ') : '  ';
      const pathDisplay = collapsePath(expanded);
      const status = exists ? '' : chalk.red(' (not found)');

      console.log(`${marker}${chalk.white(pathDisplay)}${status}`);
    });
  }

  console.log('\n' + chalk.gray(`Default: ${collapsePath(defaultWs)}`));
  console.log('');
}

/**
 * Set default workspace
 */
function setDefault(workspacePath) {
  if (!workspacePath) {
    console.log(chalk.red('\n❌ Usage: nexuscli workspaces set-default <path>\n'));
    return;
  }

  const expanded = expandPath(workspacePath);

  if (!fs.existsSync(expanded)) {
    console.log(chalk.red(`\n❌ Path not found: ${expanded}\n`));
    return;
  }

  if (!fs.statSync(expanded).isDirectory()) {
    console.log(chalk.red(`\n❌ Not a directory: ${expanded}\n`));
    return;
  }

  // Set as default
  setConfigValue('workspaces.default', collapsePath(expanded));

  // Also add to paths if not present
  const paths = getConfigValue('workspaces.paths') || [];
  const collapsed = collapsePath(expanded);
  if (!paths.includes(collapsed) && !paths.includes(expanded)) {
    paths.push(collapsed);
    setConfigValue('workspaces.paths', paths);
  }

  console.log(chalk.green(`\n✅ Default workspace set to: ${collapsed}\n`));
  warnIfServerRunning();
}

/**
 * Add workspace to list
 */
function addWorkspace(workspacePath) {
  if (!workspacePath) {
    console.log(chalk.red('\n❌ Usage: nexuscli workspaces add <path>\n'));
    return;
  }

  const expanded = expandPath(workspacePath);

  if (!fs.existsSync(expanded)) {
    console.log(chalk.red(`\n❌ Path not found: ${expanded}\n`));
    return;
  }

  if (!fs.statSync(expanded).isDirectory()) {
    console.log(chalk.red(`\n❌ Not a directory: ${expanded}\n`));
    return;
  }

  const paths = getConfigValue('workspaces.paths') || [];
  const collapsed = collapsePath(expanded);

  if (paths.includes(collapsed) || paths.includes(expanded)) {
    console.log(chalk.yellow(`\n⚠️  Workspace already in list: ${collapsed}\n`));
    return;
  }

  paths.push(collapsed);
  setConfigValue('workspaces.paths', paths);

  console.log(chalk.green(`\n✅ Added workspace: ${collapsed}\n`));
  warnIfServerRunning();
}

/**
 * Remove workspace from list
 */
function removeWorkspace(workspacePath) {
  if (!workspacePath) {
    console.log(chalk.red('\n❌ Usage: nexuscli workspaces remove <path>\n'));
    return;
  }

  const expanded = expandPath(workspacePath);
  const collapsed = collapsePath(expanded);

  let paths = getConfigValue('workspaces.paths') || [];
  const originalLen = paths.length;

  paths = paths.filter(p => {
    const pExpanded = expandPath(p);
    return pExpanded !== expanded;
  });

  if (paths.length === originalLen) {
    console.log(chalk.yellow(`\n⚠️  Workspace not in list: ${collapsed}\n`));
    return;
  }

  setConfigValue('workspaces.paths', paths);

  // If removed default, clear it
  const defaultWs = expandPath(getConfigValue('workspaces.default') || '');
  if (defaultWs === expanded) {
    setConfigValue('workspaces.default', paths[0] || '~/Dev');
  }

  console.log(chalk.green(`\n✅ Removed workspace: ${collapsed}\n`));
  warnIfServerRunning();
}

/**
 * Scan for workspaces with Claude/Codex sessions
 */
function scanWorkspaces() {
  console.log('\n' + chalk.cyan('🔍 Scanning for workspaces with AI sessions...\n'));

  const foundWorkspaces = new Map(); // path -> { claude: count, codex: count }

  // 1. Scan Claude projects directory
  if (fs.existsSync(CLAUDE_PROJECTS)) {
    console.log(chalk.gray(`  Scanning ${CLAUDE_PROJECTS}...`));

    const dirs = fs.readdirSync(CLAUDE_PROJECTS, { withFileTypes: true });

    for (const dir of dirs) {
      if (!dir.isDirectory()) continue;

      const projectDir = path.join(CLAUDE_PROJECTS, dir.name);
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
        } catch (err) {
          // Fallback: convert slug back to path
          workspacePath = '/' + dir.name.replace(/^-/, '').replace(/-/g, '/');
        }

        if (workspacePath && fs.existsSync(workspacePath)) {
          const existing = foundWorkspaces.get(workspacePath) || { claude: 0, codex: 0 };
          existing.claude = sessionFiles.length;
          foundWorkspaces.set(workspacePath, existing);
        }
      }
    }
  }

  // 2. Scan Codex sessions directory
  if (fs.existsSync(CODEX_SESSIONS)) {
    console.log(chalk.gray(`  Scanning ${CODEX_SESSIONS}...`));

    const sessionFiles = fs.readdirSync(CODEX_SESSIONS)
      .filter(f => f.endsWith('.json'));

    // Codex sessions might have workspace in their metadata
    // For now, count them without workspace association
    if (sessionFiles.length > 0) {
      console.log(chalk.gray(`  Found ${sessionFiles.length} Codex sessions (global)`));
    }
  }

  // 3. Display results
  console.log('');

  if (foundWorkspaces.size === 0) {
    console.log(chalk.yellow('  No workspaces with sessions found.\n'));
    return;
  }

  console.log(chalk.green(`Found ${foundWorkspaces.size} workspaces with sessions:\n`));

  // Sort by session count
  const sorted = [...foundWorkspaces.entries()]
    .sort((a, b) => (b[1].claude + b[1].codex) - (a[1].claude + a[1].codex));

  // Get current configured paths
  const currentPaths = (getConfigValue('workspaces.paths') || []).map(expandPath);

  for (const [ws, counts] of sorted) {
    const isConfigured = currentPaths.includes(ws);
    const marker = isConfigured ? chalk.green('✓') : chalk.yellow('○');
    const claudeCount = counts.claude ? chalk.cyan(`Claude: ${counts.claude}`) : '';
    const codexCount = counts.codex ? chalk.magenta(`Codex: ${counts.codex}`) : '';
    const sessionInfo = [claudeCount, codexCount].filter(Boolean).join(', ');

    console.log(`  ${marker} ${collapsePath(ws)}`);
    console.log(chalk.gray(`      ${sessionInfo}`));
  }

  // Ask to add unconfigured workspaces
  const unconfigured = sorted.filter(([ws]) => !currentPaths.includes(ws));

  if (unconfigured.length > 0) {
    console.log(chalk.cyan(`\nTo add these workspaces, run:`));
    for (const [ws] of unconfigured) {
      console.log(chalk.gray(`  nexuscli workspaces add "${collapsePath(ws)}"`));
    }
  }

  console.log('');
}

/**
 * Main workspaces command
 */
async function workspacesCommand(action, arg) {
  if (!action || action === 'list') {
    listWorkspaces();
    return;
  }

  switch (action) {
    case 'set-default':
      setDefault(arg);
      break;

    case 'add':
      addWorkspace(arg);
      break;

    case 'remove':
    case 'rm':
      removeWorkspace(arg);
      break;

    case 'scan':
      scanWorkspaces();
      break;

    default:
      console.log(chalk.red(`\n❌ Unknown action: ${action}`));
      console.log('\nUsage:');
      console.log('  nexuscli workspaces           - List configured workspaces');
      console.log('  nexuscli workspaces set-default <path> - Set default');
      console.log('  nexuscli workspaces add <path>    - Add workspace');
      console.log('  nexuscli workspaces remove <path> - Remove workspace');
      console.log('  nexuscli workspaces scan          - Scan for sessions');
      console.log('');
  }
}

module.exports = workspacesCommand;
