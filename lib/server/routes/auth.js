const express = require('express');
const rateLimit = require('express-rate-limit');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken, authMiddleware } = require('../middleware/auth');
const { getConfig } = require('../../config/manager');

const router = express.Router();

/**
 * Check config user (admin from init)
 * Returns user object compatible with DB user structure
 */
function findConfigUser(username) {
  const config = getConfig();
  if (config.auth && config.auth.user === username) {
    return {
      id: 'config-admin',
      username: config.auth.user,
      password_hash: config.auth.pass_hash,
      role: 'admin',
      is_locked: false,
      failed_attempts: 0,
      created_at: Date.now()
    };
  }
  return null;
}

/**
 * Verify password for config user
 */
function verifyConfigPassword(passHash, password) {
  return bcrypt.compareSync(password, passHash);
}

// Rate limiter: max 5 login attempts per 15 minutes per IP
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    error: 'Too many login attempts, please try again later',
    retry_after: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// POST /api/v1/auth/login
router.post('/login', loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    // Check IP rate limiting (additional layer)
    const recentAttempts = User.getRecentLoginAttempts(ipAddress);
    if (recentAttempts > 20) {
      return res.status(429).json({
        error: 'Too many failed attempts from this IP',
        retry_after: 15 * 60
      });
    }

    // First check config user (admin from init)
    let user = findConfigUser(username);
    let isConfigUser = !!user;

    // If not config user, check database
    if (!user) {
      user = User.findByUsername(username);
    }

    if (!user) {
      // Log failed attempt even for non-existent user
      User.logLoginAttempt(ipAddress, username, false);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if account is locked (only for DB users)
    if (!isConfigUser && User.isAccountLocked(user)) {
      User.logLoginAttempt(ipAddress, username, false);
      const remainingMs = user.locked_until - Date.now();
      return res.status(403).json({
        error: 'Account locked due to failed login attempts',
        locked_until: user.locked_until,
        retry_after: Math.ceil(remainingMs / 1000)
      });
    }

    // Verify password
    let isValid;
    if (isConfigUser) {
      isValid = verifyConfigPassword(user.password_hash, password);
    } else {
      isValid = User.verifyPassword(user, password);
    }

    if (!isValid) {
      User.logLoginAttempt(ipAddress, username, false);
      if (!isConfigUser) {
        User.incrementFailedAttempts(user.id);
      }
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Success
    User.logLoginAttempt(ipAddress, username, true);
    if (!isConfigUser) {
      User.resetFailedAttempts(user.id);
      User.updateLastLogin(user.id);
    }

    const token = generateToken(user);

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/v1/auth/me
router.get('/me', authMiddleware, (req, res) => {
  // Config user is already validated by authMiddleware
  // Just return the user info from req.user
  if (req.user.id === 'config-admin') {
    const config = getConfig();
    return res.json({
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      created_at: Date.now(),
      last_login: null
    });
  }

  const user = User.findById(req.user.id);
  if (!user) {
    return res.status(404).json({ error: 'User not found' });
  }

  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    created_at: user.created_at,
    last_login: user.last_login
  });
});

// POST /api/v1/auth/logout
router.post('/logout', authMiddleware, (req, res) => {
  // With JWT, logout is handled client-side by removing token
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
