/**
 * Config API Routes
 * GET /api/v1/config - Get user preferences
 */

const express = require('express');
const router = express.Router();
const { getConfig } = require('../../config/manager');
const {
  isValidModelId,
  getDefaultModelId
} = require('../../config/models');

/**
 * GET /api/v1/config
 * Return user preferences (defaultModel, etc.)
 */
router.get('/', (req, res) => {
  try {
    const config = getConfig();

    const preferred = config.preferences?.defaultModel || null;
    let defaultModel = preferred;

    // Sanitize preferred model; fallback to catalog default to avoid broken UI
    if (defaultModel && !isValidModelId(defaultModel)) {
      console.warn('[Config API] Invalid defaultModel in config:', defaultModel);
      defaultModel = null;
    }

    if (!defaultModel) {
      defaultModel = getDefaultModelId();
    }

    // Return only preferences (not sensitive data like auth)
    const preferences = { defaultModel };

    res.json(preferences);
  } catch (error) {
    console.error('[Config API] Error:', error);
    res.status(500).json({ error: 'Failed to load config' });
  }
});

module.exports = router;
