/**
 * Output Parser for Codex CLI JSON Stream
 * Parses `codex exec --json` JSONL output
 *
 * JSON Event Types from Codex:
 * - thread.started: Thread initialization with thread_id
 * - turn.started: Turn begins
 * - item.started: Item in progress (command_execution with status: in_progress)
 * - item.completed: Item finished (reasoning, agent_message, command_execution)
 * - turn.completed: Turn finished with usage stats
 * - turn.failed: Turn failed with error
 *
 * Emits SSE events:
 * - status (category: tool, reasoning, system) -> for StatusBar
 * - response_chunk -> text content for chat
 * - response_done -> final text
 * - done -> completion with usage
 * - error -> error message
 */

class CodexOutputParser {
  constructor() {
    this.buffer = '';
    this.finalResponse = '';
    this.usage = null;
    this.threadId = null;
    this.pendingCommands = new Map(); // Track in-progress commands
  }

  /**
   * Parse a chunk of stdout (may contain multiple JSON lines)
   * @param {string} chunk - Raw stdout chunk from node-pty
   * @returns {Array} Array of event objects for SSE
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

      // Skip non-JSON lines (e.g., "Reading prompt from stdin...")
      if (!trimmed.startsWith('{')) {
        console.log('[CodexOutputParser] Non-JSON line (ignored):', trimmed.substring(0, 80));
        continue;
      }

      try {
        const json = JSON.parse(trimmed);
        const lineEvents = this.parseJsonEvent(json);
        events.push(...lineEvents);
      } catch (e) {
        console.log('[CodexOutputParser] JSON parse error:', e.message, '- Line:', trimmed.substring(0, 100));
      }
    }

    return events;
  }

  /**
   * Parse a single JSON event from Codex
   * @param {Object} event - Parsed JSON object
   * @returns {Array} Events to emit
   */
  parseJsonEvent(event) {
    const events = [];

    switch (event.type) {
      case 'thread.started':
        this.threadId = event.thread_id;
        console.log('[CodexOutputParser] Thread started:', this.threadId);
        events.push({
          type: 'status',
          category: 'system',
          message: 'Session started',
          icon: '🚀',
          timestamp: new Date().toISOString(),
        });
        break;

      case 'turn.started':
        console.log('[CodexOutputParser] Turn started');
        break;

      case 'item.started':
        // Command execution starting
        if (event.item?.type === 'command_execution') {
          const cmd = event.item.command || 'Unknown command';
          this.pendingCommands.set(event.item.id, event.item);

          events.push({
            type: 'status',
            category: 'tool',
            message: `Bash: ${this.truncate(cmd, 60)}`,
            icon: '🔧',
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'item.completed':
        if (!event.item) break;

        switch (event.item.type) {
          case 'reasoning':
            // Reasoning/thinking
            const reasoningText = event.item.text || '';
            if (reasoningText.trim()) {
              events.push({
                type: 'status',
                category: 'reasoning',
                message: `Thinking: ${this.truncate(reasoningText, 50)}`,
                icon: '🧠',
                timestamp: new Date().toISOString(),
              });
            }
            break;

          case 'command_execution':
            // Command completed
            const cmd = event.item.command || 'command';
            const exitCode = event.item.exit_code;
            const status = exitCode === 0 ? 'completed' : `failed (${exitCode})`;

            events.push({
              type: 'status',
              category: 'tool',
              message: `Bash: ${this.truncate(cmd, 40)} - ${status}`,
              icon: exitCode === 0 ? '✅' : '❌',
              toolOutput: this.truncateOutput(event.item.aggregated_output),
              timestamp: new Date().toISOString(),
            });

            this.pendingCommands.delete(event.item.id);
            break;

          case 'agent_message':
            // Final response text
            const text = event.item.text || '';
            if (text.trim()) {
              this.finalResponse = text;
              events.push({
                type: 'response_chunk',
                text: text,
                isIncremental: false,
              });
            }
            break;

          case 'file_read':
            events.push({
              type: 'status',
              category: 'tool',
              message: `Reading: ${this.truncate(event.item.path || '', 50)}`,
              icon: '📖',
              timestamp: new Date().toISOString(),
            });
            break;

          case 'file_write':
            events.push({
              type: 'status',
              category: 'tool',
              message: `Writing: ${this.truncate(event.item.path || '', 50)}`,
              icon: '✍️',
              timestamp: new Date().toISOString(),
            });
            break;

          case 'file_edit':
            events.push({
              type: 'status',
              category: 'tool',
              message: `Editing: ${this.truncate(event.item.path || '', 50)}`,
              icon: '📝',
              timestamp: new Date().toISOString(),
            });
            break;

          default:
            console.log('[CodexOutputParser] Unknown item type:', event.item.type);
        }
        break;

      case 'turn.completed':
        // Turn finished with usage
        this.usage = event.usage || null;
        console.log('[CodexOutputParser] Turn completed, usage:', JSON.stringify(this.usage));

        // Emit response_done
        events.push({
          type: 'response_done',
          fullText: this.finalResponse,
        });

        // Emit done with usage
        events.push({
          type: 'done',
          usage: {
            prompt_tokens: this.usage?.input_tokens || 0,
            completion_tokens: this.usage?.output_tokens || 0,
            total_tokens: (this.usage?.input_tokens || 0) + (this.usage?.output_tokens || 0),
            cached_tokens: this.usage?.cached_input_tokens || 0,
          },
          threadId: this.threadId,
        });
        break;

      case 'turn.failed':
        console.error('[CodexOutputParser] Turn failed:', event.error);
        events.push({
          type: 'error',
          message: event.error || 'Unknown error',
        });
        break;

      default:
        console.log('[CodexOutputParser] Unknown event type:', event.type);
    }

    return events;
  }

  /**
   * Truncate string to max length
   */
  truncate(str, maxLen) {
    if (!str) return '';
    if (str.length <= maxLen) return str;
    return str.substring(0, maxLen) + '...';
  }

  /**
   * Truncate tool output (can be very long)
   */
  truncateOutput(content) {
    if (!content) return null;
    const str = typeof content === 'string' ? content : JSON.stringify(content);
    if (str.length > 500) {
      return str.substring(0, 500) + '\n... (truncated)';
    }
    return str;
  }

  /**
   * Get accumulated final response
   */
  getFinalResponse() {
    return this.finalResponse;
  }

  /**
   * Get usage statistics
   */
  getUsage() {
    return this.usage;
  }

  /**
   * Get thread ID (native Codex session ID)
   */
  getThreadId() {
    return this.threadId;
  }

  /**
   * Reset parser state for new request
   */
  reset() {
    this.buffer = '';
    this.finalResponse = '';
    this.usage = null;
    this.threadId = null;
    this.pendingCommands.clear();
  }
}

module.exports = CodexOutputParser;
