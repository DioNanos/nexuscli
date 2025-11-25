const { prepare } = require('../db');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class User {
  static create(username, password, role = 'user') {
    const id = uuidv4();
    const passwordHash = bcrypt.hashSync(password, 10);
    const now = Date.now();

    const stmt = prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, username, passwordHash, role, now);

    return { id, username, role, created_at: now };
  }

  static findByUsername(username) {
    const stmt = prepare('SELECT * FROM users WHERE username = ?');
    return stmt.get(username);
  }

  static findById(id) {
    const stmt = prepare('SELECT * FROM users WHERE id = ?');
    return stmt.get(id);
  }

  static verifyPassword(user, password) {
    return bcrypt.compareSync(password, user.password_hash);
  }

  static updateLastLogin(userId) {
    const stmt = prepare('UPDATE users SET last_login = ? WHERE id = ?');
    stmt.run(Date.now(), userId);
  }

  static incrementFailedAttempts(userId) {
    const now = Date.now();
    const stmt = prepare(`
      UPDATE users
      SET failed_attempts = failed_attempts + 1,
          last_failed_attempt = ?
      WHERE id = ?
    `);
    stmt.run(now, userId);

    // Lock account after 5 failed attempts for 15 minutes
    const user = this.findById(userId);
    if (user.failed_attempts >= 5) {
      const lockUntil = now + (15 * 60 * 1000); // 15 minutes
      const lockStmt = prepare(`
        UPDATE users
        SET is_locked = 1, locked_until = ?
        WHERE id = ?
      `);
      lockStmt.run(lockUntil, userId);
    }
  }

  static resetFailedAttempts(userId) {
    const stmt = prepare(`
      UPDATE users
      SET failed_attempts = 0,
          is_locked = 0,
          locked_until = NULL
      WHERE id = ?
    `);
    stmt.run(userId);
  }

  static isAccountLocked(user) {
    if (!user.is_locked) return false;
    if (!user.locked_until) return true;

    const now = Date.now();
    if (now < user.locked_until) {
      return true;
    }

    // Unlock account if lock period expired
    this.resetFailedAttempts(user.id);
    return false;
  }

  static logLoginAttempt(ipAddress, username, success) {
    const stmt = prepare(`
      INSERT INTO login_attempts (ip_address, username, success, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(ipAddress, username, success ? 1 : 0, Date.now());
  }

  static getRecentLoginAttempts(ipAddress, windowMs = 15 * 60 * 1000) {
    const since = Date.now() - windowMs;
    const stmt = prepare(`
      SELECT COUNT(*) as count
      FROM login_attempts
      WHERE ip_address = ? AND timestamp > ?
    `);
    const result = stmt.get(ipAddress, since);
    return result ? result.count : 0;
  }

  static cleanupOldLoginAttempts(daysToKeep = 7) {
    const cutoff = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
    const stmt = prepare('DELETE FROM login_attempts WHERE timestamp < ?');
    stmt.run(cutoff);
    return 0; // sql.js doesn't return changes count easily
  }
}

module.exports = User;
