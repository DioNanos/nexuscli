#!/usr/bin/env node
/**
 * NexusCLI - Termux Mobile First AI Control Plane
 * Main CLI entry point
 */

const { program } = require('commander');
const path = require('path');
const pkg = require('../package.json');

// Import CLI commands
const initCommand = require('../lib/cli/init');
const startCommand = require('../lib/cli/start');
const stopCommand = require('../lib/cli/stop');
const statusCommand = require('../lib/cli/status');
const configCommand = require('../lib/cli/config');
const enginesCommand = require('../lib/cli/engines');
const bootCommand = require('../lib/cli/boot');
const logsCommand = require('../lib/cli/logs');
const apiCommand = require('../lib/cli/api');
const workspacesCommand = require('../lib/cli/workspaces');
const usersCommand = require('../lib/cli/users');
const uninstallCommand = require('../lib/cli/uninstall');
const setupTermuxCommand = require('../lib/cli/setup-termux');
const { modelCommand } = require('../lib/cli/model');

program
  .name('nexuscli')
  .description('Termux Mobile First AI Control Plane')
  .version(pkg.version);

// nexuscli init
program
  .command('init')
  .description('Setup wizard - configure NexusCLI for first use')
  .option('-y, --yes', 'Accept defaults without prompting')
  .action(initCommand);

// nexuscli start
program
  .command('start')
  .description('Start the NexusCLI server (daemon by default)')
  .option('-f, --foreground', 'Run in foreground (not daemon)')
  .option('-p, --port <port>', 'Override port (default: 41800)')
  .option('--no-browser', 'Do not prompt to open browser')
  .action(startCommand);

// nexuscli stop
program
  .command('stop')
  .description('Stop the NexusCLI daemon')
  .action(stopCommand);

// nexuscli status
program
  .command('status')
  .description('Show server and engines status')
  .action(statusCommand);

// nexuscli config
program
  .command('config [action] [key] [value]')
  .description('Manage configuration (get/set/list)')
  .action(configCommand);

// nexuscli model
program
  .command('model [model-id]')
  .description('Set/get default model preference')
  .action(modelCommand);

// nexuscli engines
program
  .command('engines [action]')
  .description('Manage AI engines (list/add/test/remove)')
  .action(enginesCommand);

// nexuscli boot
program
  .command('boot <action>')
  .description('Termux boot integration (enable/disable/status)')
  .action(bootCommand);

// nexuscli logs
program
  .command('logs')
  .description('View server logs')
  .option('-f, --follow', 'Follow log output (tail -f)')
  .option('-n, --lines <n>', 'Number of lines to show', '50')
  .action(logsCommand);

// nexuscli api
program
  .command('api [action] [provider] [key]')
  .description('Manage API keys (list/set/delete)')
  .action(apiCommand);

// nexuscli workspaces
program
  .command('workspaces [action] [path]')
  .description('Manage workspace directories (list/set-default/add/remove/scan)')
  .action(workspacesCommand);

// nexuscli users
program
  .command('users [action]')
  .description('User management (list/add/passwd/delete)')
  .option('-u, --username <username>', 'Username')
  .option('-p, --password <password>', 'Password')
  .option('-a, --admin', 'Create as admin user')
  .action(usersCommand);

// nexuscli uninstall
program
  .command('uninstall')
  .description('Prepare for uninstallation (optional data removal)')
  .action(uninstallCommand);

// nexuscli setup-termux
program
  .command('setup-termux')
  .description('Bootstrap Termux for remote development (SSH, packages)')
  .action(setupTermuxCommand);

// Parse arguments
program.parse();

// Show help if no command provided
if (!process.argv.slice(2).length) {
  program.outputHelp();
}
