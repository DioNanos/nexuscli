const fs = require('fs');
const os = require('os');

function normalizeWorkspacePath(p) {
  if (!p) return '';
  if (p === '/') return '/';
  return p.replace(/\/+$/, '');
}

function fixTermuxPath(p) {
  if (!p) return p;
  if (p.includes('/data/data/com/termux/')) {
    const fixed = p.replace('/data/data/com/termux/', '/data/data/com.termux/');
    if (fs.existsSync(fixed)) return fixed;
  }
  return p;
}

function sanitizeWorkspacePath(p) {
  const normalized = normalizeWorkspacePath(p);
  if (!normalized) return '';
  if (fs.existsSync(normalized)) return normalized;
  const fixed = fixTermuxPath(normalized);
  if (fixed !== normalized && fs.existsSync(fixed)) return fixed;
  return '';
}

function resolveWorkspacePath(p, fallback) {
  const sanitized = sanitizeWorkspacePath(p);
  if (sanitized) return sanitized;
  const fallbackPath = sanitizeWorkspacePath(fallback || os.homedir());
  return fallbackPath || os.homedir();
}

module.exports = {
  normalizeWorkspacePath,
  fixTermuxPath,
  sanitizeWorkspacePath,
  resolveWorkspacePath
};
