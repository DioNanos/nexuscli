/**
 * Cache Service - In-memory caching with TTL
 *
 * Uses node-cache for lightweight, Redis-free caching.
 * Perfect for Termux environments with limited resources.
 */

const NodeCache = require('node-cache');

// Cache configuration
const cache = new NodeCache({
  stdTTL: 30,          // Default 30 seconds TTL
  checkperiod: 60,     // Check for expired keys every 60 seconds
  useClones: false,    // Don't clone objects (faster for read-heavy workloads)
  deleteOnExpire: true
});

// Cache keys
const KEYS = {
  CONVERSATIONS_GROUPED: 'conversations:grouped',
  CONVERSATIONS_WORKSPACE: (ws) => `conversations:workspace:${ws}`,
  CONVERSATION: (id) => `conversation:${id}`,
};

/**
 * Get cached value or execute callback and cache result
 * @param {string} key - Cache key
 * @param {Function} callback - Async function to get data if not cached
 * @param {number} ttl - TTL in seconds (default: 30)
 * @returns {Promise<any>}
 */
async function getOrSet(key, callback, ttl = 30) {
  let value = cache.get(key);

  if (value !== undefined) {
    return value;
  }

  // Execute callback and cache result
  value = await callback();
  cache.set(key, value, ttl);

  return value;
}

/**
 * Invalidate specific key
 * @param {string} key
 */
function invalidate(key) {
  cache.del(key);
}

/**
 * Invalidate all conversation-related caches
 * Called when conversation is created, updated, or deleted
 */
function invalidateConversations() {
  // Get all keys and delete conversation-related ones
  const keys = cache.keys();
  const toDelete = keys.filter(k => k.startsWith('conversations:') || k.startsWith('conversation:'));
  cache.del(toDelete);
  console.log(`[Cache] Invalidated ${toDelete.length} conversation cache entries`);
}

/**
 * Get cache statistics
 */
function getStats() {
  return {
    keys: cache.keys().length,
    hits: cache.getStats().hits,
    misses: cache.getStats().misses,
    hitRate: cache.getStats().hits / (cache.getStats().hits + cache.getStats().misses) || 0
  };
}

module.exports = {
  cache,
  KEYS,
  getOrSet,
  invalidate,
  invalidateConversations,
  getStats
};
