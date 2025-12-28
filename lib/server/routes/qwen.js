/**
 * Qwen Route - /api/v1/qwen
 *
 * Send messages to Qwen Code CLI with SSE streaming.
 */

const express = require('express');
const QwenWrapper = require('../services/qwen-wrapper');
const Message = require('../models/Message');
const { v4: uuidv4 } = require('uuid');
const sessionManager = require('../services/session-manager');
const contextBridge = require('../services/context-bridge');
const { resolveWorkspacePath } = require('../../utils/workspace');

const router = express.Router();
const qwenWrapper = new QwenWrapper();

function ensureConversation(conversationId, workspacePath) {
  try {
    const stmt = require('../db').prepare(`
      INSERT OR IGNORE INTO conversations (id, title, created_at, updated_at, metadata)
      VALUES (?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    const metadata = workspacePath ? JSON.stringify({ workspace: workspacePath }) : null;
    stmt.run(conversationId, 'New Chat', now, now, metadata);
  } catch (err) {
    console.warn('[Qwen] Failed to ensure conversation exists:', err.message);
  }
}

/**
 * POST /api/v1/qwen
 * Body:
 * {
 *   conversationId?: string,
 *   message: string,
 *   model?: string,
 *   workspace?: string
 * }
 */
router.post('/', async (req, res) => {
  try {
    console.log('[Qwen] === NEW QWEN REQUEST ===');
    console.log('[Qwen] Body:', JSON.stringify(req.body, null, 2));

    const { conversationId, message, model = 'coder-model', workspace } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'message required' });
    }

    const isAvailable = await qwenWrapper.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({
        error: 'Qwen CLI not available',
        details: 'Please install Qwen CLI: npm install -g @mmmbuto/qwen-code-termux'
      });
    }

    const workspacePath = resolveWorkspacePath(workspace, process.cwd());
    if (workspace && workspacePath !== workspace) {
      console.warn(`[Qwen] Workspace corrected: ${workspace} → ${workspacePath}`);
    }

    const frontendConversationId = conversationId || uuidv4();
    ensureConversation(frontendConversationId, workspacePath);

    const { sessionId, isNew: isNewSession } = await sessionManager.getOrCreateSession(
      frontendConversationId,
      'qwen',
      workspacePath
    );

    const nativeSessionId = isNewSession ? null : sessionManager.getNativeThreadId(sessionId);

    // SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    res.write(`data: ${JSON.stringify({
      type: 'message_start',
      messageId: `user-${Date.now()}`,
      sessionId,
      conversationId: frontendConversationId,
      engine: 'qwen'
    })}\n\n`);

    const lastEngine = Message.getLastEngine(frontendConversationId);
    const isEngineBridge = lastEngine && lastEngine !== 'qwen';

    let promptToSend = message;

    if (isEngineBridge) {
      const contextResult = await contextBridge.buildContext({
        conversationId: frontendConversationId,
        sessionId,
        fromEngine: lastEngine,
        toEngine: 'qwen',
        userMessage: message
      });
      promptToSend = contextResult.prompt;

      res.write(`data: ${JSON.stringify({
        type: 'status',
        category: 'system',
        message: `Context bridged from ${lastEngine}`,
        icon: '🔄'
      })}\n\n`);
    } else if (nativeSessionId) {
      console.log(`[Qwen] Native resume: qwen --resume ${nativeSessionId}`);
    }

    // Save user message
    try {
      Message.create(
        frontendConversationId,
        'user',
        message,
        { workspace: workspacePath, model },
        Date.now(),
        'qwen'
      );
      sessionManager.bumpSessionActivity(sessionId, 1);
    } catch (dbErr) {
      console.warn('[Qwen] Failed to save user message:', dbErr.message);
    }

    if (isNewSession) {
      const title = sessionManager.extractTitle(message);
      sessionManager.updateSessionTitle(sessionId, title);
    }

    const result = await qwenWrapper.sendMessage({
      prompt: promptToSend,
      threadId: nativeSessionId,
      model,
      workspacePath,
      processId: sessionId,
      onStatus: (event) => {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    if (result.sessionId) {
      sessionManager.setNativeThreadId(sessionId, result.sessionId);
    }

    try {
      Message.create(
        frontendConversationId,
        'assistant',
        result.text,
        { model, usage: result.usage },
        Date.now(),
        'qwen'
      );
      sessionManager.bumpSessionActivity(sessionId, 1);
    } catch (dbErr) {
      console.warn('[Qwen] Failed to save assistant message:', dbErr.message);
    }

    if (contextBridge.shouldTriggerSummary(frontendConversationId, isEngineBridge)) {
      contextBridge.triggerSummaryGeneration(frontendConversationId, '[Qwen]');
    }

    res.write(`data: ${JSON.stringify({
      type: 'message_done',
      content: result.text,
      usage: result.usage,
      sessionId,
      conversationId: frontendConversationId,
      engine: 'qwen',
      model
    })}\n\n`);

    res.end();
    console.log('[Qwen] === REQUEST COMPLETE ===');
  } catch (error) {
    console.error('[Qwen] Error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /api/v1/qwen/status
 */
router.get('/status', async (_req, res) => {
  try {
    const isAvailable = await qwenWrapper.isAvailable();
    res.json({
      available: isAvailable,
      defaultModel: qwenWrapper.getDefaultModel(),
      models: qwenWrapper.getAvailableModels()
    });
  } catch (error) {
    console.error('[Qwen] Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/qwen/models
 */
router.get('/models', (_req, res) => {
  res.json({
    models: qwenWrapper.getAvailableModels(),
    default: qwenWrapper.getDefaultModel()
  });
});

/**
 * POST /api/v1/qwen/interrupt
 */
router.post('/interrupt', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ error: 'sessionId required' });
    }

    const result = qwenWrapper.interrupt(sessionId);
    res.json(result);
  } catch (error) {
    console.error('[Qwen] Interrupt error:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
