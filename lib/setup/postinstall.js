#!/usr/bin/env node
/**
 * NexusCLI Post-Install Script
 * Cross-platform npm-first bootstrap with Termux-specific extras
 */


const { checkPtyDependencies, checkPtyTermuxUtils } = require('./postinstall-pty-check');
const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const pkg = require('../../package.json');

function detectTermux() {
  return (
    process.platform === 'android' ||
    process.env.PREFIX?.includes('com.termux') ||
    process.env.TERMUX_VERSION !== undefined
  );
}

// Check if running in Termux
const isTermux = detectTermux();

// ANSI colors (chalk-free for postinstall)
const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`,
};

function log(msg) {
  console.log(msg);
}

function success(msg) {
  console.log(colors.green(`  ✓ ${msg}`));
}

function warn(msg) {
  console.log(colors.yellow(`  ⚠ ${msg}`));
}

function error(msg) {
  console.log(colors.red(`  ✗ ${msg}`));
}

/**
 * Check if NexusCLI is already configured
 */
function isConfigured() {
  const configPath = path.join(process.env.HOME || '', '.nexuscli', 'config.json');
  return fs.existsSync(configPath);
}

/**
 * Run the setup wizard
 */
function runWizard() {
  return new Promise((resolve, reject) => {
    // Find nexuscli binary
    let nexuscliPath;
    try {
      nexuscliPath = execSync('which nexuscli', { encoding: 'utf8' }).trim();
    } catch {
      // Fallback to relative path
      nexuscliPath = path.join(__dirname, '..', '..', 'bin', 'nexuscli.js');
    }

    console.log('');
    console.log(colors.cyan('Running setup wizard...'));
    console.log('');

    const child = spawn('node', [nexuscliPath, 'init'], {
      stdio: 'inherit'
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Wizard exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      reject(err);
    });
  });
}

function installPackage(pkg) {
  try {
    // Check if already installed
    try {
      execSync(`which ${pkg}`, { stdio: 'ignore' });
      success(`${pkg} already installed`);
      return true;
    } catch {
      // Not installed, proceed
    }

    log(`  Installing ${pkg}...`);
    execSync(`pkg install -y ${pkg}`, { stdio: 'inherit' });
    success(`${pkg} installed`);
    return true;
  } catch (err) {
    warn(`${pkg} installation failed (may need manual install)`);
    return false;
  }
}

async function main() {
  console.log('');

  const versionLabel = `📱 NexusCLI TRI CLI v${pkg.version}`;
  const padding = Math.max(0, 45 - versionLabel.length);
  console.log(colors.bold('╔═══════════════════════════════════════════════════╗'));
  console.log(colors.bold(`║  ${versionLabel}${' '.repeat(padding)}║`));
  console.log(colors.bold('║     Claude • Codex • Gemini • Qwen                ║'));
  console.log(colors.bold('╚═══════════════════════════════════════════════════╝'));
  console.log('');

  if (!isTermux) {
    console.log(colors.cyan('Detected desktop/server platform.'));
    console.log(colors.yellow('  NexusCLI will use npm-first desktop mode with child_process fallback.'));
    console.log('');
  }

  // Required packages
  // - ripgrep is needed by Claude CLI (vendor lookup expects it on Termux)
  const packages = ['termux-api', 'termux-tools', 'ripgrep'];

  if (isTermux) {
    log(colors.cyan('Installing Termux packages:'));
    for (const pkg of packages) {
      installPackage(pkg);
    }
    console.log('');
  } else {
    log(colors.cyan('Skipping Termux package install on this platform'));
    console.log('');
  }

  // Check PTY dependencies
  checkPtyDependencies();

  // Check pty-termux-utils
  checkPtyTermuxUtils();
  console.log('');

  // Create directories
  const HOME = process.env.HOME;
  const dirs = [
    path.join(HOME, '.nexuscli'),
    path.join(HOME, '.nexuscli', 'data'),
    path.join(HOME, '.nexuscli', 'logs'),
    path.join(HOME, '.nexuscli', 'engines'),
    path.join(HOME, '.nexuscli', 'certs')
  ];

  if (isTermux) {
    dirs.push(path.join(HOME, '.termux', 'boot'));
  }

  log(colors.cyan('Creating directories:'));
  for (const dir of dirs) {
    try {
      fs.mkdirSync(dir, { recursive: true });
      success(dir.replace(HOME, '~'));
    } catch (err) {
      warn(`Failed to create ${dir}`);
    }
  }
  console.log('');

  // Generate HTTPS certificates (required for microphone access from remote devices)
  const certPath = path.join(HOME, '.nexuscli', 'certs', 'cert.pem');
  const keyPath = path.join(HOME, '.nexuscli', 'certs', 'key.pem');

  log(colors.cyan('Setting up HTTPS (required for microphone):'));
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    success('HTTPS certificates already exist');
  } else {
    try {
      execSync(
        `openssl req -x509 -newkey rsa:2048 -keyout "${keyPath}" -out "${certPath}" -days 365 -nodes -subj "/CN=nexuscli.local"`,
        { stdio: 'ignore' }
      );
      success('HTTPS certificates generated (self-signed)');
      log(colors.gray('      Note: Browser will show security warning - click "Advanced" > "Proceed"'));
    } catch (err) {
      warn('Failed to generate HTTPS certificates');
      log(colors.gray('      Microphone may not work from remote devices'));
      log(colors.gray('      Run: openssl req -x509 -newkey rsa:2048 -keyout ~/.nexuscli/certs/key.pem -out ~/.nexuscli/certs/cert.pem -days 365 -nodes'));
    }
  }
  console.log('');

  // Check Termux:API app
  if (isTermux) {
    log(colors.cyan('Checking Termux apps:'));
    try {
      execSync('termux-battery-status', { timeout: 5000, stdio: 'ignore' });
      success('Termux:API app working');
    } catch {
      warn('Termux:API app not detected');
      console.log('      Install from F-Droid for notifications & wake-lock');
    }
    console.log('');
  }

  // ============================================
  // AUTO-RUN WIZARD IF NOT CONFIGURED
  // ============================================
  if (isTermux && !isConfigured()) {
    console.log(colors.bold('╔═══════════════════════════════════════════════════╗'));
    console.log(colors.bold('║  First time setup - Running wizard...             ║'));
    console.log(colors.bold('╚═══════════════════════════════════════════════════╝'));

    try {
      await runWizard();
      console.log('');
      console.log(colors.green('  ✓ Setup complete!'));
      console.log('');
      console.log(`  Run ${colors.cyan('nexuscli start')} to launch the server`);
      console.log('');
    } catch (err) {
      console.log('');
      warn('Setup wizard failed or was cancelled');
      console.log(`  Run ${colors.cyan('nexuscli init')} to complete setup manually`);
      console.log('');
    }
  } else if (isTermux) {
    // Already configured
    console.log(colors.bold('╔═══════════════════════════════════════════════════╗'));
    console.log(colors.bold('║  ✅ NexusCLI updated!                              ║'));
    console.log(colors.bold('╚═══════════════════════════════════════════════════╝'));
    console.log('');
    console.log(`  Run ${colors.cyan('nexuscli start')} to launch the server`);
    console.log('');
    console.log(colors.yellow('  Optional apps (install from F-Droid):'));
    console.log('    • Termux:API   - notifications & wake-lock');
    console.log('    • Termux:Boot  - auto-start on device boot');
    console.log('');
  } else {
    console.log(colors.bold('╔═══════════════════════════════════════════════════╗'));
    console.log(colors.bold('║  ✅ NexusCLI ready for Linux/macOS                ║'));
    console.log(colors.bold('╚═══════════════════════════════════════════════════╝'));
    console.log('');
    console.log(`  Run ${colors.cyan('nexuscli start')} to launch the server`);
    console.log(`  Run ${colors.cyan('nexuscli init')} for interactive setup if needed`);
    console.log('');
  }
}

main().catch(err => {
  console.error('Postinstall error:', err.message);
  process.exit(0); // Don't fail npm install
});
