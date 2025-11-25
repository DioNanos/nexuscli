const express = require('express');
const router = express.Router();

/**
 * GET /api/v1/models
 * Returns list of available CLI tools and their models
 *
 * TRI CLI v0.4.0:
 * - Claude: Opus 4.5, Sonnet 4.5, Haiku 4.5
 * - Codex: GPT-5.1 variants
 * - Gemini: Gemini 3 Pro Preview
 */
router.get('/', (req, res) => {
  try {
    const cliTools = {
      // ============================================================
      // CLAUDE - Anthropic Claude Code CLI
      // ============================================================
      'claude': {
        name: 'Claude Code',
        icon: 'Terminal',
        enabled: true,
        endpoint: '/api/v1/chat',
        thinkModes: ['think', 'no-think'],
        defaultThinkMode: 'think',
        models: [
          // === Claude Opus 4.5 (Most Intelligent) ===
          {
            id: 'claude-opus-4-5-20251101',
            name: 'claude-opus-4-5-20251101',
            label: 'Opus 4.5',
            description: '🧠 Most Intelligent',
            category: 'claude'
          },
          // === Claude Sonnet 4.5 (Best Balance) ===
          {
            id: 'claude-sonnet-4-5-20250929',
            name: 'claude-sonnet-4-5-20250929',
            label: 'Sonnet 4.5',
            description: '🧠 Extended Thinking (default)',
            category: 'claude',
            default: true
          },
          // === Claude Haiku 4.5 (Fastest) ===
          {
            id: 'claude-haiku-4-5-20251001',
            name: 'claude-haiku-4-5-20251001',
            label: 'Haiku 4.5',
            description: '⚡ Fast & Efficient',
            category: 'claude'
          },
          // === DeepSeek (Alternative Models) ===
          {
            id: 'deepseek-reasoner',
            name: 'deepseek-reasoner',
            label: 'DeepSeek Reasoner',
            description: '🧠 Deep Reasoning',
            category: 'claude'
          },
          {
            id: 'deepseek-chat',
            name: 'deepseek-chat',
            label: 'DeepSeek Chat',
            description: '💬 Fast Chat',
            category: 'claude'
          }
        ]
      },

      // ============================================================
      // CODEX - OpenAI Codex CLI
      // ============================================================
      'codex': {
        name: 'Codex',
        icon: 'Code2',
        enabled: true,
        endpoint: '/api/v1/codex',
        models: [
          {
            id: 'gpt-5.1-codex-max',
            name: 'gpt-5.1-codex-max',
            label: 'GPT-5.1 Codex Max',
            description: '💎 Extra High reasoning (best)',
            category: 'codex',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            defaultReasoning: 'xhigh',
            default: true
          },
          {
            id: 'gpt-5.1-codex',
            name: 'gpt-5.1-codex',
            label: 'GPT-5.1 Codex',
            description: '🧠 High reasoning',
            category: 'codex',
            reasoningEfforts: ['low', 'medium', 'high'],
            defaultReasoning: 'high'
          },
          {
            id: 'gpt-5.1-codex-mini',
            name: 'gpt-5.1-codex-mini',
            label: 'GPT-5.1 Codex Mini',
            description: '⚡ Compact & Fast',
            category: 'codex',
            reasoningEfforts: ['medium', 'high'],
            defaultReasoning: 'high'
          },
          {
            id: 'gpt-5.1',
            name: 'gpt-5.1',
            label: 'GPT-5.1',
            description: '🧠 General Purpose',
            category: 'codex',
            reasoningEfforts: ['low', 'medium', 'high'],
            defaultReasoning: 'high'
          }
        ]
      },

      // ============================================================
      // GEMINI - Google Gemini CLI
      // ============================================================
      'gemini': {
        name: 'Gemini',
        icon: 'Sparkles',
        enabled: true,
        endpoint: '/api/v1/gemini',
        models: [
          {
            id: 'gemini-3-pro-preview',
            name: 'gemini-3-pro-preview',
            label: 'Gemini 3 Pro',
            description: '🚀 Latest Preview',
            category: 'gemini',
            default: true
          }
        ]
      }
    };

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

    // Normalize engine name
    let normalizedEngine = engine.toLowerCase();
    if (normalizedEngine.includes('claude')) normalizedEngine = 'claude';
    if (normalizedEngine.includes('codex') || normalizedEngine.includes('openai')) normalizedEngine = 'codex';
    if (normalizedEngine.includes('gemini') || normalizedEngine.includes('google')) normalizedEngine = 'gemini';

    const cliTools = {
      'claude': {
        name: 'Claude Code',
        models: [
          { id: 'claude-opus-4-5-20251101', label: 'Opus 4.5', description: '🧠 Most Intelligent' },
          { id: 'claude-sonnet-4-5-20250929', label: 'Sonnet 4.5', description: '🧠 Extended Thinking', default: true },
          { id: 'claude-haiku-4-5-20251001', label: 'Haiku 4.5', description: '⚡ Fast & Efficient' },
        ]
      },
      'codex': {
        name: 'Codex',
        models: [
          { id: 'gpt-5.1-codex-max', label: 'GPT-5.1 Codex Max', description: '💎 Best Quality', default: true },
          { id: 'gpt-5.1-codex', label: 'GPT-5.1 Codex', description: '🧠 High reasoning' },
          { id: 'gpt-5.1-codex-mini', label: 'GPT-5.1 Codex Mini', description: '⚡ Fast' },
          { id: 'gpt-5.1', label: 'GPT-5.1', description: '🧠 General Purpose' },
        ]
      },
      'gemini': {
        name: 'Gemini',
        models: [
          { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', description: '🚀 Latest', default: true },
        ]
      }
    };

    if (!cliTools[normalizedEngine]) {
      return res.status(404).json({ error: `Engine not found: ${engine}` });
    }

    res.json(cliTools[normalizedEngine]);
  } catch (error) {
    console.error('[Models] Error fetching engine models:', error);
    res.status(500).json({ error: 'Failed to fetch models' });
  }
});

module.exports = router;
