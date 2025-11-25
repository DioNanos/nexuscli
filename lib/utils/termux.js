/**
 * Termux Detection and Utilities
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

/**
 * Check if running in Termux environment
 */
function isTermux() {
  return (
    process.env.PREFIX?.includes('com.termux') ||
    fs.existsSync('/data/data/com.termux') ||
    process.env.TERMUX_VERSION !== undefined
  );
}

/**
 * Get Termux prefix path
 */
function getPrefix() {
  return process.env.PREFIX || '/data/data/com.termux/files/usr';
}

/**
 * Check if a Termux package is installed
 */
function isPackageInstalled(pkg) {
  try {
    execSync(`which ${pkg}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Install a Termux package
 */
function installPackage(pkg) {
  try {
    execSync(`pkg install -y ${pkg}`, { stdio: 'inherit' });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Check if Termux:API app is working
 */
function isTermuxApiWorking() {
  try {
    execSync('termux-battery-status', { timeout: 5000, stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Termux:Boot is available
 */
function isTermuxBootAvailable() {
  const bootDir = path.join(process.env.HOME, '.termux', 'boot');
  return fs.existsSync(bootDir);
}

/**
 * Acquire Termux wake lock
 */
function acquireWakeLock() {
  if (!isTermux()) return false;
  try {
    spawn('termux-wake-lock', [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Release Termux wake lock
 */
function releaseWakeLock() {
  if (!isTermux()) return false;
  try {
    spawn('termux-wake-unlock', [], { detached: true, stdio: 'ignore' }).unref();
    return true;
  } catch {
    return false;
  }
}

/**
 * Send Termux notification
 */
function sendNotification(title, content, id = 'nexuscli') {
  if (!isTermux()) return false;
  try {
    execSync(`termux-notification --id ${id} --title "${title}" --content "${content}"`, {
      stdio: 'ignore'
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get required Termux packages
 */
function getRequiredPackages() {
  return ['termux-api', 'termux-tools'];
}

/**
 * Check all required packages
 */
function checkRequiredPackages() {
  const packages = getRequiredPackages();
  const status = {};

  for (const pkg of packages) {
    status[pkg] = isPackageInstalled(pkg);
  }

  return status;
}

module.exports = {
  isTermux,
  getPrefix,
  isPackageInstalled,
  installPackage,
  isTermuxApiWorking,
  isTermuxBootAvailable,
  acquireWakeLock,
  releaseWakeLock,
  sendNotification,
  getRequiredPackages,
  checkRequiredPackages
};
