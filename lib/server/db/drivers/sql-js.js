const initSqlJs = require('sql.js');
const fs = require('fs');

class SqlJsDriver {
  constructor(dbPath) {
    this.dbPath = dbPath;
    this.db = null;
    this.saveInterval = null;
  }

  async init() {
    const SQL = await initSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } else {
      this.db = new SQL.Database();
    }

    // Auto-save every 5 seconds
    this.saveInterval = setInterval(() => this.save(), 5000);
  }

  save() {
    if (!this.db) return;
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  exec(sql) {
    return this.db.run(sql);
  }

  prepare(sql) {
    const stmt = this.db.prepare(sql);
    return {
      run: (...params) => {
        stmt.bind(params);
        stmt.step();
        stmt.reset();
        this.save();
      },
      get: (...params) => {
        stmt.bind(params);
        const result = stmt.step() ? stmt.getAsObject() : null;
        stmt.reset();
        return result;
      },
      all: (...params) => {
        stmt.bind(params);
        const results = [];
        while (stmt.step()) {
          results.push(stmt.getAsObject());
        }
        stmt.reset();
        return results;
      }
    };
  }

  close() {
    if (this.db) {
      this.save();
      this.db.close();
    }
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
  }
}

module.exports = SqlJsDriver;
