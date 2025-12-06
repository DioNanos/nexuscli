/**
 * Configuration Manager
 * Handles reading/writing ~/.nexuscli/config.json
 */

const fs = require('fs');
const path = require('path');
const { PATHS, ensureDirectories } = require('../utils/paths');

/**
 * Default configuration
 */
const DEFAULT_CONFIG = {
  version: 1,
  server: {
    port: 41800,
    host: '0.0.0.0'
  },
  auth: {
    jwt_secret: null,  // Generated on init
    user: 'tux',
    pass_hash: null    // Generated on init
  },
  engines: {
    active: ['claude'],
    check_on_boot: false,  // Re-check engine availability on each boot
    claude: {
      enabled: true,
      path: 'auto',
      model: 'sonnet'
    },
    codex: {
      enabled: false,
      path: null
    }
  },
  workspaces: {
    default: null,  // Set during init - will use HOME if not configured
    paths: []
  },
  termux: {
    wake_lock: true,
    notifications: true,
    boot_start: false
  },
  preferences: {
    defaultModel: null  // User's preferred default model (e.g., 'claude-sonnet-4-5-20250929')
  }
};

/**
 * Load configuration from file
 */
function loadConfig() {
  ensureDirectories();

  if (!fs.existsSync(PATHS.CONFIG_FILE)) {
    return null;
  }

  try {
    const content = fs.readFileSync(PATHS.CONFIG_FILE, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error('Error loading config:', error.message);
    return null;
  }
}

/**
 * Save configuration to file
 */
function saveConfig(config) {
  ensureDirectories();

  try {
    fs.writeFileSync(
      PATHS.CONFIG_FILE,
      JSON.stringify(config, null, 2),
      'utf8'
    );
    return true;
  } catch (error) {
    console.error('Error saving config:', error.message);
    return false;
  }
}

/**
 * Get configuration (load or create default)
 */
function getConfig() {
  const config = loadConfig();
  if (config) {
    return config;
  }
  return { ...DEFAULT_CONFIG };
}

/**
 * Check if NexusCLI is initialized
 */
function isInitialized() {
  return fs.existsSync(PATHS.CONFIG_FILE);
}

/**
 * Get a config value by dot-notation path
 * e.g., 'server.port' -> config.server.port
 */
function getConfigValue(key) {
  const config = getConfig();
  const parts = key.split('.');
  let value = config;

  for (const part of parts) {
    if (value === undefined || value === null) {
      return undefined;
    }
    value = value[part];
  }

  return value;
}

/**
 * Set a config value by dot-notation path
 */
function setConfigValue(key, value) {
  const config = getConfig();
  const parts = key.split('.');
  let current = config;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (current[part] === undefined) {
      current[part] = {};
    }
    current = current[part];
  }

  // Parse value type
  let parsedValue = value;
  if (value === 'true') parsedValue = true;
  else if (value === 'false') parsedValue = false;
  else if (!isNaN(value) && value !== '') parsedValue = Number(value);

  current[parts[parts.length - 1]] = parsedValue;

  return saveConfig(config);
}

/**
 * Get all config keys as flat list
 */
function getConfigKeys(obj = null, prefix = '') {
  if (!obj) {
    obj = getConfig();
  }

  const keys = [];

  for (const key of Object.keys(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;

    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      keys.push(...getConfigKeys(obj[key], fullKey));
    } else {
      keys.push(fullKey);
    }
  }

  return keys;
}

/**
 * Initialize config with generated secrets
 */
function initializeConfig(options = {}) {
  const { v4: uuidv4 } = require('uuid');
  const bcrypt = require('bcryptjs');

  const config = { ...DEFAULT_CONFIG };

  // Generate JWT secret
  config.auth.jwt_secret = uuidv4() + '-' + uuidv4();

  // Set user credentials
  const username = options.username || 'tux';
  const password = options.password || 'tux';

  config.auth.user = username;
  config.auth.pass_hash = bcrypt.hashSync(password, 10);

  // Set workspaces
  if (options.workspaces) {
    config.workspaces.paths = options.workspaces;
  }

  // Set default workspace (explicit or first from list)
  if (options.defaultWorkspace) {
    config.workspaces.default = options.defaultWorkspace;
  } else if (options.workspaces && options.workspaces.length > 0) {
    config.workspaces.default = options.workspaces[0];
  }

  // Set port
  if (options.port) {
    config.server.port = options.port;
  }

  // Termux options
  if (options.wakeLock !== undefined) {
    config.termux.wake_lock = options.wakeLock;
  }
  if (options.notifications !== undefined) {
    config.termux.notifications = options.notifications;
  }
  if (options.bootStart !== undefined) {
    config.termux.boot_start = options.bootStart;
  }

  return saveConfig(config) ? config : null;
}

module.exports = {
  DEFAULT_CONFIG,
  loadConfig,
  saveConfig,
  getConfig,
  isInitialized,
  getConfigValue,
  setConfigValue,
  getConfigKeys,
  initializeConfig
};
