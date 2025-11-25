/**
 * Gemini Route - /api/v1/gemini
 *
 * Send messages to Gemini CLI with SSE streaming.
 * Part of TRI CLI v0.4.0
 */

const express = require('express');
const GeminiWrapper = require('../services/gemini-wrapper');
const Message = require('../models/Message');
const { v4: uuidv4 } = require('uuid');
const sessionManager = require('../services/session-manager');
const contextBridge = require('../services/context-bridge');

const router = express.Router();
const geminiWrapper = new GeminiWrapper();

/**
 * POST /api/v1/gemini
 * Send message to Gemini CLI with SSE streaming
 *
 * Request body:
 * {
 *   "conversationId": "uuid" (optional for new chat)
 *   "message": "user prompt",
 *   "model": "gemini-3-pro-preview" (optional),
 *   "workspace": "/path" (optional)
 * }
 *
 * Response: SSE stream
 * - status: Tool use, system events
 * - response_chunk: Streaming text
 * - message_done: Final response and usage
 */
router.post('/', async (req, res) => {
  try {
    console.log('[Gemini] === NEW GEMINI REQUEST ===');
    console.log('[Gemini] Body:', JSON.stringify(req.body, null, 2));

    const { conversationId, message, model = 'gemini-3-pro-preview', workspace } = req.body;

    console.log(`[Gemini] conversationId: ${conversationId}`);
    console.log(`[Gemini] message: ${message?.substring(0, 100)}`);
    console.log(`[Gemini] model: ${model}`);
    console.log(`[Gemini] workspace: ${workspace}`);

    if (!message) {
      console.log('[Gemini] ERROR: message required');
      return res.status(400).json({ error: 'message required' });
    }

    // Check if Gemini CLI is available
    const isAvailable = await geminiWrapper.isAvailable();
    if (!isAvailable) {
      console.log('[Gemini] ERROR: Gemini CLI not available');
      return res.status(503).json({
        error: 'Gemini CLI not available',
        details: 'Please install Gemini CLI: npm install -g @anthropic/gemini-cli'
      });
    }

    // Resolve workspace path
    const workspacePath = workspace || process.cwd();

    // Use SessionManager for session sync pattern
    const frontendConversationId = conversationId || uuidv4();
    const { sessionId, isNew: isNewSession } = await sessionManager.getOrCreateSession(
      frontendConversationId,
      'gemini',
      workspacePath
    );

    console.log(`[Gemini] Session resolved: ${sessionId} (new: ${isNewSession})`);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering

    // Send initial event
    res.write(`data: ${JSON.stringify({
      type: 'message_start',
      messageId: `user-${Date.now()}`,
      sessionId,
      engine: 'gemini'
    })}\n\n`);

    // Use optimized ContextBridge for token-aware context building
    // Note: Gemini has larger context window, uses preferSummary: false config
    const lastEngine = Message.getLastEngine(sessionId);
    const contextResult = await contextBridge.buildContext({
      sessionId,
      fromEngine: lastEngine,
      toEngine: 'gemini',
      userMessage: message
    });

    const promptWithContext = contextResult.prompt;
    const isEngineBridge = contextResult.isEngineBridge;

    console.log(`[Gemini] Context: ${contextResult.contextTokens} tokens from ${contextResult.contextSource}, total: ${contextResult.totalTokens}`);

    // Notify frontend about engine switch
    if (isEngineBridge) {
      res.write(`data: ${JSON.stringify({
        type: 'status',
        category: 'system',
        message: `Context bridged from ${lastEngine}`,
        icon: '🔄'
      })}\n\n`);
    }

    // Save user message to DB
    try {
      Message.create(
        sessionId,
        'user',
        message,
        { workspace: workspacePath, model },
        Date.now(),
        'gemini'
      );
    } catch (dbErr) {
      console.warn('[Gemini] Failed to save user message:', dbErr.message);
    }

    // Update session title if new chat
    if (isNewSession) {
      const title = sessionManager.extractTitle(message);
      sessionManager.updateSessionTitle(sessionId, title);
    }

    console.log('[Gemini] Calling Gemini CLI...');

    // Call Gemini wrapper with SSE streaming
    const result = await geminiWrapper.sendMessage({
      prompt: promptWithContext,
      sessionId,
      model,
      workspacePath,
      onStatus: (event) => {
        // Forward all events to SSE
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    console.log(`[Gemini] Response received: ${result.text?.length || 0} chars`);

    // Save assistant response to DB
    try {
      Message.create(
        sessionId,
        'assistant',
        result.text,
        { model, usage: result.usage },
        Date.now(),
        'gemini'
      );
    } catch (dbErr) {
      console.warn('[Gemini] Failed to save assistant message:', dbErr.message);
    }

    // Smart auto-summary: trigger based on message count and engine bridging
    if (contextBridge.shouldTriggerSummary(sessionId, isEngineBridge)) {
      contextBridge.triggerSummaryGeneration(sessionId, '[Gemini]');
    }

    // Send final message with full content
    res.write(`data: ${JSON.stringify({
      type: 'message_done',
      content: result.text,
      usage: result.usage,
      sessionId,
      conversationId: frontendConversationId,
      engine: 'gemini',
      model
    })}\n\n`);

    res.end();
    console.log('[Gemini] === REQUEST COMPLETE ===');

  } catch (error) {
    console.error('[Gemini] Error:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    } else {
      // Send error via SSE if headers already sent
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);
      res.end();
    }
  }
});

/**
 * GET /api/v1/gemini/status
 * Check if Gemini CLI is available
 */
router.get('/status', async (req, res) => {
  try {
    const isAvailable = await geminiWrapper.isAvailable();
    res.json({
      available: isAvailable,
      defaultModel: geminiWrapper.getDefaultModel(),
      models: geminiWrapper.getAvailableModels()
    });
  } catch (error) {
    console.error('[Gemini] Status check error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/v1/gemini/models
 * List available Gemini models
 */
router.get('/models', (req, res) => {
  res.json({
    models: geminiWrapper.getAvailableModels(),
    default: geminiWrapper.getDefaultModel()
  });
});

module.exports = router;
