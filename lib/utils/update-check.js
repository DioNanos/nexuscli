/**
 * Update check utilities (npm + GitHub) with simple caching
 */

const fs = require('fs');
const path = require('path');
const { PATHS, ensureDirectories } = require('./paths');
const pkg = require('../../package.json');

const CACHE_FILE = path.join(PATHS.DATA_DIR, 'version.json');
const CHECK_INTERVAL_MS = 20 * 60 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 4000;

function normalizeVersion(raw) {
  if (!raw || typeof raw !== 'string') return null;
  const match = raw.trim().match(/(\d+\.\d+\.\d+)/);
  return match ? match[1] : null;
}

function parseSemver(v) {
  if (!v) return null;
  const parts = v.trim().split('.');
  if (parts.length < 3) return null;
  const major = Number(parts[0]);
  const minor = Number(parts[1]);
  const patch = Number(parts[2]);
  if (![major, minor, patch].every(Number.isFinite)) return null;
  return [major, minor, patch];
}

function compareSemver(a, b) {
  const av = parseSemver(a);
  const bv = parseSemver(b);
  if (!av || !bv) return null;
  for (let i = 0; i < 3; i++) {
    if (av[i] > bv[i]) return 1;
    if (av[i] < bv[i]) return -1;
  }
  return 0;
}

function isNewer(latest, current) {
  const cmp = compareSemver(latest, current);
  if (cmp === null) return null;
  return cmp === 1;
}

function readCache() {
  if (!fs.existsSync(CACHE_FILE)) return null;
  try {
    const content = fs.readFileSync(CACHE_FILE, 'utf8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

function writeCache(info) {
  ensureDirectories();
  try {
    fs.writeFileSync(CACHE_FILE, JSON.stringify(info, null, 2), 'utf8');
  } catch {}
}

async function fetchJson(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const res = await fetch(url, { ...options, signal: controller.signal });
  clearTimeout(timer);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function fetchNpmLatest(timeoutMs) {
  const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}`;
  const data = await fetchJson(registryUrl, { headers: { 'Accept': 'application/json' } }, timeoutMs);
  const distTags = data['dist-tags'] || {};
  return normalizeVersion(distTags.latest || distTags.stable);
}

async function fetchGithubLatest(timeoutMs) {
  const url = 'https://api.github.com/repos/DioNanos/nexuscli/releases/latest';
  const data = await fetchJson(url, {
    headers: {
      'User-Agent': 'nexuscli',
      'Accept': 'application/vnd.github+json'
    }
  }, timeoutMs);
  return normalizeVersion(data.tag_name);
}

function pickLatest(a, b) {
  if (a && !b) return a;
  if (b && !a) return b;
  if (!a && !b) return null;
  const cmp = compareSemver(a, b);
  if (cmp === null) return a || b;
  return cmp >= 0 ? a : b;
}

function buildInfo(info, { usedCache = false, error = null } = {}) {
  const currentVersion = pkg.version;
  const npmVersion = info?.npm_version || null;
  const githubVersion = info?.github_version || null;
  const latestVersion = info?.latest_version || pickLatest(npmVersion, githubVersion);
  const npmNewer = isNewer(npmVersion, currentVersion);
  const githubNewer = isNewer(githubVersion, currentVersion);

  return {
    currentVersion,
    npmVersion,
    githubVersion,
    latestVersion,
    npmNewer,
    githubNewer,
    updateAvailable: npmNewer === true,
    usedCache,
    error
  };
}

async function getUpdateInfo({ force = false, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const cache = readCache();
  const lastCheckedAt = cache?.last_checked_at ? Date.parse(cache.last_checked_at) : null;
  const cacheFresh = lastCheckedAt && (Date.now() - lastCheckedAt) < CHECK_INTERVAL_MS;

  if (!force && cache && cacheFresh) {
    return buildInfo(cache, { usedCache: true });
  }

  let npmVersion = null;
  let githubVersion = null;
  const errors = [];

  try {
    npmVersion = await fetchNpmLatest(timeoutMs);
  } catch (err) {
    errors.push(`npm: ${err.message}`);
  }

  try {
    githubVersion = await fetchGithubLatest(timeoutMs);
  } catch (err) {
    errors.push(`github: ${err.message}`);
  }

  if (!npmVersion && !githubVersion) {
    if (cache) {
      return buildInfo(cache, { usedCache: true, error: errors.join('; ') });
    }
    return buildInfo(null, { usedCache: false, error: errors.join('; ') });
  }

  const latestVersion = pickLatest(npmVersion, githubVersion);
  const info = {
    latest_version: latestVersion,
    npm_version: npmVersion,
    github_version: githubVersion,
    last_checked_at: new Date().toISOString()
  };

  writeCache(info);
  return buildInfo(info, { usedCache: false });
}

module.exports = {
  getUpdateInfo,
  normalizeVersion,
  compareSemver,
  isNewer
};
