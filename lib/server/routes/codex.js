const express = require('express');
const CodexWrapper = require('../services/codex-wrapper');
const Message = require('../models/Message');
const { prepare } = require('../db');
const { v4: uuidv4 } = require('uuid');
const sessionManager = require('../services/session-manager');
const contextBridge = require('../services/context-bridge');

const router = express.Router();
const codexWrapper = new CodexWrapper();

/**
 * POST /api/v1/codex
 * Send message to Codex CLI with SSE streaming
 *
 * Request body:
 * {
 *   "conversationId": "uuid" (optional for new chat)
 *   "message": "user prompt",
 *   "model": "gpt-5.1-codex-max" (optional),
 *   "reasoningEffort": "medium" (optional: low, medium, high, xhigh)
 *   "workspace": "/path" (optional for new chat)
 * }
 *
 * Response: SSE stream
 * - Status events (tool use, reasoning)
 * - Final message text and threadId
 */
router.post('/', async (req, res) => {
  try {
    console.log('[Codex] === NEW CODEX REQUEST ===');
    console.log('[Codex] Body:', JSON.stringify(req.body, null, 2));

    const { conversationId, message, model = 'gpt-5.1-codex-max', reasoningEffort, workspace } = req.body;

    console.log(`[Codex] conversationId: ${conversationId}`);
    console.log(`[Codex] message: ${message?.substring(0, 100)}`);
    console.log(`[Codex] model: ${model}`);
    console.log(`[Codex] reasoningEffort: ${reasoningEffort}`);
    console.log(`[Codex] workspace: ${workspace}`);

    if (!message) {
      console.log('[Codex] ERROR: message required');
      return res.status(400).json({ error: 'message required' });
    }

    // Check if Codex CLI is available
    const isAvailable = await codexWrapper.isAvailable();
    if (!isAvailable) {
      return res.status(503).json({ error: 'Codex CLI not available' });
    }

    const hasExec = await codexWrapper.hasExecSupport();
    if (!hasExec) {
      return res.status(503).json({ error: 'Codex CLI does not support exec subcommand. Please update to 0.62.1+' });
    }

    // Resolve workspace path
    const workspacePath = workspace || process.cwd();

    // Use SessionManager for session sync pattern
    // conversationId → sessionId (per engine)
    const frontendConversationId = conversationId || uuidv4();
    const { sessionId, isNew: isNewSession } = await sessionManager.getOrCreateSession(
      frontendConversationId,
      'codex',
      workspacePath
    );

    console.log(`[Codex] Session resolved: ${sessionId} (new: ${isNewSession})`);
    const isNewChat = isNewSession;

    // Get native Codex threadId for session resume (if exists)
    const nativeThreadId = isNewSession ? null : sessionManager.getNativeThreadId(sessionId);
    console.log(`[Codex] Native threadId: ${nativeThreadId || '(new thread)'}`);

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'message_start', messageId: `user-${Date.now()}`, sessionId })}\n\n`);

    // Check if this is an engine switch (requires context bridging)
    const lastEngine = Message.getLastEngine(sessionId);
    const isEngineBridge = lastEngine && lastEngine !== 'codex';

    // IMPORTANT: Skip contextBridge for Codex native resume!
    // When Codex uses `exec resume <threadId>`, it loads full history from native thread.
    // ContextBridge is ONLY needed for engine switches.
    let promptToSend = message;

    if (isEngineBridge) {
      // Engine switch: need context from previous engine
      const contextResult = await contextBridge.buildContext({
        sessionId,
        fromEngine: lastEngine,
        toEngine: 'codex',
        userMessage: message
      });
      promptToSend = contextResult.prompt;
      console.log(`[Codex] Engine bridge: ${contextResult.contextTokens} tokens from ${lastEngine}`);

      res.write(`data: ${JSON.stringify({
        type: 'status',
        category: 'engine_switch',
        message: `Continuing conversation from ${lastEngine}`
      })}\n\n`);
    } else if (nativeThreadId) {
      // Native resume: Codex will load history from thread
      console.log(`[Codex] Native resume: Codex will use threadId ${nativeThreadId}`);
    } else {
      // New session: no context needed
      console.log(`[Codex] New session: starting fresh`);
    }

    try {
      // Save user message to database with engine tracking
      try {
        const userMessage = Message.create(
          sessionId,
          'user',
          message,
          { workspace: workspacePath },
          Date.now(),
          'codex'  // Engine tracking for context bridging
        );
        console.log(`[Codex] Saved user message: ${userMessage.id} (engine: codex)`);
      } catch (msgErr) {
        console.warn('[Codex] Failed to save user message:', msgErr.message);
      }

      // Call Codex wrapper with native threadId for session resume
      const result = await codexWrapper.sendMessage({
        prompt: promptToSend,
        model,
        threadId: nativeThreadId, // Native Codex thread ID for resume
        reasoningEffort,
        workspacePath,
        onStatus: (event) => {
          // Stream status events to client
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

      // Save native threadId for future resume (if new)
      if (result.threadId && result.threadId !== nativeThreadId) {
        sessionManager.setNativeThreadId(sessionId, result.threadId);
      }

      // Save assistant response to database with engine tracking
      try {
        const assistantMessage = Message.create(
          sessionId,
          'assistant',
          result.text,
          { usage: result.usage, model },
          Date.now(),
          'codex'  // Engine tracking for context bridging
        );
        console.log(`[Codex] Saved assistant message: ${assistantMessage.id} (engine: codex)`);
      } catch (msgErr) {
        console.warn('[Codex] Failed to save assistant message:', msgErr.message);
      }

      // Smart auto-summary: trigger based on message count and engine bridging
      if (contextBridge.shouldTriggerSummary(sessionId, isEngineBridge)) {
        contextBridge.triggerSummaryGeneration(sessionId, '[Codex]');
      }

      // Send completion event
      res.write(`data: ${JSON.stringify({
        type: 'message_done',
        messageId: `assistant-${Date.now()}`,
        content: result.text,
        usage: result.usage,
        sessionId
      })}\n\n`);

      res.end();

    } catch (error) {
      console.error('[Codex] Error:', error);

      // Send error event
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message
      })}\n\n`);

      res.end();
    }

  } catch (error) {
    console.error('[Codex] Request error:', error);

    if (!res.headersSent) {
      res.status(500).json({ error: error.message });
    }
  }
});

/**
 * GET /api/v1/codex/status
 * Check Codex CLI availability
 */
router.get('/status', async (req, res) => {
  try {
    const isAvailable = await codexWrapper.isAvailable();
    const hasExec = isAvailable ? await codexWrapper.hasExecSupport() : false;

    res.json({
      available: isAvailable,
      execSupport: hasExec,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
