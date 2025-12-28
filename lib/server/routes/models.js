const express = require('express');
const router = express.Router();
const { getCliTools } = require('../../config/models');

/**
 * GET /api/v1/models
 * Returns list of available CLI tools and their models
 *
 * TRI CLI v0.4.0:
 * - Claude: Opus 4.5, Sonnet 4.5, Haiku 4.5
 * - Codex: GPT-5.1 variants
 * - Gemini: Gemini 3 Pro Preview, Gemini 3 Flash Preview
 * - Qwen: coder-model, vision-model
 */
router.get('/', (req, res) => {
  try {
    const cliTools = getCliTools();
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
router.get('/:engine', (req, res) => {
  try {
    const { engine } = req.params;
    const cliTools = getCliTools();

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
