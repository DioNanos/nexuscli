const Database = require('better-sqlite3');

class BetterSqlite3Driver {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
  }

  async init() {
    this.db = new Database(this.dbPath, {
      verbose: process.env.NODE_ENV === 'development' ? console.log : null
    });

    // Enable WAL mode for better concurrency
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
  }

  save() {
    // better-sqlite3 auto-saves, no-op
  }

  exec(sql) {
    return this.db.exec(sql);
  }

  prepare(sql) {
    return this.db.prepare(sql);
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = BetterSqlite3Driver;
