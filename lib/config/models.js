/**
 * Shared model catalog for NexusCLI.
 * The catalog is engine/lane aware, while keeping a compatibility
 * shape for legacy routes and UI consumers.
 */

const ENGINE_ENDPOINTS = {
  claude: '/api/v1/chat',
  codex: '/api/v1/codex',
  gemini: '/api/v1/gemini',
  qwen: '/api/v1/qwen',
};

const CATALOG = {
  claude: {
    id: 'claude',
    name: 'Claude Code',
    icon: 'Terminal',
    endpoint: ENGINE_ENDPOINTS.claude,
    thinkModes: ['think', 'no-think'],
    defaultThinkMode: 'think',
    lanes: {
      native: {
        runtimeId: 'claude-native',
        label: 'Native',
        models: [
          {
            id: 'sonnet',
            name: 'sonnet',
            label: 'Claude Sonnet 4.6',
            description: 'Latest balanced Claude coding model',
            providerId: 'anthropic',
            default: true,
          },
          {
            id: 'opus',
            name: 'opus',
            label: 'Claude Opus 4.6',
            description: 'Highest capability Claude model',
            providerId: 'anthropic',
          },
          {
            id: 'haiku',
            name: 'haiku',
            label: 'Claude Haiku 4.5',
            description: 'Fast Claude lane',
            providerId: 'anthropic',
          },
        ],
      },
      custom: {
        runtimeId: 'claude-custom',
        label: 'Custom',
        models: [
          {
            id: 'deepseek-reasoner',
            name: 'deepseek-reasoner',
            label: 'DeepSeek Reasoner',
            description: 'Claude CLI via DeepSeek Anthropic-compatible API',
            providerId: 'deepseek',
          },
          {
            id: 'deepseek-chat',
            name: 'deepseek-chat',
            label: 'DeepSeek Chat',
            description: 'Fast DeepSeek chat over Claude CLI',
            providerId: 'deepseek',
          },
          {
            id: 'glm-4.7',
            name: 'glm-4.7',
            label: 'GLM 4.7',
            description: 'Z.ai Anthropic-compatible model',
            providerId: 'zai',
          },
          {
            id: 'glm-5',
            name: 'glm-5',
            label: 'GLM 5',
            description: 'Z.ai latest custom runtime',
            providerId: 'zai',
          },
          {
            id: 'qwen3.5-plus',
            name: 'qwen3.5-plus',
            label: 'Qwen 3.5 Plus',
            description: 'Alibaba custom provider over Claude CLI',
            providerId: 'alibaba',
          },
          {
            id: 'qwen3-max-2026-01-23',
            name: 'qwen3-max-2026-01-23',
            label: 'Qwen 3 Max',
            description: 'Alibaba custom provider over Claude CLI',
            providerId: 'alibaba',
          },
          {
            id: 'kimi-k2.5',
            name: 'kimi-k2.5',
            label: 'Kimi K2.5',
            description: 'Moonshot-compatible custom lane',
            providerId: 'alibaba',
          },
          {
            id: 'MiniMax-M2.7',
            name: 'MiniMax-M2.7',
            label: 'MiniMax M2.7',
            description: 'MiniMax custom lane over Claude CLI',
            providerId: 'minimax',
          },
        ],
      },
    },
  },

  codex: {
    id: 'codex',
    name: 'Codex',
    icon: 'Code2',
    endpoint: ENGINE_ENDPOINTS.codex,
    lanes: {
      native: {
        runtimeId: 'codex-native',
        label: 'Native',
        models: [
          {
            id: 'gpt-5.4',
            name: 'gpt-5.4',
            label: 'GPT-5.4',
            description: 'Latest flagship reasoning model',
            providerId: 'openai',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            defaultReasoning: 'high',
          },
          {
            id: 'gpt-5.3-codex',
            name: 'gpt-5.3-codex',
            label: 'GPT-5.3 Codex',
            description: 'Current codex-specialized model',
            providerId: 'openai',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            defaultReasoning: 'high',
            default: true,
          },
          {
            id: 'gpt-5.2-codex',
            name: 'gpt-5.2-codex',
            label: 'GPT-5.2 Codex',
            description: 'Stable codex model',
            providerId: 'openai',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            defaultReasoning: 'high',
          },
          {
            id: 'gpt-5.1-codex-max',
            name: 'gpt-5.1-codex-max',
            label: 'GPT-5.1 Codex Max',
            description: 'Deep codex reasoning',
            providerId: 'openai',
            reasoningEfforts: ['low', 'medium', 'high', 'xhigh'],
            defaultReasoning: 'high',
          },
          {
            id: 'codex-mini-latest',
            name: 'codex-mini-latest',
            label: 'Codex Mini Latest',
            description: 'Fast latest codex lane',
            providerId: 'openai',
            reasoningEfforts: ['medium', 'high'],
            defaultReasoning: 'medium',
          },
        ],
      },
      custom: {
        runtimeId: 'codex-custom',
        label: 'Custom',
        models: [
          {
            id: 'qwen3-coder-plus',
            name: 'qwen3-coder-plus',
            label: 'Qwen 3 Coder Plus',
            description: 'Custom coding provider via codex-lts',
            providerId: 'alibaba',
            reasoningEfforts: ['medium', 'high'],
            defaultReasoning: 'high',
          },
          {
            id: 'qwen3-coder-next',
            name: 'qwen3-coder-next',
            label: 'Qwen 3 Coder Next',
            description: 'Custom coding provider via codex-lts',
            providerId: 'alibaba',
            reasoningEfforts: ['medium', 'high'],
            defaultReasoning: 'high',
          },
          {
            id: 'qwen3.5-plus',
            name: 'qwen3.5-plus',
            label: 'Qwen 3.5 Plus',
            description: 'Custom provider lane via codex-lts',
            providerId: 'alibaba',
            reasoningEfforts: ['medium', 'high'],
            defaultReasoning: 'high',
          },
          {
            id: 'glm-5',
            name: 'glm-5',
            label: 'GLM 5',
            description: 'Z.ai custom lane via codex-lts',
            providerId: 'zai',
            reasoningEfforts: ['medium', 'high'],
            defaultReasoning: 'high',
          },
          {
            id: 'deepseek-ai/DeepSeek-V3.2-TEE',
            name: 'deepseek-ai/DeepSeek-V3.2-TEE',
            label: 'DeepSeek V3.2 TEE',
            description: 'Chutes custom runtime via codex-lts',
            providerId: 'chutes',
            reasoningEfforts: ['medium', 'high'],
            defaultReasoning: 'high',
          },
        ],
      },
    },
  },

  gemini: {
    id: 'gemini',
    name: 'Gemini',
    icon: 'Sparkles',
    endpoint: ENGINE_ENDPOINTS.gemini,
    lanes: {
      native: {
        runtimeId: 'gemini-native',
        label: 'Native',
        models: [
          {
            id: 'gemini-3-pro-preview',
            name: 'gemini-3-pro-preview',
            label: 'Gemini 3 Pro',
            description: 'Current Gemini 3 pro line',
            providerId: 'google',
            default: true,
          },
          {
            id: 'gemini-3-flash-preview',
            name: 'gemini-3-flash-preview',
            label: 'Gemini 3 Flash',
            description: 'Current Gemini 3 flash line',
            providerId: 'google',
          },
          {
            id: 'gemini-2.5-pro',
            name: 'gemini-2.5-pro',
            label: 'Gemini 2.5 Pro',
            description: 'Stable Gemini 2.5 pro',
            providerId: 'google',
          },
          {
            id: 'gemini-2.5-flash',
            name: 'gemini-2.5-flash',
            label: 'Gemini 2.5 Flash',
            description: 'Stable Gemini 2.5 flash',
            providerId: 'google',
          },
        ],
      },
      custom: {
        runtimeId: 'gemini-custom',
        label: 'Custom',
        models: [],
      },
    },
  },

  qwen: {
    id: 'qwen',
    name: 'Qwen Code',
    icon: 'Cpu',
    endpoint: ENGINE_ENDPOINTS.qwen,
    lanes: {
      native: {
        runtimeId: 'qwen-native',
        label: 'Native',
        models: [
          {
            id: 'qwen3-coder-plus',
            name: 'qwen3-coder-plus',
            label: 'Qwen 3 Coder Plus',
            description: 'Primary Qwen coding model',
            providerId: 'qwen',
            default: true,
          },
          {
            id: 'qwen3-coder-next',
            name: 'qwen3-coder-next',
            label: 'Qwen 3 Coder Next',
            description: 'Latest Qwen coding lane',
            providerId: 'qwen',
          },
          {
            id: 'qwen3.5-plus',
            name: 'qwen3.5-plus',
            label: 'Qwen 3.5 Plus',
            description: 'Higher-capability Qwen lane',
            providerId: 'qwen',
          },
          {
            id: 'qwen3-max',
            name: 'qwen3-max',
            label: 'Qwen 3 Max',
            description: 'Largest Qwen lane',
            providerId: 'qwen',
          },
        ],
      },
      custom: {
        runtimeId: 'qwen-custom',
        label: 'Custom',
        models: [
          {
            id: 'glm-4.7',
            name: 'glm-4.7',
            label: 'GLM 4.7',
            description: 'Provider-side custom lane supported by Qwen Code',
            providerId: 'zai',
          },
          {
            id: 'kimi-k2.5',
            name: 'kimi-k2.5',
            label: 'Kimi K2.5',
            description: 'Provider-side custom lane supported by Qwen Code',
            providerId: 'kimi',
          },
        ],
      },
    },
  },
};

