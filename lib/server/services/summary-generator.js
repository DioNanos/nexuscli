const ClaudeWrapper = require('./claude-wrapper');
const { v4: uuidv4 } = require('uuid');
const { prepare, saveDb } = require('../db');

/**
 * SummaryGenerator - produce contextual summaries for sessions.
 *
 * Features:
 * - Generate AI titles for new conversations (uses Claude Haiku - fast & cheap)
 * - Generate contextual summaries for sessions
 * - Auto-save summaries to session_summaries table
 * - Support for summary-based context bridging
 */
class SummaryGenerator {
  constructor(options = {}) {
    this.claude = new ClaudeWrapper(options);
  }

  /**
   * Generate a short title for a new conversation (3-8 words)
   * Called after first AI response, runs in background
   * @param {string} userMessage - First user message
   * @param {string} assistantResponse - First AI response (optional, for context)
   * @returns {Promise<string>} Generated title
   */
  async generateTitle(userMessage, assistantResponse = '') {
    const startedAt = Date.now();

    // Keep context brief for fast generation
    const context = assistantResponse
      ? `User: ${userMessage.slice(0, 500)}\nAssistant: ${assistantResponse.slice(0, 500)}`
      : `User: ${userMessage.slice(0, 800)}`;

    const prompt = `Generate a brief title (3-8 words, no quotes) for this conversation:

${context}

Reply with ONLY the title, nothing else.`;

    try {
      const result = await this.claude.sendMessage({
        prompt,
        conversationId: uuidv4(), // Ephemeral session
        model: 'haiku',
        onStatus: () => {} // Silence status
      });

      // Clean up the response
      let title = result.text.trim()
        .replace(/^["']|["']$/g, '') // Remove surrounding quotes
        .replace(/^Title:\s*/i, '') // Remove "Title:" prefix
        .slice(0, 60); // Max 60 chars

      console.log(`[SummaryGenerator] Title generated in ${Date.now() - startedAt}ms: ${title}`);
      return title || 'New Chat';
    } catch (error) {
      console.error('[SummaryGenerator] Title generation failed:', error.message);
      // Fallback to truncated first message
      return userMessage.slice(0, 50).trim() + (userMessage.length > 50 ? '...' : '');
    }
  }

  /**
   * Generate or refresh summary for a session.
   * @param {Object} params
   * @param {string} params.sessionId
   * @param {Array} params.messages - Array of {role, content, created_at}
   * @param {Object|null} params.existingSummary
   * @returns {Promise<Object>} summary payload
   */
  async generateSummary({ sessionId, messages = [], existingSummary = null }) {
    if (!sessionId) throw new Error('sessionId is required');

    const startedAt = Date.now();

    // Build transcript snippet (limit to 40 latest messages for brevity)
    const transcript = this.buildTranscript(messages.slice(-40));

    const prompt = this.buildPrompt({ sessionId, transcript, existingSummary });

    const result = await this.claude.sendMessage({
      prompt,
      conversationId: uuidv4(), // Ephemeral session (Claude CLI requires valid UUID)
      model: 'haiku',
      onStatus: () => {} // silence status for summaries
    });

    const parsed = this.safeParseJson(result.text);

    console.log(`[SummaryGenerator] Summary for ${sessionId} took ${Date.now() - startedAt}ms`);

    return parsed;
  }

  /**
   * Save summary to database
   * @param {string} sessionId
   * @param {Object} summary - {summary_short, summary_long, key_decisions, tools_used, files_modified}
   * @returns {boolean} Success
   */
  saveSummary(sessionId, summary) {
    try {
      const stmt = prepare(`
        INSERT OR REPLACE INTO session_summaries
        (session_id, summary_short, summary_long, key_decisions, tools_used, files_modified, updated_at, version)
        VALUES (?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT version FROM session_summaries WHERE session_id = ?), 0) + 1)
      `);

      stmt.run(
        sessionId,
        summary.summary_short || '',
        summary.summary_long || null,
        JSON.stringify(summary.key_decisions || []),
        JSON.stringify(summary.tools_used || []),
        JSON.stringify(summary.files_modified || []),
        Date.now(),
        sessionId
      );

      saveDb();
      console.log(`[SummaryGenerator] Saved summary for ${sessionId}`);
      return true;
    } catch (error) {
      console.error(`[SummaryGenerator] Failed to save summary:`, error.message);
      return false;
    }
  }

  /**
   * Get existing summary from database
   * @param {string} sessionId
   * @returns {Object|null}
   */
  getSummary(sessionId) {
    try {
      const stmt = prepare('SELECT * FROM session_summaries WHERE session_id = ?');
      const row = stmt.get(sessionId);

      if (!row) return null;

      return {
        summary_short: row.summary_short,
        summary_long: row.summary_long,
        key_decisions: JSON.parse(row.key_decisions || '[]'),
        tools_used: JSON.parse(row.tools_used || '[]'),
        files_modified: JSON.parse(row.files_modified || '[]'),
        updated_at: row.updated_at,
        version: row.version
      };
    } catch (error) {
      console.warn(`[SummaryGenerator] Failed to get summary:`, error.message);
      return null;
    }
  }

  /**
   * Generate summary and save to DB (convenience method)
   * @param {string} sessionId
   * @param {Array} messages
   * @returns {Promise<Object|null>}
   */
  async generateAndSave(sessionId, messages) {
    try {
      const existingSummary = this.getSummary(sessionId);
      const summary = await this.generateSummary({ sessionId, messages, existingSummary });
      this.saveSummary(sessionId, summary);
      return summary;
    } catch (error) {
      console.error(`[SummaryGenerator] generateAndSave failed:`, error.message);
      return null;
    }
  }

  /**
   * Get summary text for context bridging
   * Returns a formatted string suitable for prefixing prompts
   * @param {string} sessionId
   * @returns {string|null}
   */
  getBridgeContext(sessionId) {
    const summary = this.getSummary(sessionId);
    if (!summary || !summary.summary_short) return null;

    let context = `[Session Summary]\n${summary.summary_short}`;

    if (summary.key_decisions && summary.key_decisions.length > 0) {
      context += `\n\nKey decisions:\n- ${summary.key_decisions.slice(0, 5).join('\n- ')}`;
    }

    if (summary.files_modified && summary.files_modified.length > 0) {
      context += `\n\nFiles worked on:\n- ${summary.files_modified.slice(0, 10).join('\n- ')}`;
    }

    return context;
  }

  buildTranscript(messages) {
    return messages
      .map(m => {
        const role = m.role || 'assistant';
        const content = (m.content || '').trim();
        const ts = m.created_at ? new Date(m.created_at).toISOString() : '';
        return `[${ts}] ${role.toUpperCase()}: ${content}`;
      })
      .join('\n')
      .slice(-6000); // keep prompt size reasonable
  }

  buildPrompt({ sessionId, transcript, existingSummary }) {
    const existing = existingSummary
      ? `Existing summary (for refresh): ${JSON.stringify(existingSummary)}`
      : 'No existing summary.';

    return `
You are a concise assistant. Summarize the coding/chat session into JSON.
Session ID: ${sessionId}

${existing}

Provide JSON with keys:
- summary_short (<=80 words)
- summary_long (<=200 words)
- key_decisions (array of short bullet strings)
- tools_used (array of tool names or commands)
- files_modified (array of file paths)

Do not include any extra text outside valid JSON.

Transcript:
${transcript}
`;
  }

  safeParseJson(text) {
    // Try to extract JSON block
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start === -1 || end === -1) {
      throw new Error('Failed to parse summary JSON');
    }

    const jsonString = text.slice(start, end + 1);

    try {
      const parsed = JSON.parse(jsonString);
      // Normalize array fields
      ['key_decisions', 'tools_used', 'files_modified'].forEach(key => {
        if (parsed[key] && !Array.isArray(parsed[key])) {
          parsed[key] = [parsed[key]].filter(Boolean);
        }
      });
      return parsed;
    } catch (e) {
      throw new Error('Invalid JSON returned by model');
    }
  }
}

module.exports = SummaryGenerator;
