/**
 * ContextBridge - Unified context management with token optimization
 *
 * Features:
 * - Token-aware context truncation
 * - Engine-specific context compression
 * - Auto-summary triggering
 * - Unified bridging logic for all engines
 */

const Message = require('../models/Message');
const SummaryGenerator = require('./summary-generator');

// Token estimation constants (approximate)
const CHARS_PER_TOKEN = 4; // GPT/Claude average
const DEFAULT_MAX_TOKENS = 4000; // Context budget for bridging
const SUMMARY_TRIGGER_THRESHOLD = 15; // Messages before auto-summary

// Engine-specific context limits
const ENGINE_LIMITS = {
  'claude': { maxTokens: 4000, preferSummary: true },
  'codex': { maxTokens: 3000, preferSummary: true, codeOnly: true },
  'deepseek': { maxTokens: 3000, preferSummary: true },
  'gemini': { maxTokens: 6000, preferSummary: false } // Gemini has large context
};

class ContextBridge {
  constructor() {
    this.summaryGenerator = new SummaryGenerator();
  }

  /**
   * Estimate token count for text
   * @param {string} text - Text to estimate
   * @returns {number} Estimated token count
   */
  estimateTokens(text) {
    if (!text) return 0;
    // Simple estimation: ~4 chars per token for English/code
    // More accurate would use tiktoken, but this is faster
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }

  /**
   * Get engine-specific configuration
   * @param {string} engine - Engine name
   * @returns {Object} Engine config
   */
  getEngineConfig(engine) {
    return ENGINE_LIMITS[engine] || ENGINE_LIMITS['claude'];
  }

  /**
   * Build optimized context for engine switch
   * @param {Object} params
   * @param {string} params.sessionId - Session ID
   * @param {string} params.fromEngine - Previous engine
   * @param {string} params.toEngine - Target engine
   * @param {string} params.userMessage - Current user message
   * @returns {Object} { prompt, isEngineBridge, contextTokens }
   */
  async buildContext({ sessionId, fromEngine, toEngine, userMessage }) {
    const config = this.getEngineConfig(toEngine);
    const isEngineBridge = fromEngine && fromEngine !== toEngine;

    // Reserve tokens for user message
    const userTokens = this.estimateTokens(userMessage);
    const availableTokens = config.maxTokens - userTokens - 200; // 200 token buffer

    let contextText = '';
    let contextTokens = 0;
    let contextSource = 'none';

    // Try summary first (most efficient)
    if (config.preferSummary) {
      const summaryContext = this.summaryGenerator.getBridgeContext(sessionId);
      if (summaryContext) {
        const summaryTokens = this.estimateTokens(summaryContext);
        if (summaryTokens <= availableTokens) {
          contextText = summaryContext;
          contextTokens = summaryTokens;
          contextSource = 'summary';
        }
      }
    }

    // Fallback to token-aware message history
    if (!contextText && availableTokens > 200) {
      const historyContext = this.buildTokenAwareHistory(sessionId, availableTokens, config);
      if (historyContext.text) {
        contextText = historyContext.text;
        contextTokens = historyContext.tokens;
        contextSource = 'history';
      }
    }

    // Build final prompt
    let prompt = userMessage;

    if (contextText) {
      if (isEngineBridge) {
        prompt = `${contextText}\n\n[Switching from ${fromEngine} to ${toEngine}]\n\nUser message:\n${userMessage}`;
      } else {
        prompt = `${contextText}\n\nUser message:\n${userMessage}`;
      }
    }

    console.log(`[ContextBridge] Built context: ${contextTokens} tokens from ${contextSource}, bridge: ${isEngineBridge}`);

    return {
      prompt,
      isEngineBridge,
      contextTokens,
      contextSource,
      totalTokens: contextTokens + userTokens
    };
  }

