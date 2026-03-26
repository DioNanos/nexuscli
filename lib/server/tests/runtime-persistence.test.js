const fs = require('fs');
const os = require('os');
const path = require('path');

describe('Runtime-aware persistence', () => {
  let initDb;
  let prepare;
  let getDb;
  let Message;
  let Conversation;
  let sessionManager;

  beforeEach(async () => {
    process.env.HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuscli-home-'));
    jest.resetModules();
    ({ initDb, prepare, getDb } = require('../db'));
    await initDb();
    Message = require('../models/Message');
    Conversation = require('../models/Conversation');
    sessionManager = require('../services/session-manager');
  });

  afterEach(() => {
    try {
      const db = getDb();
      if (db && typeof db.close === 'function') {
        db.close();
      }
    } catch (_) {
      // ignore cleanup errors
    }
  });

  test('Conversation.create seeds native runtime metadata in sessions', () => {
    const conversation = Conversation.create('Runtime test', '/tmp/runtime-test');
    const row = prepare('SELECT engine, lane, runtime_id, provider_id, model_id FROM sessions WHERE id = ?').get(conversation.id);

    expect(row).toMatchObject({
      engine: 'claude',
      lane: 'native',
      runtime_id: 'claude-native',
      provider_id: 'anthropic',
      model_id: 'sonnet',
    });
  });

  test('Message.create persists lane/runtime/provider/model metadata', () => {
    const conversation = Conversation.create('Message runtime', '/tmp/runtime-test');
    const message = Message.create(
      conversation.id,
      'user',
      'hello',
      { workspace: '/tmp/runtime-test' },
      Date.now(),
      'codex',
      {
        lane: 'custom',
        runtimeId: 'codex-custom',
        providerId: 'alibaba',
        modelId: 'qwen3-coder-plus',
      }
    );

    const row = prepare('SELECT engine, lane, runtime_id, provider_id, model_id FROM messages WHERE id = ?').get(message.id);
    expect(row).toMatchObject({
      engine: 'codex',
      lane: 'custom',
      runtime_id: 'codex-custom',
      provider_id: 'alibaba',
      model_id: 'qwen3-coder-plus',
    });
  });

  test('SessionManager persists runtime metadata for new sessions', async () => {
    const result = await sessionManager.getOrCreateSession(
      'conv-runtime',
      'codex',
      '/tmp/runtime-test',
      {
        lane: 'custom',
        runtimeId: 'codex-custom',
        providerId: 'chutes',
        modelId: 'deepseek-ai/DeepSeek-V3.2-TEE',
      }
    );

    expect(result.isNew).toBe(true);
    const row = prepare('SELECT engine, lane, runtime_id, provider_id, model_id FROM sessions WHERE id = ?').get(result.sessionId);
    expect(row).toMatchObject({
      engine: 'codex',
      lane: 'custom',
      runtime_id: 'codex-custom',
      provider_id: 'chutes',
      model_id: 'deepseek-ai/DeepSeek-V3.2-TEE',
    });
  });
});
