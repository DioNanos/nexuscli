const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { getConfig } = require('../../config/manager');

let warnedEphemeralSecret = false;

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  const config = getConfig();
  if (config.auth?.jwt_secret) {
    return config.auth.jwt_secret;
  }

  if (!global.__NEXUSCLI_EPHEMERAL_JWT_SECRET__) {
    global.__NEXUSCLI_EPHEMERAL_JWT_SECRET__ = crypto.randomBytes(48).toString('hex');
  }

  if (!warnedEphemeralSecret) {
    warnedEphemeralSecret = true;
    console.warn('[Auth] JWT secret missing from env and config; using ephemeral in-memory secret for this process');
  }

  return global.__NEXUSCLI_EPHEMERAL_JWT_SECRET__;
}

/**
 * Get config user (admin from init) by id
 */
function findConfigUserById(id) {
  if (id !== 'config-admin') return null;

  const config = getConfig();
  if (config.auth && config.auth.user) {
    return {
      id: 'config-admin',
      username: config.auth.user,
      role: 'admin',
      is_locked: false,
      created_at: Date.now()
    };
  }
  return null;
}
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role
    },
    getJwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, getJwtSecret());
  } catch (err) {
    return null;
  }
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const decoded = verifyToken(token);

  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Verify user still exists - check config user first, then database
  let user = findConfigUserById(decoded.id);
  let isConfigUser = !!user;

  if (!user) {
    user = User.findById(decoded.id);
  }

  if (!user) {
    return res.status(401).json({ error: 'User not found' });
  }

  // Check if account is locked (only for DB users)
  if (!isConfigUser && User.isAccountLocked(user)) {
    return res.status(403).json({
      error: 'Account locked',
      locked_until: user.locked_until
    });
  }

  req.user = {
    id: user.id,
    username: user.username,
    role: user.role
  };

  next();
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

module.exports = {
  generateToken,
  verifyToken,
  authMiddleware,
  adminOnly,
  getJwtSecret
};
