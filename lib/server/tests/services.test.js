/**
 * Unit Tests for Ultra-Light Services
 * Phase 7 - Testing & Deployment
 */

const WorkspaceManager = require('../services/workspace-manager');
const CliLoader = require('../services/cli-loader');
const SummaryGenerator = require('../services/summary-generator');

describe('WorkspaceManager', () => {
  let manager;

  beforeEach(() => {
    manager = new WorkspaceManager();
  });

  test('should validate workspace path', async () => {
    // Test with allowed path
    const validPath = '/var/www/myapp';
    const result = await manager.validateWorkspace(validPath);
    expect(result).toBe(validPath);
  });

  test('should reject invalid workspace paths', async () => {
    // Test with disallowed root
    const invalidPath = '/etc/passwd';
    await expect(manager.validateWorkspace(invalidPath)).rejects.toThrow('not in allowed directories');
  });

  test('should detect non-existent workspace', async () => {
    const nonExistent = '/var/nonexistent-workspace-12345';
    await expect(manager.validateWorkspace(nonExistent)).rejects.toThrow('does not exist');
  });

  test('should have cache configuration', () => {
    expect(manager.cacheTtlMs).toBe(5 * 60 * 1000); // 5 minutes
    expect(manager.historyCache).toBeDefined();
    expect(manager.historyCache.entries).toBeNull();
    expect(manager.historyCache.timestamp).toBe(0);
  });

  test('should extract title from messages', () => {
    const messages = [
      { display: 'Implement user authentication feature' },
      { display: 'Follow up on previous discussion' }
    ];
    const title = manager.extractTitle(messages);
    expect(title).toContain('Implement');
    expect(title.length).toBeLessThanOrEqual(50);
  });
});

describe('CliLoader', () => {
  let loader;

  beforeEach(() => {
    loader = new CliLoader();
  });

  test('should initialize with correct claudePath', () => {
    const expectedPath = require('path').join(process.env.HOME, '.claude');
    expect(loader.claudePath).toBe(expectedPath);
  });

  test('should initialize with correct historyPath', () => {
    const expectedPath = require('path').join(process.env.HOME, '.claude', 'history.jsonl');
    expect(loader.historyPath).toBe(expectedPath);
  });

  test('should have loadMessagesFromCLI method', () => {
    expect(typeof loader.loadMessagesFromCLI).toBe('function');
  });
});

describe('SummaryGenerator', () => {
  let generator;

  beforeEach(() => {
    generator = new SummaryGenerator({ apiKey: 'test-key' });
  });

  test('should build transcript from messages', () => {
    const messages = [
      { role: 'user', content: 'Hello', created_at: Date.now() },
      { role: 'assistant', content: 'Hi there!', created_at: Date.now() }
    ];
    const transcript = generator.buildTranscript(messages);
    expect(transcript).toContain('USER:');
    expect(transcript).toContain('ASSISTANT:');
    expect(transcript).toContain('Hello');
    expect(transcript).toContain('Hi there');
  });

  test('should limit transcript size', () => {
    const longMessages = Array(100).fill(null).map((_, i) => ({
      role: 'user',
      content: 'A'.repeat(100),
      created_at: Date.now()
    }));
    const transcript = generator.buildTranscript(longMessages);
    expect(transcript.length).toBeLessThanOrEqual(6000);
  });

  test('should build prompt with session info', () => {
    const sessionId = 'test-session-123';
    const transcript = 'USER: Test message';
    const prompt = generator.buildPrompt({ sessionId, transcript, existingSummary: null });
    expect(prompt).toContain(sessionId);
    expect(prompt).toContain('JSON');
    expect(prompt).toContain('summary_short');
    expect(prompt).toContain('summary_long');
  });

  test('should parse valid JSON response', () => {
    const validJson = JSON.stringify({
      summary_short: 'Short summary',
      summary_long: 'Long summary with more details',
      key_decisions: ['Decision 1', 'Decision 2'],
      tools_used: ['Bash', 'Edit'],
      files_modified: ['file1.js', 'file2.js']
    });
    const result = generator.safeParseJson(validJson);
    expect(result.summary_short).toBe('Short summary');
    expect(result.key_decisions).toHaveLength(2);
    expect(result.tools_used).toContain('Bash');
  });

  test('should handle invalid JSON', () => {
    const invalidJson = 'This is not JSON';
    expect(() => generator.safeParseJson(invalidJson)).toThrow('Failed to parse summary JSON');
  });

  test('should normalize array fields', () => {
    const jsonWithStrings = JSON.stringify({
      summary_short: 'Test',
      summary_long: 'Test long',
      key_decisions: 'single decision',
      tools_used: ['tool1'],
      files_modified: 'single_file.js'
    });
    const result = generator.safeParseJson(jsonWithStrings);
    expect(Array.isArray(result.key_decisions)).toBe(true);
    expect(Array.isArray(result.files_modified)).toBe(true);
  });
});

describe('Integration - Service Interactions', () => {
  test('WorkspaceManager should use consistent path resolution', async () => {
    const manager = new WorkspaceManager();
    const testPath = '/var/www/myapp';
    const validated = await manager.validateWorkspace(testPath);
    expect(validated).toBe(testPath);
  });

  test('CliLoader and WorkspaceManager should use same Claude path', () => {
    const manager = new WorkspaceManager();
    const loader = new CliLoader();
    expect(manager.claudePath).toBe(loader.claudePath);
  });
});
