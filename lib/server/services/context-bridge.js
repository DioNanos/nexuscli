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
  'gemini': { maxTokens: 6000, preferSummary: false }, // Gemini has large context
  'qwen': { maxTokens: 6000, preferSummary: false } // Qwen Coder large context
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
   * @param {string} params.conversationId - Stable conversation ID (cross-engine)
   * @param {string} params.sessionId - Legacy session ID (fallback)
   * @param {string} params.fromEngine - Previous engine
   * @param {string} params.toEngine - Target engine
   * @param {string} params.userMessage - Current user message
   * @returns {Object} { prompt, isEngineBridge, contextTokens }
   */
  async buildContext({ conversationId, sessionId, fromEngine, toEngine, userMessage }) {
    const config = this.getEngineConfig(toEngine);
    const isEngineBridge = fromEngine && fromEngine !== toEngine;
    const convoId = conversationId || sessionId; // backward compat

    // Reserve tokens for user message
    const userTokens = this.estimateTokens(userMessage);
    const availableTokens = Math.max(0, config.maxTokens - userTokens - 200); // 200 token buffer, never negative

    let contextText = '';
    let contextTokens = 0;
    let contextSource = 'none';

    // For engine bridge, use structured handoff template
    if (isEngineBridge) {
      const handoffContext = this.buildEngineHandoffContext(convoId, fromEngine, toEngine, availableTokens, config);
      if (handoffContext.text) {
        contextText = handoffContext.text;
        contextTokens = handoffContext.tokens;
        contextSource = handoffContext.source;
      }
      // If handoff couldn't fit, fall back to history-only context
      if (!contextText && availableTokens > 200) {
        const historyContext = this.buildTokenAwareHistory(convoId, availableTokens, config);
        if (historyContext.text) {
          contextText = historyContext.text;
          contextTokens = historyContext.tokens;
          contextSource = 'history_fallback';
        }
      }
    } else {
      // Try summary first (most efficient)
      if (config.preferSummary) {
        const summaryContext = this.summaryGenerator.getBridgeContext(convoId);
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
        const historyContext = this.buildTokenAwareHistory(convoId, availableTokens, config);
        if (historyContext.text) {
          contextText = historyContext.text;
          contextTokens = historyContext.tokens;
          contextSource = 'history';
        }
      }
    }

    // Build final prompt
    let prompt = userMessage;

    if (availableTokens === 0) {
      console.log(`[ContextBridge] Budget exhausted before context; sending raw message (engine=${toEngine})`);
    }

    if (contextText) {
      prompt = `${contextText}\n\n${userMessage}`;
    }

    console.log(`[ContextBridge] Built context: ${contextTokens} tokens from ${contextSource}, bridge: ${isEngineBridge}, avail=${availableTokens}, total=${contextTokens + userTokens}`);

    return {
      prompt,
      isEngineBridge,
      contextTokens,
      contextSource,
      totalTokens: contextTokens + userTokens
    };
  }

  /**
   * Build structured context for engine handoff
   * Uses a clear template that helps the new engine understand previous context
   * @param {string} conversationId
   * @param {string} fromEngine
   * @param {string} toEngine
   * @param {number} maxTokens
   * @param {Object} config
   * @returns {Object} { text, tokens, source }
   */
  buildEngineHandoffContext(conversationId, fromEngine, toEngine, maxTokens, config = {}) {
    const engineNames = {
      'claude': 'Claude Code (Anthropic)',
      'codex': 'Codex (OpenAI)',
      'gemini': 'Gemini (Google)',
      'deepseek': 'DeepSeek',
      'qwen': 'Qwen Code (Alibaba)'
    };

    const fromName = engineNames[fromEngine] || fromEngine;
    const toName = engineNames[toEngine] || toEngine;

    // Get summary if available
    const summary = this.summaryGenerator.getSummary(conversationId);

    // Get recent messages (last 5)
    const messages = Message.getContextMessages(conversationId, 5);
    const messageCount = Message.countByConversation(conversationId);

    // Build structured template
    const sections = [];

    // Header
    sections.push(`<previous_session_context engine="${fromEngine}" total_messages="${messageCount}">`);
    sections.push(`This conversation was previously handled by ${fromName}.`);
    sections.push(`You are now continuing as ${toName}.`);
    sections.push('');

    // Summary section (if available)
    if (summary && summary.summary_short) {
      sections.push('## Summary');
      sections.push(summary.summary_short);
      sections.push('');

      // Key decisions
      if (summary.key_decisions && summary.key_decisions.length > 0) {
        sections.push('## Key Decisions');
        summary.key_decisions.slice(0, 5).forEach(d => sections.push(`- ${d}`));
        sections.push('');
      }

      // Files modified
      if (summary.files_modified && summary.files_modified.length > 0) {
        sections.push('## Files Modified');
        summary.files_modified.slice(0, 10).forEach(f => sections.push(`- ${f}`));
        sections.push('');
      }
    }

    // Recent messages (always include for continuity)
    if (messages.length > 0) {
      sections.push('## Recent Messages');
      for (const msg of messages) {
        const role = msg.role === 'user' ? 'User' : 'Assistant';
        const engine = msg.engine ? ` [${msg.engine}]` : '';
        // Truncate long messages
        let content = msg.content || '';
        if (content.length > 500) {
          content = content.substring(0, 500) + '...';
        }
        sections.push(`${role}${engine}: ${content}`);
        sections.push('');
      }
    }

    sections.push('</previous_session_context>');
    sections.push('');
    sections.push('Continue assisting with the following request:');

    const text = sections.join('\n');
    const tokens = this.estimateTokens(text);

    // Check token budget
    if (tokens > maxTokens) {
      // Fallback to simpler context if too long
      console.log(`[ContextBridge] Handoff template too long (${tokens} > ${maxTokens}), using fallback`);
      const fallback = this.buildTokenAwareHistory(conversationId, maxTokens, config);
      return {
        text: fallback.text,
        tokens: fallback.tokens,
        source: 'handoff_fallback_history'
      };
    }

    return {
      text,
      tokens,
      source: summary ? 'handoff+summary' : 'handoff+history'
    };
  }

  /**
   * Build token-aware history context
   * @param {string} sessionId - Session ID
   * @param {number} maxTokens - Token budget
   * @param {Object} config - Engine config
   * @returns {Object} { text, tokens, messageCount }
   */
  buildTokenAwareHistory(conversationId, maxTokens, config = {}) {
    // Get more messages than we need, we'll trim
    const messages = Message.getContextMessages(conversationId, 20);

    if (messages.length === 0) {
      return { text: '', tokens: 0, messageCount: 0 };
    }

    const lines = [];
    let tokenCount = 0;
    let includedCount = 0;

    // Process from newest to oldest (we got them in chronological order, reverse)
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];

      // For code-focused engines, compress assistant responses to code only
      // BUT always keep user messages for context continuity
      let content = msg.content;
      if (config.codeOnly && msg.role === 'assistant') {
        const codeContent = this.extractCodeContent(content);
        // Only use code-only if there's actual code, otherwise keep truncated original
        content = codeContent || (content.length > 500 ? content.substring(0, 500) + '...' : content);
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
  shouldTriggerSummary(conversationId, isEngineBridge = false) {
    // Always trigger on engine bridge
    if (isEngineBridge) return true;

    const messageCount = Message.countByConversation(conversationId);

    // Trigger every 10 messages after threshold
    if (messageCount >= SUMMARY_TRIGGER_THRESHOLD && messageCount % 10 === 0) {
      return true;
    }

    // Check if we have a stale summary (older than 20 messages)
    const existingSummary = this.summaryGenerator.getSummary(conversationId);
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
  triggerSummaryGeneration(conversationId, logPrefix = '[ContextBridge]') {
    const messages = Message.getByConversation(conversationId, 40);

    this.summaryGenerator.generateAndSave(conversationId, messages)
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
  getContextStats(conversationId) {
    const messageCount = Message.countByConversation(conversationId);
    const lastEngine = Message.getLastEngine(conversationId);
    const hasSummary = !!this.summaryGenerator.getSummary(conversationId);

    return {
      messageCount,
      lastEngine,
      hasSummary,
      summaryThreshold: SUMMARY_TRIGGER_THRESHOLD
    };
  }
}

module.exports = new ContextBridge();
