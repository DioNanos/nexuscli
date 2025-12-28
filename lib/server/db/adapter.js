const path = require('path');
const fs = require('fs');

// Termux-only: all data in ~/.nexuscli
const dbDir = path.join(process.env.HOME, '.nexuscli');
const dbPath = path.join(dbDir, 'nexuscli.db');

// Ensure directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  console.log(`✅ Created database directory: ${dbDir}`);
}

// Termux-only: use sql.js (no native compilation needed)
const Driver = require('./drivers/sql-js');
let db = null;

console.log(`📦 Using sql.js driver (Termux-compatible)`);

// Initialize database
async function initDb(options = {}) {
  const { skipMigrationCheck = false } = options;
  const driver = new Driver(dbPath);
  await driver.init();
  db = driver;

  console.log(`✅ Database ready: ${dbPath}`);

  // Initialize schema
  initSchema();

  if (!skipMigrationCheck) {
    const needsMigration = await checkMigrationNeeded();

    if (needsMigration) {
      console.log('[DB] Migration required - running migrations...');
      const { runMigrations } = require('./migrate');
      await runMigrations({ skipInit: true });
    }
  }

  return db;
}

function initSchema() {
  db.exec(`
    -- Conversations table
    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      metadata TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_conversations_updated_at
    ON conversations(updated_at DESC);

    -- Messages table
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      metadata TEXT,
      engine TEXT NOT NULL DEFAULT 'claude',
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_conversation_id
    ON messages(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_messages_created_at
    ON messages(created_at ASC);

    -- Jobs table
    CREATE TABLE IF NOT EXISTS jobs (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      message_id TEXT,
      node_id TEXT NOT NULL,
      tool TEXT NOT NULL,
      command TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued', 'executing', 'completed', 'failed', 'cancelled')),
      exit_code INTEGER,
      stdout TEXT,
      stderr TEXT,
      duration INTEGER,
      created_at INTEGER NOT NULL,
      started_at INTEGER,
      completed_at INTEGER,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
      FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_jobs_conversation_id
    ON jobs(conversation_id);

    CREATE INDEX IF NOT EXISTS idx_jobs_status
    ON jobs(status);

    CREATE INDEX IF NOT EXISTS idx_jobs_created_at
    ON jobs(created_at DESC);

    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user' CHECK(role IN ('admin', 'user')),
      is_locked INTEGER NOT NULL DEFAULT 0,
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      last_failed_attempt INTEGER,
      locked_until INTEGER,
      created_at INTEGER NOT NULL,
      last_login INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_users_username
    ON users(username);

    -- Login attempts table
    CREATE TABLE IF NOT EXISTS login_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ip_address TEXT NOT NULL,
      username TEXT,
      success INTEGER NOT NULL DEFAULT 0,
      timestamp INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_login_attempts_ip
    ON login_attempts(ip_address, timestamp DESC);

    CREATE INDEX IF NOT EXISTS idx_login_attempts_timestamp
    ON login_attempts(timestamp DESC);

    -- Nodes table
    CREATE TABLE IF NOT EXISTS nodes (
      id TEXT PRIMARY KEY,
      hostname TEXT NOT NULL,
      ip_address TEXT,
      status TEXT NOT NULL CHECK(status IN ('online', 'offline', 'error')),
      capabilities TEXT,
      last_heartbeat INTEGER,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_nodes_status
    ON nodes(status);

    -- API Keys table (encrypted storage for provider keys)
    CREATE TABLE IF NOT EXISTS api_keys (
      provider TEXT PRIMARY KEY,
      api_key TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  console.log('✅ Database schema initialized');
}

/**
 * Get API key for a provider
 * @param {string} provider - Provider name (e.g., 'deepseek', 'openai')
 * @returns {string|null} API key or null if not found
 */
function getApiKey(provider) {
  if (!db) return null;
  try {
    const stmt = db.prepare('SELECT api_key FROM api_keys WHERE provider = ?');
    const row = stmt.get(provider.toLowerCase());
    return row?.api_key || null;
  } catch (err) {
    console.error(`[DB] Error getting API key for ${provider}:`, err.message);
    return null;
  }
}

/**
 * Set API key for a provider
 * @param {string} provider - Provider name
 * @param {string} apiKey - API key value
 * @returns {boolean} Success
 */
function setApiKey(provider, apiKey) {
  if (!db) return false;
  try {
    const now = Date.now();
    const stmt = db.prepare(`
      INSERT INTO api_keys (provider, api_key, created_at, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(provider) DO UPDATE SET api_key = ?, updated_at = ?
    `);
    stmt.run(provider.toLowerCase(), apiKey, now, now, apiKey, now);
    db.save();
    return true;
  } catch (err) {
    console.error(`[DB] Error setting API key for ${provider}:`, err.message);
    return false;
  }
}

/**
 * Delete API key for a provider
 * @param {string} provider - Provider name
 * @returns {boolean} Success
 */
function deleteApiKey(provider) {
  if (!db) return false;
  try {
    const stmt = db.prepare('DELETE FROM api_keys WHERE provider = ?');
    stmt.run(provider.toLowerCase());
    db.save();
    return true;
  } catch (err) {
    console.error(`[DB] Error deleting API key for ${provider}:`, err.message);
    return false;
  }
}

/**
 * List all configured API key providers (without exposing keys)
 * @returns {Array} List of provider names
 */
function listApiKeyProviders() {
  if (!db) return [];
  try {
    const stmt = db.prepare('SELECT provider, created_at, updated_at FROM api_keys');
    return stmt.all();
  } catch (err) {
    console.error('[DB] Error listing API key providers:', err.message);
    return [];
  }
}

async function checkMigrationNeeded() {
  const currentDb = getDb();

  if (!currentDb) {
    console.error('[DB] Cannot check migration status - DB not initialized');
    return false;
  }

  try {
    const hasSessionsStmt = currentDb.prepare(`
      SELECT name FROM sqlite_master
      WHERE type='table' AND name='sessions'
    `);
    const hasSessions = hasSessionsStmt.get();

    if (!hasSessions) {
      console.log('[DB] sessions table not found - migration needed');
      return true;
    }

    const conversationsCount = currentDb.prepare('SELECT COUNT(*) as count FROM conversations').get();
    const sessionsCount = currentDb.prepare('SELECT COUNT(*) as count FROM sessions').get();

    if (conversationsCount.count > sessionsCount.count) {
      console.log('[DB] Unmigrated conversations found - migration needed');
      return true;
    }

    console.log('[DB] No migration needed');
    return false;
  } catch (error) {
    console.error('[DB] Error checking migration status:', error);
    return false;
  }
}

function getDb() {
  return db;
}

function prepare(sql) {
  return db.prepare(sql);
}

function saveDb() {
  if (db) db.save();
}

// Graceful shutdown
process.on('exit', () => {
  if (db) {
    db.close();
    console.log('✅ Database connection closed');
  }
});

process.on('SIGINT', () => {
  if (db) {
    db.close();
    console.log('✅ Database connection closed (SIGINT)');
  }
  process.exit(0);
});

process.on('SIGTERM', () => {
  if (db) db.close();
});

module.exports = {
  initDb,
  getDb,
  prepare,
  saveDb,
  getApiKey,
  setApiKey,
  deleteApiKey,
  listApiKeyProviders
};
