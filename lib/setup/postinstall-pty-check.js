/**
 * PTY Dependency Check for NexusCLI Post-Install
 * Detects platform and installs appropriate PTY provider
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const colors = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  gray: (s) => `\x1b[90m${s}\x1b[0m`
};

function log(msg) { console.log(msg); }
function success(msg) { console.log(colors.green(`  ✓ ${msg}`)); }
function warn(msg) { console.log(colors.yellow(`  ⚠ ${msg}`)); }
function error(msg) { console.log(colors.red(`  ✗ ${msg}`)); }

/**
 * Detect platform
 */
function detectPlatform() {
  const isTermux =
    process.env.PREFIX?.includes('com.termux') ||
    fs.existsSync('/data/data/com.termux') ||
    process.env.TERMUX_VERSION !== undefined;
  
  const isLinuxArm64 = process.platform === 'linux' && process.arch === 'arm64';
  
  if (isTermux) return 'termux';
  if (isLinuxArm64) return 'linux-arm64';
  return 'other';
}

/**
 * Check if npm package is installed
 */
function isNpmPackageInstalled(packageName) {
  try {
    const nodeModulesPath = path.join(__dirname, '..', '..', 'node_modules', packageName);
    return fs.existsSync(nodeModulesPath);
  } catch {
    return false;
  }
}

/**
 * Check if pty.node exists (native module)
 */
function checkPtyNode() {
  try {
    const nodeModulesPath = path.join(__dirname, '..', '..', 'node_modules');
    
    // Check @mmmbuto/node-pty-android-arm64
    const androidPtyPath = path.join(nodeModulesPath, '@mmmbuto', 'node-pty-android-arm64', 'build', 'Release', 'pty.node');
    if (fs.existsSync(androidPtyPath)) {
      return { found: true, provider: '@mmmbuto/node-pty-android-arm64', path: androidPtyPath };
    }
    
    // Check @lydell/node-pty-linux-arm64
    const linuxPtyPath = path.join(nodeModulesPath, '@lydell', 'node-pty-linux-arm64', 'build', 'Release', 'pty.node');
    if (fs.existsSync(linuxPtyPath)) {
      return { found: true, provider: '@lydell/node-pty-linux-arm64', path: linuxPtyPath };
    }
    
    return { found: false };
  } catch {
    return { found: false };
  }
}

/**
 * Install PTY provider
 */
function installPtyProvider(provider) {
  try {
    log(`  Installing ${provider}...`);
    
    const npmCmd = process.env.npm_execpath || 'npm';
    execSync(`${npmCmd} install ${provider}`, { 
      stdio: 'inherit',
      cwd: path.join(__dirname, '..', '..')
    });
    
    success(`${provider} installed`);
    return true;
  } catch (err) {
    warn(`${provider} installation failed: ${err.message}`);
    return false;
  }
}

/**
 * Main PTY check function
 */
function checkPtyDependencies() {
  console.log('');
  console.log(colors.cyan('Checking PTY dependencies:'));
  
  const platform = detectPlatform();
  let targetProvider = null;
  
  // Determine target provider based on platform
  if (platform === 'termux') {
    targetProvider = '@mmmbuto/node-pty-android-arm64';
  } else if (platform === 'linux-arm64') {
    targetProvider = '@lydell/node-pty-linux-arm64';
  } else {
    log(colors.gray('  Skipped: Unsupported platform for PTY (not Termux/Linux ARM64)'));
    log(colors.gray('  PTY will use fallback adapter (child_process)'));
    return;
  }
  
  // Check if PTY native module exists
  const ptyCheck = checkPtyNode();
  
  if (ptyCheck.found) {
    success(`Native PTY found: ${ptyCheck.provider}`);
  } else {
    // Check if package is installed but pty.node is missing
    if (isNpmPackageInstalled(targetProvider)) {
      warn(`${targetProvider} installed but pty.node missing - may need rebuild`);
      warn(`  Run: npm rebuild ${targetProvider}`);
    } else {
      warn(`${targetProvider} not installed`);
    }
    
    // Try to install
    const installed = installPtyProvider(targetProvider);
    if (installed) {
      // Verify installation
      const verify = checkPtyNode();
      if (verify.found) {
        success(`Native PTY verified: ${verify.provider}`);
      } else {
        warn(`PTY package installed but pty.node not found`);
        warn(`  You may need to rebuild: npm rebuild ${targetProvider}`);
      }
    } else {
      warn(`Cannot install ${targetProvider} - PTY will use fallback`);
    }
  }
  
  console.log('');
}


/**
 * Check if pty-termux-utils is installed and has .cjs files
 */
function checkPtyTermuxUtils() {
  try {
    const ptyUtilsPath = path.join(__dirname, '..', '..', 'node_modules', '@mmmbuto', 'pty-termux-utils');
    
    if (!fs.existsSync(ptyUtilsPath)) {
      warn('@mmmbuto/pty-termux-utils not installed');
      warn('  This is required for PTY support');
      warn('  Run: npm install @mmmbuto/pty-termux-utils');
      return false;
    }
    
    const indexCjsPath = path.join(ptyUtilsPath, 'dist', 'index.cjs');
    if (fs.existsSync(indexCjsPath)) {
      success('@mmmbuto/pty-termux-utils installed with CJS support');
      return true;
    } else {
      warn('@mmmbuto/pty-termux-utils installed but .cjs files missing');
      warn('  Run: cd node_modules/@mmmbuto/pty-termux-utils && npm run build:cjs');
      return false;
    }
  } catch (err) {
    warn('Error checking @mmmbuto/pty-termux-utils: ' + err.message);
    return false;
  }
}

module.exports = { checkPtyDependencies ,
  checkPtyTermuxUtils
};
