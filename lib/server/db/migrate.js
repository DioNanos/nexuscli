const fs = require('fs');
const path = require('path');
const { initDb, getDb, saveDb } = require('./adapter');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

/**
 * Get list of migration files in order
 */
function getMigrationFiles() {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.endsWith('.sql'))
    .sort(); // Alphabetical order ensures numeric order (001_, 002_, etc.)
  return files;
}

/**
 * Normalize and split SQL into executable statements.
 * Keeps CREATE/INSERT blocks while stripping comment-only lines.
 */
function parseSqlStatements(sql) {
  return sql
    .replace(/\r\n/g, '\n')
    .split(';')
    .map(stmt => stmt.trim())
    .map(stmt => {
      const lines = stmt
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('--'));
      return lines.join('\n').trim();
    })
    .filter(stmt => stmt.length > 0);
}

/**
 * Get applied migrations from DB
 */
function getAppliedMigrations(db) {
  try {
    // Ensure migrations table exists
    db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        applied_at INTEGER NOT NULL
      )
    `);

    const stmt = db.prepare('SELECT name FROM _migrations ORDER BY id');
    return stmt.all().map(row => row.name);
  } catch (error) {
    console.error('[Migration] Error getting applied migrations:', error.message);
    return [];
  }
}

/**
 * Mark migration as applied
 */
function markMigrationApplied(db, name) {
  const stmt = db.prepare('INSERT INTO _migrations (name, applied_at) VALUES (?, ?)');
  stmt.run(name, Date.now());
}

/**
 * Run a single migration file
 */
function runMigrationFile(db, filename) {
  const filePath = path.join(MIGRATIONS_DIR, filename);
  const migrationSql = fs.readFileSync(filePath, 'utf8');
  const statements = parseSqlStatements(migrationSql);

  console.log(`[Migration] Running ${filename} (${statements.length} statements)`);

  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];

    if (/^SELECT/i.test(stmt)) {
      // Skip verification SELECT statements
      continue;
    }

    try {
      db.exec(stmt);
    } catch (error) {
      // Handle "duplicate column" errors gracefully
      if (error.message.includes('duplicate column')) {
        console.log(`[Migration] Column already exists (skipping): ${error.message}`);
        continue;
      }
      console.error(`[Migration] Failed at statement ${i + 1}: ${error.message}`);
      console.error('Statement preview:', stmt.substring(0, 200));
      throw error;
    }
  }

  markMigrationApplied(db, filename);
  console.log(`[Migration] ✅ ${filename} applied`);
}

/**
 * Run database migrations.
 * @param {Object} options
 * @param {boolean} options.skipInit - skip initDb (adapter already initialized)
 */
async function runMigrations(options = {}) {
  const { skipInit = false } = options;

  console.log('[Migration] Starting database migration...');

  if (!skipInit && !getDb()) {
    await initDb({ skipMigrationCheck: true });
  }

  const db = getDb();

  if (!db) {
    throw new Error('[Migration] Database instance not initialized');
  }

  const migrationFiles = getMigrationFiles();
  const appliedMigrations = getAppliedMigrations(db);

  console.log(`[Migration] Found ${migrationFiles.length} migration files`);
  console.log(`[Migration] Already applied: ${appliedMigrations.length}`);

  const pendingMigrations = migrationFiles.filter(f => !appliedMigrations.includes(f));

  if (pendingMigrations.length === 0) {
    console.log('[Migration] No pending migrations');
    return;
  }

  console.log(`[Migration] Pending: ${pendingMigrations.join(', ')}`);

  for (const file of pendingMigrations) {
    runMigrationFile(db, file);
  }

  saveDb();

  console.log('[Migration] All migrations completed');

  // Verification counts
  try {
    const verifyStmt = db.prepare(`
      SELECT 'conversations' as table_name, COUNT(*) as count FROM conversations
      UNION ALL
      SELECT 'sessions' as table_name, COUNT(*) as count FROM sessions
    `);

    const counts = verifyStmt.all();
    console.log('[Migration] Verification:');
    counts.forEach(row => console.log(`  ${row.table_name}: ${row.count} rows`));
  } catch (error) {
    console.error('[Migration] Verification failed:', error.message);
  }
}

// Run if called directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      console.log('[Migration] Complete');
      process.exit(0);
    })
    .catch(error => {
      console.error('[Migration] Failed:', error);
      process.exit(1);
    });
}

module.exports = { runMigrations };
