const express = require('express');
const router = express.Router();
const { getApiKey } = require('../db/adapter');

/**
 * GET /api/v1/keys/check/:provider
 * Check if API key exists for provider
 * Returns: { exists: boolean }
 *
 * Public endpoint - needed for STT provider auto-detection
 */
router.get('/check/:provider', (req, res) => {
  try {
    const key = getApiKey(req.params.provider);
    res.json({ exists: !!key });
  } catch (error) {
    console.error(`[Keys] Error checking ${req.params.provider}:`, error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
