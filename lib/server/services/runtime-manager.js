const { execFile } = require('child_process');
const { promisify } = require('util');
const { getCliTools, getModelById, getDefaultModelId } = require('../../config/models');
const { getConfig } = require('../../config/manager');

const execFileAsync = promisify(execFile);

function isTermux() {
  return (
    process.env.PREFIX?.includes('com.termux') ||
    process.env.TERMUX_VERSION !== undefined
  );
}

function getPlatformId() {
  if (isTermux()) return 'termux';
  if (process.platform === 'darwin') return 'macos';
  if (process.platform === 'linux') return 'linux';
  return process.platform;
}

function npmCommand() {
  if (isTermux()) return 'npm';
  return 'npm';
}

function shellJoin(commands) {
  return commands.filter(Boolean).join(' && ');
}

function buildProviderAuth({ providerId, dbKey, envVars = [], displayName, helpUrl, assignOpenAiKey = false }) {
  return {
    providerId,
    dbKey,
    envVars,
    displayName,
    helpUrl,
    assignOpenAiKey,
  };
}

function resolveClaudeCustomProfile(model) {
  switch (model.id) {
    case 'deepseek-reasoner':
    case 'deepseek-chat':
      return {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
          ANTHROPIC_MODEL: model.id,
          ANTHROPIC_SMALL_FAST_MODEL: 'deepseek-chat',
          API_TIMEOUT_MS: '900000',
        },
        providerAuth: buildProviderAuth({
          providerId: 'deepseek',
          dbKey: 'deepseek',
          envVars: ['DEEPSEEK_API_KEY'],
          displayName: 'DeepSeek',
          helpUrl: 'https://platform.deepseek.com/api_keys',
        }),
      };
    case 'glm-4.7':
    case 'glm-5':
      return {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
          ANTHROPIC_MODEL: model.id === 'glm-5' ? 'GLM-5' : 'GLM-4.7',
          ANTHROPIC_SMALL_FAST_MODEL: 'GLM-4.5-Air',
          API_TIMEOUT_MS: '3000000',
        },
        providerAuth: buildProviderAuth({
          providerId: 'zai',
          dbKey: 'zai',
          envVars: ['ZAI_API_KEY', 'ZAI_API_KEY_A', 'ZAI_API_KEY_P'],
          displayName: 'Z.ai',
          helpUrl: 'https://z.ai',
        }),
      };
    case 'qwen3.5-plus':
    case 'qwen3-max-2026-01-23':
    case 'kimi-k2.5':
      return {
        env: {
          ANTHROPIC_BASE_URL: 'https://coding-intl.dashscope.aliyuncs.com/apps/anthropic',
          ANTHROPIC_MODEL: model.id,
          ANTHROPIC_SMALL_FAST_MODEL: 'qwen3.5-plus',
          API_TIMEOUT_MS: '3000000',
        },
        providerAuth: buildProviderAuth({
          providerId: 'alibaba',
          dbKey: 'alibaba',
          envVars: ['ALIBABA_CODE_API_KEY'],
          displayName: 'Alibaba Code',
          helpUrl: 'https://dashscope.aliyun.com',
        }),
      };
    case 'MiniMax-M2.7':
      return {
        env: {
          ANTHROPIC_BASE_URL: 'https://api.minimax.io/anthropic',
          ANTHROPIC_MODEL: 'MiniMax-M2.7',
          ANTHROPIC_SMALL_FAST_MODEL: 'MiniMax-M2.7',
          API_TIMEOUT_MS: '120000',
        },
        providerAuth: buildProviderAuth({
          providerId: 'minimax',
          dbKey: 'minimax',
          envVars: ['MINIMAX_API_KEY'],
          displayName: 'MiniMax',
          helpUrl: 'https://api.minimax.io',
        }),
      };
    default:
      return { env: {}, providerAuth: null };
  }
}

