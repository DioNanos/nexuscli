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

    // Set up SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'message_start', messageId: `user-${Date.now()}`, sessionId })}\n\n`);

    // Use optimized ContextBridge for token-aware context building
    // Note: Codex uses codeOnly mode for better code-focused context
    const lastEngine = Message.getLastEngine(sessionId);
    const contextResult = await contextBridge.buildContext({
      sessionId,
      fromEngine: lastEngine,
      toEngine: 'codex',
      userMessage: message
    });

    const promptWithContext = contextResult.prompt;
    const isEngineBridge = contextResult.isEngineBridge;

    console.log(`[Codex] Context: ${contextResult.contextTokens} tokens from ${contextResult.contextSource}, total: ${contextResult.totalTokens}`);

    // Notify frontend about engine switch
    if (isEngineBridge) {
      res.write(`data: ${JSON.stringify({
        type: 'status',
        category: 'engine_switch',
        message: `Continuing conversation from ${lastEngine}`
      })}\n\n`);
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

      // Call Codex wrapper with workspace path
      const result = await codexWrapper.sendMessage({
        prompt: promptWithContext,
        model,
        sessionId,
        reasoningEffort,
        workspacePath,
        onStatus: (event) => {
          // Stream status events to client
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      });

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
