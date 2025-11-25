/**
 * nexuscli users - User management
 */

const chalk = require('chalk');
const inquirer = require('inquirer');
const { isInitialized } = require('../config/manager');
const { initDb, prepare } = require('../server/db');

/**
 * List all users
 */
async function listUsers() {
  const { getConfig } = require('../config/manager');
  const config = getConfig();

  console.log('');
  console.log(chalk.bold('Users:'));
  console.log('');

  // Show config user (main admin from init)
  if (config.auth && config.auth.user) {
    console.log(`  ${chalk.cyan(config.auth.user)} [${chalk.red('admin')}] ${chalk.gray('(config)')}`);
  }

  // Also check database for additional users
  try {
    await initDb();
    const dbUsers = prepare('SELECT id, username, role FROM users ORDER BY created_at').all();

    for (const user of dbUsers) {
      // Skip if same as config user
      if (config.auth && user.username === config.auth.user) continue;

      const role = user.role === 'admin' ? chalk.red('admin') : chalk.gray('user');
      console.log(`  ${chalk.cyan(user.username)} [${role}]`);
    }
  } catch (err) {
    // DB not available, just show config user
  }

  if (!config.auth?.user) {
    console.log(chalk.yellow('No users found.'));
  }

  console.log('');
}

/**
 * Add a new user
 */
async function addUser(options) {
  await initDb();
  const User = require('../server/models/User');

  let username = options.username;
  let password = options.password;
  let role = options.admin ? 'admin' : 'user';

  // Interactive mode if no username provided
  if (!username) {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Username:',
        validate: (input) => input.length >= 3 || 'Username must be at least 3 characters'
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password:',
        mask: '*',
        validate: (input) => input.length >= 4 || 'Password must be at least 4 characters'
      },
      {
        type: 'confirm',
        name: 'isAdmin',
        message: 'Admin user?',
        default: false
      }
    ]);

    username = answers.username;
    password = answers.password;
    role = answers.isAdmin ? 'admin' : 'user';
  }

  // Check if user exists
  const existing = prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    console.log(chalk.red(`User '${username}' already exists.`));
    process.exit(1);
  }

  // Create user
  try {
    const user = User.create(username, password, role);
    console.log('');
    console.log(chalk.green(`✓ User '${user.username}' created (${user.role})`));
    console.log('');
  } catch (error) {
    console.log(chalk.red(`Error creating user: ${error.message}`));
    process.exit(1);
  }
}

/**
 * Change user password
 */
async function changePassword(options) {
  await initDb();
  const bcrypt = require('bcryptjs');
  const { getDb, saveDb } = require('../server/db');

  let username = options.username;
  let newPassword;

  // Get list of users for selection
  const users = prepare('SELECT username FROM users ORDER BY username').all();

  if (users.length === 0) {
    console.log(chalk.yellow('No users found.'));
    return;
  }

  // Interactive mode
  if (!username) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'username',
        message: 'Select user:',
        choices: users.map(u => u.username)
      },
      {
        type: 'password',
        name: 'newPassword',
        message: 'New password:',
        mask: '*',
        validate: (input) => input.length >= 4 || 'Password must be at least 4 characters'
      },
      {
        type: 'password',
        name: 'confirmPassword',
        message: 'Confirm password:',
        mask: '*'
      }
    ]);

    if (answers.newPassword !== answers.confirmPassword) {
      console.log(chalk.red('Passwords do not match.'));
      process.exit(1);
    }

    username = answers.username;
    newPassword = answers.newPassword;
  } else {
    // Non-interactive: prompt only for password
    const answers = await inquirer.prompt([
      {
        type: 'password',
        name: 'newPassword',
        message: 'New password:',
        mask: '*',
        validate: (input) => input.length >= 4 || 'Password must be at least 4 characters'
      }
    ]);
    newPassword = answers.newPassword;
  }

  // Update password
  const user = prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (!user) {
    console.log(chalk.red(`User '${username}' not found.`));
    process.exit(1);
  }

  const hash = bcrypt.hashSync(newPassword, 10);
  const db = getDb();
  db.run('UPDATE users SET password_hash = ? WHERE username = ?', [hash, username]);
  saveDb();

  console.log('');
  console.log(chalk.green(`✓ Password changed for '${username}'`));
  console.log('');
}

/**
 * Delete a user
 */
async function deleteUser(options) {
  await initDb();
  const { getDb, saveDb } = require('../server/db');

  let username = options.username;

  // Get list of users
  const users = prepare('SELECT username FROM users ORDER BY username').all();

  if (users.length === 0) {
    console.log(chalk.yellow('No users found.'));
    return;
  }

  if (users.length === 1) {
    console.log(chalk.yellow('Cannot delete the only user.'));
    return;
  }

  // Interactive mode
  if (!username) {
    const answers = await inquirer.prompt([
      {
        type: 'list',
        name: 'username',
        message: 'Select user to delete:',
        choices: users.map(u => u.username)
      },
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Are you sure?',
        default: false
      }
    ]);

    if (!answers.confirm) {
      console.log(chalk.gray('Cancelled.'));
      return;
    }

    username = answers.username;
  }

  // Delete user
  const db = getDb();
  const result = db.run('DELETE FROM users WHERE username = ?', [username]);
  saveDb();

  if (result.changes > 0) {
    console.log('');
    console.log(chalk.green(`✓ User '${username}' deleted`));
    console.log('');
  } else {
    console.log(chalk.red(`User '${username}' not found.`));
  }
}

/**
 * Main users command
 */
async function users(subcommand, options = {}) {
  console.log('');

  // Check if initialized
  if (!isInitialized()) {
    console.log(chalk.yellow('NexusCLI is not configured.'));
    console.log(`Run ${chalk.cyan('nexuscli init')} first.`);
    console.log('');
    process.exit(1);
  }

  switch (subcommand) {
    case 'list':
    case 'ls':
      await listUsers();
      break;
    case 'add':
    case 'create':
      await addUser(options);
      break;
    case 'passwd':
    case 'password':
      await changePassword(options);
      break;
    case 'delete':
    case 'del':
    case 'rm':
      await deleteUser(options);
      break;
    default:
      // Show help
      console.log(chalk.bold('User Management'));
      console.log('');
      console.log('Commands:');
      console.log(`  ${chalk.cyan('nexuscli users list')}     List all users`);
      console.log(`  ${chalk.cyan('nexuscli users add')}      Add a new user`);
      console.log(`  ${chalk.cyan('nexuscli users passwd')}   Change password`);
      console.log(`  ${chalk.cyan('nexuscli users delete')}   Delete a user`);
      console.log('');
  }
}

module.exports = users;