function resolveCodexCustomProfile(model) {
  if (model.providerId === 'alibaba') {
    const providerName = 'alibaba-code';
    return {
      env: {},
      configOverrides: [
        `model="${model.id}"`,
        `model_provider="${providerName}"`,
        `model_providers.${providerName}.name="Alibaba-Code"`,
        `model_providers.${providerName}.base_url="https://coding-intl.dashscope.aliyuncs.com/v1"`,
        `model_providers.${providerName}.env_key="ALIBABA_CODE_API_KEY"`,
        `model_providers.${providerName}.wire_api="chat"`,
      ],
      providerAuth: buildProviderAuth({
        providerId: 'alibaba',
        dbKey: 'alibaba',
        envVars: ['ALIBABA_CODE_API_KEY'],
        displayName: 'Alibaba Code',
        helpUrl: 'https://dashscope.aliyun.com',
        assignOpenAiKey: true,
      }),
    };
  }

  if (model.providerId === 'zai') {
    const providerName = 'zai';
    return {
      env: {},
      configOverrides: [
        `model="${model.id}"`,
        `model_provider="${providerName}"`,
        `model_providers.${providerName}.name="ZAI"`,
        `model_providers.${providerName}.base_url="https://api.z.ai/api/coding/paas/v4"`,
        `model_providers.${providerName}.env_key="ZAI_API_KEY"`,
        `model_providers.${providerName}.wire_api="chat"`,
      ],
      providerAuth: buildProviderAuth({
        providerId: 'zai',
        dbKey: 'zai',
        envVars: ['ZAI_API_KEY', 'ZAI_API_KEY_A', 'ZAI_API_KEY_P'],
        displayName: 'Z.ai',
        helpUrl: 'https://z.ai',
        assignOpenAiKey: true,
      }),
    };
  }

  if (model.providerId === 'chutes') {
    const providerName = 'chutes';
    return {
      env: {},
      configOverrides: [
        `model="${model.id}"`,
        `model_provider="${providerName}"`,
        `model_providers.${providerName}.name="Chutes"`,
        `model_providers.${providerName}.base_url="https://llm.chutes.ai/v1"`,
        `model_providers.${providerName}.env_key="CHUTES_API_KEY"`,
        `model_providers.${providerName}.wire_api="chat"`,
      ],
      providerAuth: buildProviderAuth({
        providerId: 'chutes',
        dbKey: 'chutes',
        envVars: ['CHUTES_API_KEY'],
        displayName: 'Chutes',
        helpUrl: 'https://chutes.ai',
        assignOpenAiKey: true,
      }),
    };
  }

  return { env: {}, configOverrides: [], providerAuth: null };
}

function resolveCustomRuntimeProfile(model) {
  if (!model?.custom) {
    return { env: {}, configOverrides: [], providerAuth: null };
  }

  if (model.engine === 'claude') {
    return {
      configOverrides: [],
      ...resolveClaudeCustomProfile(model),
    };
  }

  if (model.engine === 'codex') {
    return resolveCodexCustomProfile(model);
  }

  return { env: {}, configOverrides: [], providerAuth: null };
}

