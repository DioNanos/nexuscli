/**
 * Rate Limiting Middleware for Chat Endpoints
 *
 * Protects AI chat endpoints from abuse by limiting requests per user.
 * Uses express-rate-limit with user-based keying via JWT.
 */

const rateLimit = require('express-rate-limit');

/**
 * Chat endpoints rate limiter
 * - 10 requests per minute per user
 * - Applies to: /api/v1/chat, /api/v1/codex, /api/v1/gemini
 */
const chatRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // 10 requests per window
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false,

  // Key by user ID from JWT (set by authMiddleware)
  keyGenerator: (req) => {
    return req.user?.id || req.ip;
  },

  // Custom error response
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'Rate limit exceeded. Please wait before sending more messages.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  },

  // Skip rate limiting for interrupt endpoints
  skip: (req) => {
    return req.path.endsWith('/interrupt');
  }
});

/**
 * General API rate limiter (for non-chat endpoints)
 * - 60 requests per minute per IP
 */
const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip,
  handler: (req, res) => {
    res.status(429).json({
      error: 'Too many requests',
      message: 'API rate limit exceeded.',
      retryAfter: Math.ceil(req.rateLimit.resetTime / 1000)
    });
  }
});

module.exports = {
  chatRateLimiter,
  apiRateLimiter
};