function flattenEngineModels(engineId, engine) {
  return Object.entries(engine.lanes || {}).flatMap(([laneId, lane]) =>
    (lane.models || []).map((model) => ({
      ...model,
      lane: laneId,
      laneLabel: lane.label || laneId,
      runtimeId: model.runtimeId || lane.runtimeId,
      category: engineId,
      engine: engineId,
      endpoint: engine.endpoint,
      custom: laneId === 'custom',
    }))
  );
}

function getCatalog() {
  return JSON.parse(JSON.stringify(CATALOG));
}

function getCliTools() {
  const catalog = getCatalog();
  const tools = {};

  for (const [engineId, engine] of Object.entries(catalog)) {
    tools[engineId] = {
      id: engineId,
      name: engine.name,
      icon: engine.icon,
      enabled: true,
      endpoint: engine.endpoint,
      thinkModes: engine.thinkModes || [],
      defaultThinkMode: engine.defaultThinkMode,
      lanes: engine.lanes,
      models: flattenEngineModels(engineId, engine),
    };
  }

  return tools;
}

function getAllModels() {
  return Object.values(getCliTools()).flatMap((cli) => cli.models || []);
}

function getModelById(modelId) {
  if (!modelId) return null;
  return getAllModels().find((model) => model.id === modelId) || null;
}

function getEngineForModel(modelId) {
  return getModelById(modelId)?.engine || null;
}

function isValidModelId(modelId) {
  return Boolean(getModelById(modelId));
}

function getDefaultModelId() {
  const models = getAllModels();
  const withDefault = models.find((m) => m.default);
  return withDefault ? withDefault.id : (models[0]?.id || null);
}

module.exports = {
  ENGINE_ENDPOINTS,
  getCatalog,
  getCliTools,
  getAllModels,
  getModelById,
  getEngineForModel,
  isValidModelId,
  getDefaultModelId,
};
