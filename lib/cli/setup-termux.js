/**
 * nexuscli setup-termux - Bootstrap Termux for remote development
 */

const chalk = require('chalk');
const { execSync, spawnSync } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

const { isTermux } = require('../utils/termux');
const { getConfig } = require('../config/manager');

/**
 * Get local IP address
 */
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

// Map package names to their binary names for checking
const packageBinaries = {
  'openssh': 'ssh',
  'openssl': 'openssl',
  'tmux': 'tmux',
  'git': 'git',
  'curl': 'curl',
  'wget': 'wget'
};

/**
 * Check if package is installed
 */
function isPackageInstalled(pkg) {
  const binary = packageBinaries[pkg] || pkg;
  try {
    execSync(`which ${binary}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install package via pkg
 */
function installPackage(pkg) {
  try {
    console.log(chalk.gray(`  Installing ${pkg}...`));
    execSync(`pkg install -y ${pkg}`, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if sshd is running
 */
function isSshdRunning() {
  try {
    execSync('pgrep -x sshd', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Start sshd
 */
function startSshd() {
  try {
    execSync('sshd', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Setup SSH auto-start in shell rc
 */
function setupSshAutoStart() {
  const home = process.env.HOME;
  const rcFiles = ['.zshrc', '.bashrc'];
  const autoStartLine = '# Auto-start SSH\npgrep -x sshd >/dev/null || sshd';

  for (const rcFile of rcFiles) {
    const rcPath = path.join(home, rcFile);
    if (fs.existsSync(rcPath)) {
      const content = fs.readFileSync(rcPath, 'utf8');
      if (!content.includes('pgrep -x sshd')) {
        fs.appendFileSync(rcPath, `\n${autoStartLine}\n`);
        return rcFile;
      }
      return null; // Already configured
    }
  }
  return null;
}

/**
 * Main setup command
 */
async function setupTermux() {
  console.log('');

  // Check Termux
  if (!isTermux()) {
    console.log(chalk.red('This command is for Termux only.'));
    console.log('');
    process.exit(1);
  }

  console.log(chalk.bold('╔═══════════════════════════════════════════════════╗'));
  console.log(chalk.bold('║  📱 NexusCLI Termux Setup                         ║'));
  console.log(chalk.bold('╚═══════════════════════════════════════════════════╝'));
  console.log('');

  // Essential packages
  const packages = ['openssh', 'tmux', 'git', 'curl', 'wget', 'openssl'];

  console.log(chalk.cyan('Installing packages:'));
  for (const pkg of packages) {
    if (isPackageInstalled(pkg)) {
      console.log(chalk.green(`  ✓ ${pkg}`));
    } else {
      const installed = installPackage(pkg);
      if (installed) {
        console.log(chalk.green(`  ✓ ${pkg} installed`));
      } else {
        console.log(chalk.yellow(`  ⚠ ${pkg} failed`));
      }
    }
  }
  console.log('');

  // Setup SSH
  console.log(chalk.cyan('Setting up SSH:'));

  // Generate host keys if needed
  const sshDir = path.join(process.env.PREFIX, 'etc', 'ssh');
  if (!fs.existsSync(path.join(sshDir, 'ssh_host_rsa_key'))) {
    console.log(chalk.gray('  Generating host keys...'));
    try {
      execSync('ssh-keygen -A', { stdio: 'ignore' });
      console.log(chalk.green('  ✓ Host keys generated'));
    } catch {
      console.log(chalk.yellow('  ⚠ Could not generate host keys'));
    }
  }

  // Start sshd
  if (isSshdRunning()) {
    console.log(chalk.green('  ✓ SSH server already running'));
  } else {
    const started = startSshd();
    if (started) {
      console.log(chalk.green('  ✓ SSH server started'));
    } else {
      console.log(chalk.yellow('  ⚠ Could not start SSH server'));
    }
  }

  // Setup auto-start
  const rcFile = setupSshAutoStart();
  if (rcFile) {
    console.log(chalk.green(`  ✓ Auto-start added to ${rcFile}`));
  } else {
    console.log(chalk.gray('  Auto-start already configured'));
  }
  console.log('');

  // Get connection info
  const ip = getLocalIP();
  const user = process.env.USER || 'u0_a362';
  const sshPort = 8022;

  let config;
  try {
    config = getConfig();
  } catch {
    config = { server: { port: 41800 } };
  }
  const httpPort = config.server?.port || 41800;
  const httpsPort = parseInt(httpPort) + 1;

  // Output connection info
  console.log(chalk.bold('╔═══════════════════════════════════════════════════╗'));
  console.log(chalk.bold('║  🔗 Connection Info                               ║'));
  console.log(chalk.bold('╚═══════════════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.cyan('  SSH:'));
  console.log(chalk.white(`    ssh ${user}@${ip} -p ${sshPort}`));
  console.log('');
  console.log(chalk.cyan('  NexusCLI (local):'));
  console.log(chalk.white(`    http://localhost:${httpPort}`));
  console.log('');
  console.log(chalk.cyan('  NexusCLI (remote + voice):'));
  console.log(chalk.white(`    https://${ip}:${httpsPort}`));
  console.log('');
  console.log(chalk.gray('  Note: Set password with: passwd'));
  console.log(chalk.gray('  Note: HTTPS uses self-signed cert (accept in browser)'));
  console.log('');

  process.exit(0);
}

module.exports = setupTermux;
