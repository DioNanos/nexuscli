/**
 * OutputParser - Parse CLI stdout/stderr into structured events
 * Adapted from NexusChat output-parser.js
 */
class OutputParser {
  constructor() {
    this.state = 'idle';
    this.buffer = '';
    this.lineBuffer = '';
  }

  /**
   * Regex patterns for detecting CLI output markers
   */
  static PATTERNS = {
    // Tool execution patterns (generic)
    toolExecution: /(?:Running|Executing)\s+(\w+)(?:\s+(?:command|tool))?:\s*(.+)/i,

    // Common CLI patterns
    errorPattern: /(?:Error|ERROR|Failed|FAILED|Exception):\s*(.+)/i,
    warningPattern: /(?:Warning|WARNING|warn):\s*(.+)/i,

    // ANSI escape codes
    ansiCodes: /\x1B\[[0-9;]*[a-zA-Z]/g,
    ansiPrivate: /\x1B\[\?[0-9;]*[a-zA-Z]/g,
  };

  /**
   * Parse chunk of stdout and return array of events
   * @param {string} chunk - Raw stdout chunk from PTY
   * @returns {Array} Array of event objects
   */
  parse(chunk) {
    const events = [];

    // Add to buffer
    this.buffer += chunk;
    this.lineBuffer += chunk;

    // Process line by line
    const lines = this.lineBuffer.split('\n');
    this.lineBuffer = lines.pop(); // Keep incomplete line

    for (const line of lines) {
      const lineEvents = this.parseLine(line);
      events.push(...lineEvents);
    }

    // Also emit raw output chunks
    const cleanChunk = this.cleanAnsi(chunk);
    if (cleanChunk && cleanChunk.trim()) {
      events.push({
        type: 'output_chunk',
        stream: 'stdout',
        text: cleanChunk,
        isIncremental: true,
      });
    }

    return events;
  }

  /**
   * Parse single line
   * @param {string} line - Single line of output
   * @returns {Array} Events from this line
   */
  parseLine(line) {
    const events = [];
    const cleanLine = this.cleanAnsi(line);

    // Check for tool execution
    const toolMatch = cleanLine.match(OutputParser.PATTERNS.toolExecution);
    if (toolMatch) {
      const [, tool, command] = toolMatch;
      events.push({
        type: 'status',
        category: 'tool',
        tool,
        message: `${tool}: ${command.substring(0, 60)}${command.length > 60 ? '...' : ''}`,
        icon: '🔧',
        timestamp: new Date().toISOString(),
      });
    }

    // Check for errors
    if (OutputParser.PATTERNS.errorPattern.test(cleanLine)) {
      const [, errorMsg] = cleanLine.match(OutputParser.PATTERNS.errorPattern);
      events.push({
        type: 'status',
        category: 'warning',
        message: `Error: ${errorMsg}`,
        icon: '⚠️',
        timestamp: new Date().toISOString(),
      });
    }

    // Check for warnings
    if (OutputParser.PATTERNS.warningPattern.test(cleanLine)) {
      const [, warnMsg] = cleanLine.match(OutputParser.PATTERNS.warningPattern);
      events.push({
        type: 'status',
        category: 'warning',
        message: `Warning: ${warnMsg}`,
        icon: '⚠️',
        timestamp: new Date().toISOString(),
      });
    }

    return events;
  }

  /**
   * Clean ANSI escape codes from text
   */
  cleanAnsi(text) {
    return text
      .replace(OutputParser.PATTERNS.ansiCodes, '')
      .replace(OutputParser.PATTERNS.ansiPrivate, '');
  }

  /**
   * Reset parser state
   */
  reset() {
    this.state = 'idle';
    this.buffer = '';
    this.lineBuffer = '';
  }
}

module.exports = OutputParser;
