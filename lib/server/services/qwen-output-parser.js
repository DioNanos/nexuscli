/**
 * QwenOutputParser - Parse Qwen CLI stream-json output
 *
 * Qwen Code stream-json emits JSONL lines with message envelopes:
 * - system (subtype: init)
 * - assistant (message.content blocks)
 * - user (tool_result blocks)
 * - stream_event (partial deltas when enabled)
 * - result (usage + status)
 *
 * Emits normalized events for SSE streaming:
 * - status: { type: 'status', category: 'tool'|'system', message, icon }
 * - response_chunk: { type: 'response_chunk', text, isIncremental }
 * - response_done: { type: 'response_done', fullText }
 * - done: { type: 'done', usage, status }
 * - error: { type: 'error', message }
 */

class QwenOutputParser {
  constructor() {
    this.buffer = '';
    this.finalResponse = '';
    this.usage = null;
    this.sessionId = null;
    this.model = null;
    this.receivedPartial = false;
  }

  /**
   * Parse stdout chunk (may contain multiple JSON lines)
   * @param {string} chunk
   * @returns {Array}
   */
  parse(chunk) {
    const events = [];

    this.buffer += chunk;
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      if (!trimmed.startsWith('{')) {
        continue;
      }

      try {
        const json = JSON.parse(trimmed);
        const lineEvents = this._parseJsonEvent(json);
        events.push(...lineEvents);
      } catch (e) {
        console.warn('[QwenOutputParser] JSON parse error:', e.message, '- Line:', trimmed.substring(0, 80));
      }
    }

    return events;
  }

  _parseJsonEvent(event) {
    const events = [];

    switch (event.type) {
      case 'system': {
        if (event.subtype === 'init') {
          this.sessionId = event.session_id || event.sessionId || this.sessionId;
          this.model = event.model || event.data?.model || this.model;
          events.push({
            type: 'status',
            category: 'system',
            message: 'Session initialized',
            icon: '🚀',
            sessionId: this.sessionId,
            model: this.model,
            timestamp: event.timestamp || new Date().toISOString(),
          });
        }
        break;
      }

      case 'assistant': {
        const contentBlocks = event.message?.content;
        const text = this._extractText(contentBlocks);
        if (text) {
          if (!this.receivedPartial) {
            this.finalResponse += text;
            events.push({
              type: 'response_chunk',
              text,
              isIncremental: false,
            });
          } else if (!this.finalResponse) {
            // Fallback if partials were emitted but response was empty
            this.finalResponse = text;
          }
        }
        this._emitToolUseFromBlocks(contentBlocks, events);
        break;
      }

      case 'user': {
        const contentBlocks = event.message?.content;
        this._emitToolResultFromBlocks(contentBlocks, events);
        break;
      }

      case 'stream_event': {
        const stream = event.event || {};
        if (stream.type === 'content_block_delta' && stream.delta?.type === 'text_delta') {
          const text = stream.delta.text || '';
          if (text) {
            this.receivedPartial = true;
            this.finalResponse += text;
            events.push({
              type: 'response_chunk',
              text,
              isIncremental: true,
            });
          }
        }
        if (stream.type === 'content_block_start' && stream.content_block?.type === 'tool_use') {
          events.push(this._formatToolUseEvent(stream.content_block));
        }
        break;
      }

      case 'result': {
        if (event.is_error) {
          const message = event.error?.message || event.error || 'Unknown error';
          events.push({ type: 'error', message });
          break;
        }

        this.usage = event.usage || null;
        const fullText = this.finalResponse || event.result || '';

        events.push({
          type: 'response_done',
          fullText,
        });

        const promptTokens = this.usage?.input_tokens || 0;
        const completionTokens = this.usage?.output_tokens || 0;
        const totalTokens = this.usage?.total_tokens || (promptTokens + completionTokens);

        events.push({
          type: 'done',
          status: 'success',
          usage: {
            prompt_tokens: promptTokens,
            completion_tokens: completionTokens,
            total_tokens: totalTokens,
          },
          duration_ms: event.duration_ms || 0,
          sessionId: this.sessionId,
        });
        break;
      }

      default:
        // Ignore other event types
        break;
    }

    return events;
  }

  _extractText(contentBlocks) {
    if (!contentBlocks) return '';
    if (typeof contentBlocks === 'string') return contentBlocks;
    if (!Array.isArray(contentBlocks)) return '';

    return contentBlocks
      .filter((block) => block?.type === 'text' && block.text)
      .map((block) => block.text)
      .join('');
  }

  _emitToolUseFromBlocks(contentBlocks, events) {
    if (!Array.isArray(contentBlocks)) return;
    for (const block of contentBlocks) {
      if (block?.type === 'tool_use') {
        events.push(this._formatToolUseEvent(block));
      }
    }
  }

  _emitToolResultFromBlocks(contentBlocks, events) {
    if (!Array.isArray(contentBlocks)) return;
    for (const block of contentBlocks) {
      if (block?.type === 'tool_result') {
        const success = !block.is_error;
        events.push({
          type: 'status',
          category: 'tool',
          message: success ? 'Tool completed' : 'Tool failed',
          icon: success ? '✅' : '❌',
          toolOutput: this._truncateOutput(block.content),
          timestamp: new Date().toISOString(),
        });
      }
    }
  }

  _formatToolUseEvent(block) {
    const tool = block?.name || block?.tool || block?.function?.name || 'Tool';
    const input = block?.input || block?.parameters || block?.args || block?.function?.arguments || {};
    let message = tool;

    switch (tool) {
      case 'shell':
      case 'run_shell_command':
      case 'execute_command':
        message = `Shell: ${this._truncate(block.command || input.command || '', 60)}`;
        break;
      case 'read_file':
      case 'read_many_files':
      case 'read':
        message = `Reading: ${this._truncate(block.path || input.path || input.file_path || '', 50)}`;
        break;
      case 'write_file':
      case 'write':
        message = `Writing: ${this._truncate(block.path || input.path || input.file_path || '', 50)}`;
        break;
      case 'edit_file':
      case 'edit':
        message = `Editing: ${this._truncate(block.path || input.path || input.file_path || '', 50)}`;
        break;
      case 'search_files':
      case 'grep':
      case 'find_files':
        message = `Searching: ${this._truncate(block.pattern || input.pattern || input.query || '', 40)}`;
        break;
      case 'list_directory':
      case 'list_dir':
      case 'ls':
        message = `Listing: ${this._truncate(block.path || input.path || input.dir_path || '.', 50)}`;
        break;
      case 'web_search':
      case 'google_search':
      case 'search':
        message = `Web search: ${this._truncate(block.query || input.query || '', 40)}`;
        break;
      case 'web_fetch':
      case 'fetch_url':
        message = `Fetch: ${this._truncate(block.url || input.url || '', 60)}`;
        break;
      default:
        message = `Tool: ${tool}`;
        break;
    }

    return {
      type: 'status',
      category: 'tool',
      message,
      icon: '🛠️',
    };
  }

  _truncate(text, maxLen = 60) {
    if (!text) return '';
    const str = String(text);
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
  }

  _truncateOutput(output, maxLen = 200) {
    if (!output) return '';
    const text = typeof output === 'string' ? output : JSON.stringify(output);
    if (text.length <= maxLen) return text;
    return text.substring(0, maxLen) + '...';
  }

  getFinalResponse() {
    return this.finalResponse || '';
  }

  getUsage() {
    return this.usage;
  }

  getSessionId() {
    return this.sessionId;
  }
}

module.exports = QwenOutputParser;
