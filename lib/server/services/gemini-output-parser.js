/**
 * GeminiOutputParser - Parse Gemini CLI JSON stream output
 *
 * Parses `gemini -o stream-json` output format.
 *
 * JSON Event Types from Gemini CLI:
 * - init: Session initialization { type: 'init', session_id, model }
 * - message: Response content { type: 'message', role: 'assistant', content, delta: true }
 * - tool_use: Tool invocation { type: 'tool_use', tool, input }
 * - tool_result: Tool output { type: 'tool_result', tool, output, status }
 * - result: Final stats { type: 'result', status, stats: { input_tokens, output_tokens } }
 * - error: Error event { type: 'error', message }
 *
 * Emits normalized events for SSE streaming:
 * - status: { type: 'status', category: 'tool'|'system', message, icon }
 * - response_chunk: { type: 'response_chunk', text, isIncremental }
 * - response_done: { type: 'response_done', fullText }
 * - done: { type: 'done', usage, status }
 * - error: { type: 'error', message }
 *
 * @version 0.4.0 - TRI CLI Support
 */

class GeminiOutputParser {
  constructor() {
    this.buffer = '';
    this.finalResponse = '';
    this.usage = null;
    this.sessionId = null;
    this.model = null;
    this.pendingTools = new Map();
  }

  /**
   * Parse a chunk of stdout (may contain multiple JSON lines)
   * @param {string} chunk - Raw stdout chunk from node-pty
   * @returns {Array} Array of normalized event objects for SSE
   */
  parse(chunk) {
    const events = [];

    // Add chunk to buffer
    this.buffer += chunk;

    // Process complete lines
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || ''; // Keep incomplete last line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip non-JSON lines (CLI status messages, retry messages, etc.)
      if (!trimmed.startsWith('{')) {
        // Log significant non-JSON messages
        if (trimmed.includes('Attempt') || trimmed.includes('failed') || trimmed.includes('Error')) {
          console.log('[GeminiOutputParser] CLI message:', trimmed.substring(0, 100));
        }
        continue;
      }

      try {
        const json = JSON.parse(trimmed);
        const lineEvents = this._parseJsonEvent(json);
        events.push(...lineEvents);
      } catch (e) {
        console.warn('[GeminiOutputParser] JSON parse error:', e.message, '- Line:', trimmed.substring(0, 80));
      }
    }

