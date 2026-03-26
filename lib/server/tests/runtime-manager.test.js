const fs = require('fs');
const os = require('os');
const path = require('path');

describe('RuntimeManager', () => {
  let RuntimeManager;

  beforeEach(() => {
    process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuscli-home-'));
    jest.resetModules();
    RuntimeManager = require('../services/runtime-manager');
  });

  test('resolves Claude custom provider env for Alibaba-backed models', () => {
    const runtimeManager = new RuntimeManager();
    const selection = runtimeManager.resolveRuntimeSelection({ modelId: 'qwen3-max-2026-01-23' });

    expect(selection.engine).toBe('claude');
    expect(selection.lane).toBe('custom');
    expect(selection.runtimeId).toBe('claude-custom');
    expect(selection.env.ANTHROPIC_BASE_URL).toBe('https://coding-intl.dashscope.aliyuncs.com/apps/anthropic');
    expect(selection.env.ANTHROPIC_MODEL).toBe('qwen3-max-2026-01-23');
    expect(selection.providerAuth).toMatchObject({
      providerId: 'alibaba',
      dbKey: 'alibaba',
      envVars: ['ALIBABA_CODE_API_KEY'],
    });
  });

  test('resolves Codex custom provider config overrides for Chutes', () => {
    const runtimeManager = new RuntimeManager();
    const selection = runtimeManager.resolveRuntimeSelection({ modelId: 'deepseek-ai/DeepSeek-V3.2-TEE' });

    expect(selection.engine).toBe('codex');
    expect(selection.lane).toBe('custom');
    expect(selection.runtimeId).toBe('codex-custom');
    expect(selection.configOverrides).toContain('model_provider="chutes"');
    expect(selection.configOverrides).toContain('model_providers.chutes.base_url="https://llm.chutes.ai/v1"');
    expect(selection.providerAuth).toMatchObject({
      providerId: 'chutes',
      dbKey: 'chutes',
      envVars: ['CHUTES_API_KEY'],
      assignOpenAiKey: true,
    });
  });
});
