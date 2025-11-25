/**
 * Output Parser for Claude CLI JSON Stream
 * Parses Claude Code CLI --output-format stream-json output
 *
 * JSON Event Types from Claude:
 * - system/init: Session initialization
 * - assistant: Message with content (text or tool_use)
 * - user: Tool results
 * - result: Final result with usage stats
 *
 * Emits:
 * - status events (tool execution, thinking)
 * - response_chunk (text content for chat)
 * - response_done (final text)
 * - done (completion with usage)
 */

class OutputParser {
  constructor() {
    this.buffer = '';
    this.finalResponse = '';
    this.usage = null;
    this.sessionId = null;
    this.currentToolUses = new Map(); // Track pending tool uses by ID
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

      // Try to parse as JSON
      try {
        const json = JSON.parse(trimmed);
        const lineEvents = this.parseJsonEvent(json);
        events.push(...lineEvents);
      } catch (e) {
        // Not valid JSON - might be raw text or ANSI codes
        console.log('[OutputParser] Non-JSON line (ignored):', trimmed.substring(0, 100));
      }
    }

    return events;
  }

  /**
   * Parse a single JSON event from Claude
   * @param {Object} event - Parsed JSON object
   * @returns {Array} Events to emit
   */
  parseJsonEvent(event) {
    const events = [];

    // Debug: log all event types
    console.log(`[OutputParser] Event type: ${event.type}, subtype: ${event.subtype || 'none'}`);
    if (event.message?.content) {
      console.log(`[OutputParser] Message content types:`,
        Array.isArray(event.message.content)
          ? event.message.content.map(c => c.type).join(', ')
          : typeof event.message.content
      );
    }

    switch (event.type) {
      case 'system':
        // Init event - extract session info
        if (event.subtype === 'init') {
          this.sessionId = event.session_id;
          console.log('[OutputParser] Session initialized:', this.sessionId);
          events.push({
            type: 'status',
            category: 'system',
            message: 'Session initialized',
            icon: '🚀',
            timestamp: new Date().toISOString(),
          });
        }
        break;

      case 'assistant':
        // Assistant message - may contain text and/or tool_use
        if (event.message?.content) {
          // Handle content as string (some Claude versions)
          if (typeof event.message.content === 'string') {
            const text = event.message.content;
            if (text.trim()) {
              this.finalResponse = text;
              console.log(`[OutputParser] Extracted text (string format): ${text.substring(0, 100)}...`);
              events.push({
                type: 'response_chunk',
                text: text,
                isIncremental: false,
              });
            }
          } else if (Array.isArray(event.message.content)) {
            // Handle content as array of blocks
            for (const item of event.message.content) {
            if (item.type === 'tool_use') {
              // Tool being invoked
              const toolEvent = this.formatToolUseEvent(item);
              events.push(toolEvent);

              // Track this tool use for later result matching
              this.currentToolUses.set(item.id, item);
            } else if (item.type === 'text') {
              // Text response - this is the actual chat content
              const text = item.text || '';
              if (text.trim()) {
                this.finalResponse = text;
                events.push({
                  type: 'response_chunk',
                  text: text,
                  isIncremental: false, // Complete text block
                });
              }
            }
            }
          }
        }
        break;

      case 'user':
        // Tool result - match with pending tool use
        if (event.message?.content) {
          for (const item of event.message.content) {
            if (item.type === 'tool_result') {
              const toolUse = this.currentToolUses.get(item.tool_use_id);
              const toolName = toolUse?.name || 'Tool';

              // Check if tool result indicates an error
              const isError = item.is_error === true ||
                (typeof item.content === 'string' && (
                  item.content.includes('Error:') ||
                  item.content.includes('error:') ||
                  item.content.startsWith('Failed')
                ));

              // Special handling for TodoWrite - preserve todoData
              if (toolName === 'TodoWrite' && toolUse?.input?.todos) {
                const todos = toolUse.input.todos;
                const inProgress = todos.filter(t => t.status === 'in_progress').length;
                const completed = todos.filter(t => t.status === 'completed').length;
                const pending = todos.filter(t => t.status === 'pending').length;

                events.push({
                  type: 'status',
                  category: 'tool',
                  message: `Todos updated (${todos.length}: ${completed}✓ ${inProgress}⚡ ${pending}○)`,
                  icon: this.getToolIcon(toolName),
                  todoData: todos,
                  timestamp: new Date().toISOString(),
                });
              } else {
                // Emit tool completion status (distinguish success vs error)
                const statusMessage = isError
                  ? `${toolName}: error`
                  : `${toolName}: completed`;

                events.push({
                  type: 'status',
                  category: 'tool',
                  message: statusMessage,
                  icon: isError ? '❌' : this.getToolIcon(toolName),
                  toolOutput: this.truncateOutput(item.content),
                  timestamp: new Date().toISOString(),
                });
              }

              // Clean up
              this.currentToolUses.delete(item.tool_use_id);
            }
          }
        }
        break;

      case 'result':
        // Final result - extract usage and final response
        this.usage = event.usage || null;
        if (event.result && !this.finalResponse) {
          this.finalResponse = event.result;
        }

        // Emit response_done with final text
        events.push({
          type: 'response_done',
          fullText: this.finalResponse,
        });

        // Emit done event with usage stats
        events.push({
          type: 'done',
          usage: {
            prompt_tokens: this.usage?.input_tokens || 0,
            completion_tokens: this.usage?.output_tokens || 0,
            total_tokens: (this.usage?.input_tokens || 0) + (this.usage?.output_tokens || 0),
            cache_creation_tokens: this.usage?.cache_creation_input_tokens || 0,
            cache_read_tokens: this.usage?.cache_read_input_tokens || 0,
            cost_usd: event.total_cost_usd || 0,
          },
          duration_ms: event.duration_ms,
          sessionId: event.session_id,
        });
        break;

      default:
        // Unknown event type - log for debugging
        console.log('[OutputParser] Unknown event type:', event.type);
    }

    return events;
  }

  /**
   * Format a tool_use event into a status event
   */
  formatToolUseEvent(toolUse) {
    const { name, input } = toolUse;
    let message = name || 'Tool';

    // Format message based on tool type
    switch (name) {
      case 'Bash':
        message = `Bash: ${this.truncate(input?.command || '', 60)}`;
        break;
      case 'BashOutput':
        message = `Reading output: ${this.truncate(input?.bash_id || input?.shell_id || '', 20)}`;
        break;
      case 'KillShell':
        message = `Killing shell: ${this.truncate(input?.shell_id || '', 20)}`;
        break;
      case 'Read':
        message = `Reading: ${this.truncate(input?.file_path || '', 50)}`;
        break;
      case 'Write':
        message = `Writing: ${this.truncate(input?.file_path || '', 50)}`;
        break;
      case 'Edit':
        message = `Editing: ${this.truncate(input?.file_path || '', 50)}`;
        break;
      case 'Grep':
        message = `Searching: ${this.truncate(input?.pattern || '', 40)}`;
        break;
      case 'Glob':
        message = `Finding: ${this.truncate(input?.pattern || '', 40)}`;
        break;
      case 'Task':
        message = `Task: ${this.truncate(input?.description || '', 50)}`;
        break;
      case 'WebFetch':
        message = `Fetching: ${this.truncate(input?.url || '', 50)}`;
        break;
      case 'WebSearch':
        message = `Searching web: ${this.truncate(input?.query || '', 40)}`;
        break;
      case 'NotebookEdit':
        message = `Editing notebook: ${this.truncate(input?.notebook_path || '', 40)}`;
        break;
      case 'EnterPlanMode':
        message = 'Entering plan mode...';
        break;
      case 'ExitPlanMode':
        message = 'Exiting plan mode...';
        break;
      case 'Skill':
        message = `Using skill: ${this.truncate(input?.skill || '', 30)}`;
        break;
      case 'SlashCommand':
        message = `Running: ${this.truncate(input?.command || '', 40)}`;
        break;
      case 'TodoWrite':
        const todos = input?.todos || [];
        const inProgress = todos.filter(t => t.status === 'in_progress').length;
        const completed = todos.filter(t => t.status === 'completed').length;
        const pending = todos.filter(t => t.status === 'pending').length;
        message = `Updating todos (${todos.length}: ${completed}✓ ${inProgress}⚡ ${pending}○)`;
        // Return early with todoData included
        return {
          type: 'status',
          category: 'tool',
          message,
          icon: this.getToolIcon(name),
          todoData: todos,
          timestamp: new Date().toISOString(),
        };
      case 'AskUserQuestion':
        message = `Asking: ${this.truncate(input?.question || '', 40)}`;
        break;
      default:
        // Handle MCP tools (mcp__*) and other unknown tools gracefully
        if (name?.startsWith('mcp__')) {
          // Extract readable name from MCP tool: mcp__server__tool -> tool
          const parts = name.split('__');
          const toolName = parts[parts.length - 1] || 'mcp';
          message = `MCP: ${toolName}`;
        } else {
          // For any other tool, show the name
          message = `${name || 'Tool'}: running...`;
        }
    }

    return {
      type: 'status',
      category: 'tool',
      message,
      icon: this.getToolIcon(name),
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Get emoji icon for tool type
   */
  getToolIcon(tool) {
    const icons = {
      'Bash': '🔧',
      'BashOutput': '📤',
      'KillShell': '🛑',
      'Read': '📖',
      'Write': '✍️',
      'Edit': '📝',
      'Grep': '🔍',
      'Glob': '🗂️',
      'Task': '📋',
      'WebFetch': '🌐',
      'WebSearch': '🔎',
      'TodoWrite': '✅',
      'NotebookEdit': '📓',
      'AskUserQuestion': '❓',
      'Skill': '🎯',
      'SlashCommand': '⌨️',
      'EnterPlanMode': '📐',
      'ExitPlanMode': '🚪',
      // MCP tools
      'mcp__dag-memory__memory_read': '🧠',
      'mcp__dag-memory__memory_write': '💾',
      'mcp__dag-memory__memory_search': '🔍',
      'mcp__dag-memory__memory_stats': '📊',
    };

    // For MCP tools not in the list, use a generic MCP icon
    if (tool?.startsWith('mcp__')) {
      return icons[tool] || '🔌';
    }

    return icons[tool] || '⚙️';
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
   * Alias for getFinalResponse
   */
  extractFinalResponse() {
    return this.finalResponse.trim();
  }

  /**
   * Get usage statistics
   */
  getUsage() {
    return this.usage;
  }

  /**
   * Reset parser state for new request
   */
  reset() {
    this.buffer = '';
    this.finalResponse = '';
    this.usage = null;
    this.currentToolUses.clear();
  }
}

module.exports = OutputParser;
