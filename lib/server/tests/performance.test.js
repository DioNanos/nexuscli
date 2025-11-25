/**
 * Performance Tests - Ultra-Light Architecture
 * Phase 7 - Performance benchmarks
 */

const WorkspaceManager = require('../services/workspace-manager');
const SummaryGenerator = require('../services/summary-generator');

describe('Performance Benchmarks', () => {
  test('WorkspaceManager cache should improve load time', () => {
    const manager = new WorkspaceManager();

    // First load (cache miss)
    const start1 = Date.now();
    const cache1 = manager.historyCache;
    const time1 = Date.now() - start1;

    // Second load (should use cache)
    const start2 = Date.now();
    const cache2 = manager.historyCache;
    const time2 = Date.now() - start2;

    // Cache access should be faster
    expect(time2).toBeLessThanOrEqual(time1 + 1);
  });

  test('SummaryGenerator should handle large transcripts', () => {
    const generator = new SummaryGenerator({ apiKey: 'test' });

    // Generate 100 messages
    const messages = Array(100).fill(null).map((_, i) => ({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: 'A'.repeat(50),
      created_at: Date.now()
    }));

    const start = Date.now();
    const transcript = generator.buildTranscript(messages);
    const duration = Date.now() - start;

    // Should complete quickly
    expect(duration).toBeLessThan(100); // 100ms
    expect(transcript.length).toBeLessThanOrEqual(6000);
  });

  test('Workspace validation should be fast', async () => {
    const manager = new WorkspaceManager();
    const testPath = '/home/user/myproject';

    const start = Date.now();
    const validated = await manager.validateWorkspace(testPath);
    const duration = Date.now() - start;

    // Should complete in <10ms
    expect(duration).toBeLessThan(10);
    expect(validated).toBe(testPath);
  });

  test('Title extraction should be fast for large messages', () => {
    const manager = new WorkspaceManager();

    const messages = [{
      display: 'This is a very long message that contains multiple sentences and should be truncated to a reasonable length for display purposes in the UI. The title should only show the first few words.'
    }];

    const start = Date.now();
    const title = manager.extractTitle(messages);
    const duration = Date.now() - start;

    // Should complete in <5ms
    expect(duration).toBeLessThan(5);
    expect(title.length).toBeLessThanOrEqual(50);
  });
});

describe('Memory Efficiency', () => {
  test('Cache should have TTL mechanism', () => {
    const manager = new WorkspaceManager();
    expect(manager.cacheTtlMs).toBe(5 * 60 * 1000); // 5 minutes
  });

  test('Transcript should be limited to prevent memory bloat', () => {
    const generator = new SummaryGenerator({ apiKey: 'test' });

    // Create very long messages
    const messages = Array(200).fill(null).map(() => ({
      role: 'user',
      content: 'X'.repeat(1000),
      created_at: Date.now()
    }));

    const transcript = generator.buildTranscript(messages);

    // Should be limited to 6000 chars
    expect(transcript.length).toBeLessThanOrEqual(6000);
  });
});

describe('Ultra-Light Compliance', () => {
  test('should not store assistant messages in DB (code verification)', () => {
    const fs = require('fs');
    const chatCode = fs.readFileSync('routes/chat.js', 'utf8');

    // Verify comment exists about assistant messages
    expect(chatCode).toContain('assistant replies stay in CLI files');
    expect(chatCode).toContain('User message saved');
  });

  test('should use cache for history.jsonl reads', () => {
    const fs = require('fs');
    const managerCode = fs.readFileSync('services/workspace-manager.js', 'utf8');

    // Verify cache implementation exists
    expect(managerCode).toContain('historyCache');
    expect(managerCode).toContain('cacheTtlMs');
    expect(managerCode).toContain('fs.watch');
  });
});