function getRuntimeDefaults(platformId) {
  return {
    claude: {
      native: {
        runtimeId: 'claude-native',
        command: 'claude',
        source: 'npm',
        installCommand: `${npmCommand()} install -g @anthropic-ai/claude-code@latest`,
        updateCommand: `${npmCommand()} update -g @anthropic-ai/claude-code`,
        checkCommand: 'claude --version',
        sharedBinary: true,
      },
      custom: {
        runtimeId: 'claude-custom',
        command: 'claude',
        source: 'shared-cli',
        installCommand: `${npmCommand()} install -g @anthropic-ai/claude-code@latest`,
        updateCommand: `${npmCommand()} update -g @anthropic-ai/claude-code`,
        checkCommand: 'claude --version',
        sharedBinary: true,
      },
    },
    codex: {
      native: {
        runtimeId: 'codex-native',
        command: 'codex',
        source: 'npm',
        installCommand: `${npmCommand()} install -g @openai/codex@latest`,
        updateCommand: `${npmCommand()} update -g @openai/codex`,
        checkCommand: 'codex --version',
      },
      custom: {
        runtimeId: 'codex-custom',
        command: 'codex-lts',
        source: platformId === 'termux' ? 'npm' : 'manual',
        installCommand: platformId === 'termux'
          ? `${npmCommand()} install -g @mmmbuto/codex-cli-termux@0.80.6-lts`
          : null,
        updateCommand: platformId === 'termux'
          ? `${npmCommand()} update -g @mmmbuto/codex-cli-termux`
          : null,
        checkCommand: 'codex-lts --version',
      },
    },
    gemini: {
      native: {
        runtimeId: 'gemini-native',
        command: 'gemini',
        source: 'npm',
        installCommand: `${npmCommand()} install -g @google/gemini-cli@latest`,
        updateCommand: `${npmCommand()} update -g @google/gemini-cli`,
        checkCommand: 'gemini --version',
      },
      custom: {
        runtimeId: 'gemini-custom',
        command: 'gemini',
        source: 'npm',
        installCommand: `${npmCommand()} install -g @google/gemini-cli@latest`,
        updateCommand: `${npmCommand()} update -g @google/gemini-cli`,
        checkCommand: 'gemini --version',
      },
    },
    qwen: {
      native: {
        runtimeId: 'qwen-native',
        command: 'qwen',
        source: platformId === 'termux' ? 'npm' : 'npm',
        installCommand: `${npmCommand()} install -g @qwen-code/qwen-code@latest`,
        updateCommand: `${npmCommand()} update -g @qwen-code/qwen-code`,
        checkCommand: 'qwen --version',
      },
      custom: {
        runtimeId: 'qwen-custom',
        command: 'qwen',
        source: platformId === 'termux' ? 'npm' : 'npm',
        installCommand: `${npmCommand()} install -g @qwen-code/qwen-code@latest`,
        updateCommand: `${npmCommand()} update -g @qwen-code/qwen-code`,
        checkCommand: 'qwen --version',
      },
    },
  };
}

class RuntimeManager {
  constructor() {
    this.platformId = getPlatformId();
  }

  getToolCatalog() {
    return getCliTools();
  }

  getRuntimeDefinitions() {
    const config = getConfig();
    const defaults = getRuntimeDefaults(this.platformId);
    const engines = this.getToolCatalog();

    return Object.fromEntries(
      Object.entries(engines).map(([engineId, engine]) => {
        const configEngine = config.engines?.[engineId] || {};
        const configLanes = configEngine.lanes || {};
        const lanes = Object.fromEntries(
          Object.entries(engine.lanes || {}).map(([laneId, lane]) => {
            const defaultLane = defaults[engineId]?.[laneId] || {};
            const configuredLane = configLanes[laneId] || {};
            const command = configuredLane.command || configEngine.path || defaultLane.command;
            const runtimeId = configuredLane.runtimeId || lane.runtimeId || defaultLane.runtimeId;
            const enabled = configuredLane.enabled ?? configEngine.enabled ?? true;

            return [laneId, {
              engine: engineId,
              lane: laneId,
              laneLabel: lane.label || laneId,
              runtimeId,
              command,
              enabled,
              source: configuredLane.source || defaultLane.source || 'manual',
              installCommand: configuredLane.installCommand || defaultLane.installCommand || null,
              updateCommand: configuredLane.updateCommand || defaultLane.updateCommand || null,
              checkCommand: configuredLane.checkCommand || defaultLane.checkCommand || `${command} --version`,
              sharedBinary: configuredLane.sharedBinary ?? defaultLane.sharedBinary ?? false,
            }];
          })
        );

        return [engineId, lanes];
      })
    );
  }