    return events;
  }

  /**
   * Parse a single JSON event from Gemini CLI
   * @param {Object} event - Parsed JSON object
   * @returns {Array} Events to emit
   */
  _parseJsonEvent(event) {
    const events = [];

    switch (event.type) {
      case 'init':
        // Session initialization
        this.sessionId = event.session_id;
        this.model = event.model;
        console.log('[GeminiOutputParser] Session initialized:', this.sessionId, 'Model:', this.model);
        events.push({
          type: 'status',
          category: 'system',
          message: 'Session initialized',
          icon: '🚀',
          sessionId: this.sessionId,
          model: this.model,
          timestamp: event.timestamp || new Date().toISOString(),
        });
        break;

      case 'message':
        if (event.role === 'assistant' || event.role === 'model') {
          // Assistant response - streaming content
          const content = event.content || '';
          if (content) {
            // Accumulate response
            if (event.delta) {
              // Delta mode - append to existing
              this.finalResponse += content;
            } else {
              // Full replacement (rare)
              this.finalResponse = content;
            }

            events.push({
              type: 'response_chunk',
              text: content,
              isIncremental: !!event.delta,
            });
          }
        }
        break;

      case 'tool_use':
        // Tool being invoked
        const toolEvent = this._formatToolUseEvent(event);
        events.push(toolEvent);
        this.pendingTools.set(event.tool_id || event.tool_use_id || event.tool_name, event);
        break;

      case 'tool_result':
        // Tool execution completed
        // Gemini CLI uses 'tool_name'
        const toolName = event.tool_name || event.tool || 'Tool';
        const success = event.status !== 'error' && event.status !== 'failure';

        events.push({
          type: 'status',
          category: 'tool',
          message: `${toolName}: ${success ? 'completed' : 'failed'}`,
          icon: success ? '✅' : '❌',
          toolOutput: this._truncateOutput(event.output || event.result),
          timestamp: event.timestamp || new Date().toISOString(),
        });

        this.pendingTools.delete(event.tool_use_id || event.tool);
        break;

      case 'result':
        // Final result with stats
        this.usage = event.stats || null;
        console.log('[GeminiOutputParser] Result received, status:', event.status, 'stats:', JSON.stringify(this.usage));

        // Emit response_done
        events.push({
          type: 'response_done',
          fullText: this.finalResponse,
        });

        // Emit done with usage stats
        events.push({
          type: 'done',
          status: event.status,
          usage: {
            prompt_tokens: this.usage?.input_tokens || 0,
            completion_tokens: this.usage?.output_tokens || 0,
            total_tokens: (this.usage?.input_tokens || 0) + (this.usage?.output_tokens || 0),
          },
          duration_ms: this.usage?.duration_ms || 0,
          tool_calls: this.usage?.tool_calls || 0,
          sessionId: this.sessionId,
        });
        break;

      case 'error':
        console.error('[GeminiOutputParser] Error event:', event.message || event.error);
        events.push({
          type: 'error',
          message: event.message || event.error || 'Unknown error',
        });
        break;

      default:
        // Unknown event type - log but don't fail
        console.log('[GeminiOutputParser] Unknown event type:', event.type);
    }

    return events;
  }

  /**
   * Format a tool_use event into a status event
   */
  _formatToolUseEvent(event) {
    // Extract tool name from various possible fields
    // Gemini CLI uses 'tool_name' and 'parameters'
    const tool = event.tool_name || event.tool || event.name || event.function?.name || '';
    const input = event.parameters || event.input || event.args || event.function?.arguments || {};
    let message = tool || 'Tool';

    // Debug: log raw event to understand structure
    if (!tool) {
      console.log('[GeminiOutputParser] Tool event without name:', JSON.stringify(event).substring(0, 200));
    }

    // Format message based on tool type
    switch (tool) {
      case 'shell':
      case 'run_shell_command':
      case 'execute_command':
        message = `Shell: ${this._truncate(event.command || input.command || '', 60)}`;
        break;
      case 'read_file':
      case 'read_many_files':
      case 'read':
        message = `Reading: ${this._truncate(event.path || input.path || input.file_path || '', 50)}`;
        break;
      case 'write_file':
      case 'write':
        message = `Writing: ${this._truncate(event.path || input.path || input.file_path || '', 50)}`;
        break;
      case 'edit_file':
      case 'edit':
        message = `Editing: ${this._truncate(event.path || input.path || input.file_path || '', 50)}`;
        break;
      case 'search_files':
      case 'grep':
      case 'find_files':
        message = `Searching: ${this._truncate(event.pattern || input.pattern || input.query || '', 40)}`;
        break;
      case 'list_directory':
      case 'list_dir':
      case 'ls':
        message = `Listing: ${this._truncate(event.path || input.path || input.dir_path || '.', 50)}`;
        break;
      case 'web_search':
      case 'google_search':
      case 'search':
        message = `Web search: ${this._truncate(event.query || input.query || '', 40)}`;
        break;
      case 'web_fetch':
      case 'fetch_url':
        message = `Fetching: ${this._truncate(event.url || input.url || '', 50)}`;
        break;
      default:
        // For unknown tools, try to create a meaningful message
        if (tool) {
          message = `${tool}: running...`;
        } else {
          // Try to extract any useful info from the event
          const keys = Object.keys(event).filter(k => !['type', 'timestamp', 'tool_use_id'].includes(k));
          if (keys.length > 0) {
            message = `Tool: ${keys[0]}...`;
          } else {
            message = 'Tool: running...';
          }
        }
    }

    return {
      type: 'status',
      category: 'tool',
      message,
      icon: this._getToolIcon(tool),
      timestamp: event.timestamp || new Date().toISOString(),
    };
  }

  /**
   * Get emoji icon for tool type
   */
  _getToolIcon(tool) {
    const icons = {
      // Shell commands
      'shell': '🔧',
      'run_shell_command': '🔧',
      'execute_command': '🔧',
      // File operations
      'read_file': '📖',
      'read_many_files': '📚',
      'read': '📖',
      'write_file': '✍️',
      'write': '✍️',
      'edit_file': '📝',
      'edit': '📝',
      // Search
      'search_files': '🔍',
      'grep': '🔍',
      'find_files': '🔍',
      // Directory
      'list_directory': '🗂️',
      'list_dir': '🗂️',
      'ls': '🗂️',
      // Web
      'web_search': '🔎',
      'google_search': '🔎',
      'search': '🔎',
      'web_fetch': '🌐',
      'fetch_url': '🌐',
    };
    return icons[tool] || '⚙️';
  }

  /**
   * Truncate string to max length
   */
  _truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
  }

  /**
   * Truncate tool output (can be very long)
   */
  _truncateOutput(content) {
    if (!content) return null;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    if (str.length > 500) {
      return str.substring(0, 500) + '\n... (truncated)';
    }
    return str;
  }

  /**
   * Filter out internal "thinking" patterns from model output
   * Common in preview models that expose chain-of-thought
   */
  _filterThinkingPatterns(text) {
    if (!text) return text;

    const thinkingPatterns = [
      /^Wait,?\s+.{0,200}$/gm,
      /^Actually,?\s+.{0,200}$/gm,
      /^Let me\s+.{0,150}$/gm,
      /^I will\s+.{0,150}$/gm,
      /^I should\s+.{0,150}$/gm,
      /^I need to\s+.{0,150}$/gm,
      /^Ready\.?\s*$/gm,
      /^Okay\.?\s*$/gm,
    ];

    let filtered = text;
    for (const pattern of thinkingPatterns) {
      filtered = filtered.replace(pattern, '');
    }

    // Remove multiple consecutive newlines
    filtered = filtered.replace(/\n{3,}/g, '\n\n');
    return filtered.trim();
  }

  /**
   * Get accumulated final response (filtered)
   */
  getFinalResponse() {
    return this._filterThinkingPatterns(this.finalResponse);
  }

  /**
   * Get raw unfiltered response (for debugging)
   */
  getRawResponse() {
    return this.finalResponse;
  }

  /**
   * Get usage statistics
   */
  getUsage() {
    return this.usage;
  }

  /**
   * Get session ID
   */
  getSessionId() {
    return this.sessionId;
  }

  /**
   * Get model name
   */
  getModel() {
    return this.model;
  }

  /**
   * Reset parser state for new request
   */
  reset() {
    this.buffer = '';
    this.finalResponse = '';
    this.usage = null;
    this.pendingTools.clear();
    // Keep sessionId and model for session continuity
  }
}

module.exports = GeminiOutputParser;
