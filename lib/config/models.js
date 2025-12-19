/**
 * Shared model catalog for NexusCLI (backend + CLI)
 * Keep this as the single source of truth for available engines/models.
 */

/**
 * Returns the available CLI tools and their models.
 * Shape is consumed by API, frontend, and CLI commands.
 */
function getCliTools() {
  return {
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
        },
        // === GLM-4.6 (Z.ai) ===
        {
          id: 'glm-4-6',
          name: 'glm-4-6',
          label: 'GLM 4.6',
          description: '🌍 Advanced Chinese/English Multilingual',
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
          id: 'gpt-5.2',
          name: 'gpt-5.2',
          label: 'GPT-5.2',
          description: '🧠 Next Gen Reasoning',
          category: 'codex',
          reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoning: 'xhigh'
        },
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
          reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
          defaultReasoning: 'xhigh'
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
        },
        {
          id: 'gemini-3-flash-preview',
          name: 'gemini-3-flash-preview',
          label: 'Gemini 3 Flash',
          description: '⚡ Fastest Gemini 3 (preview)',
          category: 'gemini'
        }
      ]
    }
  };
}

function getAllModels() {
  return Object.values(getCliTools()).flatMap(cli => cli.models || []);
}

function isValidModelId(modelId) {
  if (!modelId) return false;
  return getAllModels().some(m => m.id === modelId);
}

function getDefaultModelId() {
  const models = getAllModels();
  const withDefault = models.find(m => m.default);
  return withDefault ? withDefault.id : (models[0]?.id || null);
}

module.exports = {
  getCliTools,
  getAllModels,
  isValidModelId,
  getDefaultModelId
};
