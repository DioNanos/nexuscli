const express = require('express');
const router = express.Router();
const RuntimeManager = require('../services/runtime-manager');

const runtimeManager = new RuntimeManager();

/**
 * GET /api/v1/models
 * Returns list of available CLI tools and their models
 *
 * Runtime-aware model catalog:
 * - Claude: native and custom Anthropic-compatible lanes
 * - Codex: latest native models and codex-lts custom lanes
 * - Gemini: current native Gemini lanes
 * - Qwen: current native Qwen coding lanes
 */
router.get('/', async (req, res) => {
  try {
    const cliTools = await runtimeManager.getRuntimeAwareCliTools();
    res.json(cliTools);
  } catch (error) {
    console.error('[Models] Error fetching models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

/**
 * GET /api/v1/models/:engine
 * Returns models for a specific engine
 */
router.get('/:engine', async (req, res) => {
  try {
    const { engine } = req.params;
    const cliTools = await runtimeManager.getRuntimeAwareCliTools();

    // Normalize engine name
    let normalizedEngine = engine.toLowerCase();
    if (normalizedEngine.includes('claude')) normalizedEngine = 'claude';
    if (normalizedEngine.includes('codex') || normalizedEngine.includes('openai')) normalizedEngine = 'codex';
    if (normalizedEngine.includes('gemini') || normalizedEngine.includes('google')) normalizedEngine = 'gemini';
    if (normalizedEngine.includes('qwen')) normalizedEngine = 'qwen';

    if (!cliTools[normalizedEngine]) {
      return res.status(404).json({ error: `Engine not found: ${engine}` });
    }

    const { name, models } = cliTools[normalizedEngine];
    res.json({ name, models });
  } catch (error) {
    console.error('[Models] Error fetching engine models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

module.exports = router;