  /**
   * Build token-aware history context
   * @param {string} sessionId - Session ID
   * @param {number} maxTokens - Token budget
   * @param {Object} config - Engine config
   * @returns {Object} { text, tokens, messageCount }
   */
  buildTokenAwareHistory(sessionId, maxTokens, config = {}) {
    // Get more messages than we need, we'll trim
    const messages = Message.getContextMessages(sessionId, 20);

    if (messages.length === 0) {
      return { text: '', tokens: 0, messageCount: 0 };
    }

    const lines = [];
    let tokenCount = 0;
    let includedCount = 0;

    // Process from newest to oldest (we got them in chronological order, reverse)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // For code-focused engines, filter out non-code content
      let content = msg.content;
      if (config.codeOnly) {
        content = this.extractCodeContent(content);
        if (!content) continue; // Skip if no code
      }

      // Truncate long messages
      if (content.length > 2000) {
        content = content.substring(0, 2000) + '...';
      }

      const role = msg.role === 'user' ? 'User' : 'Assistant';
      const engineTag = msg.engine ? ` [${msg.engine}]` : '';
      const line = `${role}${engineTag}: ${content}`;

      const lineTokens = this.estimateTokens(line);

      // Check if adding this would exceed budget
      if (tokenCount + lineTokens > maxTokens) {
        break;
      }

      lines.unshift(line); // Add to beginning (chronological)
      tokenCount += lineTokens;
      includedCount++;
    }

    if (lines.length === 0) {
      return { text: '', tokens: 0, messageCount: 0 };
    }

    const text = `[Context from recent messages]\n${lines.join('\n\n')}`;

    return {
      text,
      tokens: tokenCount,
      messageCount: includedCount
    };
  }

  /**
   * Extract code blocks and technical content from text
   * @param {string} text - Full text
   * @returns {string} Code-focused content
   */
  extractCodeContent(text) {
    if (!text) return '';

    // Extract code blocks
    const codeBlocks = [];
    const codeBlockRegex = /```[\s\S]*?```/g;
    let match;

    while ((match = codeBlockRegex.exec(text)) !== null) {
      codeBlocks.push(match[0]);
    }

    if (codeBlocks.length > 0) {
      return codeBlocks.join('\n\n');
    }

    // If no code blocks, check if text contains technical content
    const technicalPatterns = [
      /function\s+\w+/,
      /const\s+\w+\s*=/,
      /class\s+\w+/,
      /import\s+.*from/,
      /require\s*\(/,
      /\/\/|\/\*|\*\//,
      /\.(js|ts|py|java|cpp|go|rs)\b/,
      /npm|git|docker|curl/
    ];

    for (const pattern of technicalPatterns) {
      if (pattern.test(text)) {
        return text;
      }
    }

    return ''; // Not code-relevant
  }

  /**
   * Check if auto-summary should be triggered
   * @param {string} sessionId - Session ID
   * @param {boolean} isEngineBridge - Was this an engine switch
   * @returns {boolean} Should generate summary
   */
  shouldTriggerSummary(sessionId, isEngineBridge = false) {
    // Always trigger on engine bridge
    if (isEngineBridge) return true;

    const messageCount = Message.countByConversation(sessionId);

    // Trigger every 10 messages after threshold
    if (messageCount >= SUMMARY_TRIGGER_THRESHOLD && messageCount % 10 === 0) {
      return true;
    }

    // Check if we have a stale summary (older than 20 messages)
    const existingSummary = this.summaryGenerator.getSummary(sessionId);
    if (!existingSummary && messageCount > SUMMARY_TRIGGER_THRESHOLD) {
      return true;
    }

    return false;
  }

  /**
   * Trigger summary generation (async, non-blocking)
   * @param {string} sessionId - Session ID
   * @param {string} logPrefix - Log prefix for debugging
   */
  triggerSummaryGeneration(sessionId, logPrefix = '[ContextBridge]') {
    const messages = Message.getByConversation(sessionId, 40);

    this.summaryGenerator.generateAndSave(sessionId, messages)
      .then(summary => {
        if (summary) {
          console.log(`${logPrefix} Summary updated: ${summary.summary_short?.substring(0, 50)}...`);
        }
      })
      .catch(err => {
        console.warn(`${logPrefix} Summary generation failed:`, err.message);
      });
  }

  /**
   * Get context stats for debugging
   * @param {string} sessionId - Session ID
   * @returns {Object} Stats
   */
  getContextStats(sessionId) {
    const messageCount = Message.countByConversation(sessionId);
    const lastEngine = Message.getLastEngine(sessionId);
    const hasSummary = !!this.summaryGenerator.getSummary(sessionId);

    return {
      messageCount,
      lastEngine,
      hasSummary,
      summaryThreshold: SUMMARY_TRIGGER_THRESHOLD
    };
  }
}

module.exports = new ContextBridge();