  async probeCommand(command) {
    if (!command) {
      return { available: false, version: null, error: 'command not configured' };
    }

    try {
      const { stdout, stderr } = await execFileAsync(command, ['--version'], {
        timeout: 10000,
        env: process.env,
      });
      return {
        available: true,
        version: (stdout || stderr || '').trim() || 'unknown',
        error: null,
      };
    } catch (error) {
      return {
        available: false,
        version: null,
        error: error.message,
      };
    }
  }

  async getRuntimeInventory() {
    const definitions = this.getRuntimeDefinitions();
    const tools = this.getToolCatalog();
    const inventory = [];

    for (const [engineId, lanes] of Object.entries(definitions)) {
      for (const [laneId, runtime] of Object.entries(lanes)) {
        const probe = await this.probeCommand(runtime.command);
        const laneModels = tools[engineId]?.models?.filter((model) => model.lane === laneId) || [];
        inventory.push({
          ...runtime,
          platform: this.platformId,
          status: probe.available ? 'available' : 'missing',
          installedVersion: probe.version,
          latestVersion: 'upstream',
          available: probe.available,
          error: probe.error,
          models: laneModels.map((model) => ({
            id: model.id,
            label: model.label,
            providerId: model.providerId,
          })),
          actions: [
            runtime.installCommand ? 'install' : null,
            runtime.updateCommand ? 'update' : null,
            'check',
          ].filter(Boolean),
        });
      }
    }

    return inventory;
  }

  async getRuntimeInventoryMap() {
    const inventory = await this.getRuntimeInventory();
    return Object.fromEntries(inventory.map((item) => [item.runtimeId, item]));
  }

  async getRuntimeAwareCliTools() {
    const tools = this.getToolCatalog();
    const inventoryMap = await this.getRuntimeInventoryMap();

    return Object.fromEntries(Object.entries(tools).map(([engineId, engine]) => {
      const models = (engine.models || []).map((model) => {
        const runtime = inventoryMap[model.runtimeId];
        return {
          ...model,
          availability: runtime?.status || 'unknown',
          runtimeStatus: runtime?.status || 'unknown',
          runtimeCommand: runtime?.command || null,
          runtimeSource: runtime?.source || null,
          available: runtime?.available ?? false,
        };
      });

      return [engineId, {
        ...engine,
        models,
      }];
    }));
  }

  resolveModel(modelId) {
    return getModelById(modelId) || getModelById(getDefaultModelId());
  }

  resolveRuntimeSelection({ engine, lane, runtimeId, modelId }) {
    const model = this.resolveModel(modelId);
    const resolvedEngine = engine || model?.engine;
    const resolvedLane = lane || model?.lane || 'native';
    const definitions = this.getRuntimeDefinitions();
    const runtime = runtimeId
      ? Object.values(definitions[resolvedEngine] || {}).find((entry) => entry.runtimeId === runtimeId)
      : definitions[resolvedEngine]?.[resolvedLane];
    const customProfile = resolveCustomRuntimeProfile(model);

    return {
      engine: resolvedEngine,
      lane: resolvedLane,
      runtimeId: runtime?.runtimeId || model?.runtimeId || null,
      command: runtime?.command || null,
      env: customProfile.env || {},
      configOverrides: customProfile.configOverrides || [],
      providerAuth: customProfile.providerAuth || null,
      model,
      runtime,
    };
  }

  resolveAction(runtimeId, action) {
    const definitions = this.getRuntimeDefinitions();
    for (const lanes of Object.values(definitions)) {
      for (const runtime of Object.values(lanes)) {
        if (runtime.runtimeId !== runtimeId) continue;
        if (action === 'install') return runtime.installCommand;
        if (action === 'update') return runtime.updateCommand;
        if (action === 'check') return runtime.checkCommand;
      }
    }
    return null;
  }
}

module.exports = RuntimeManager;
