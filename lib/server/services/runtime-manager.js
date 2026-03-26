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

function getRuntimeDefaults(platformId) {
  const desktopCodexLtsInstall = shellJoin([
    'brew tap DioNanos/codex-lts',
    'brew install codex-lts'
  ]);

  const desktopCodexLtsUpdate = shellJoin([
    'brew update',
    'brew upgrade codex-lts'
  ]);

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
        source: platformId === 'termux' ? 'npm' : 'brew',
        installCommand: platformId === 'termux'
          ? `${npmCommand()} install -g @mmmbuto/codex-cli-termux@0.80.6-lts`
          : desktopCodexLtsInstall,
        updateCommand: platformId === 'termux'
          ? `${npmCommand()} update -g @mmmbuto/codex-cli-termux`
          : desktopCodexLtsUpdate,
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

function providerEnvForModel(modelId) {
  switch (modelId) {
    case 'deepseek-reasoner':
    case 'deepseek-chat':
      return {
        ANTHROPIC_BASE_URL: 'https://api.deepseek.com/anthropic',
        ANTHROPIC_MODEL: modelId,
      };
    case 'glm-4.7':
      return {
        ANTHROPIC_BASE_URL: 'https://api.z.ai/api/anthropic',
        ANTHROPIC_MODEL: 'GLM-4.7',
        API_TIMEOUT_MS: '3000000',
      };
    case 'glm-5':
      return {
        ANTHROPIC_MODEL: 'GLM-5',
      };
    default:
      return {};
  }
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

    const env = model?.custom ? providerEnvForModel(model.id) : {};

    return {
      engine: resolvedEngine,
      lane: resolvedLane,
      runtimeId: runtime?.runtimeId || model?.runtimeId || null,
      command: runtime?.command || null,
      env,
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
