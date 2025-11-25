/**
 * Integration Tests - Ultra-Light Architecture
 * Phase 7 - End-to-end flow validation
 */

const { prepare } = require('../db');

describe('Database Integration', () => {
  test('should initialize database successfully', async () => {
    const db = await prepare();
    expect(db).toBeDefined();
    expect(typeof db.exec).toBe('function');
  });

  test('should have sessions table', async () => {
    const db = await prepare();
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'");
    expect(result.length).toBeGreaterThan(0);
  });

  test('should have session_summaries table', async () => {
    const db = await prepare();
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries'");
    expect(result.length).toBeGreaterThan(0);
  });

  test('should have workspace_memory table', async () => {
    const db = await prepare();
    const result = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_memory'");
    expect(result.length).toBeGreaterThan(0);
  });

  test('should query sessions successfully', async () => {
    const db = await prepare();
    const result = db.exec("SELECT COUNT(*) as count FROM sessions");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].columns).toContain('count');
  });
});

describe('Service Integration', () => {
  test('WorkspaceManager + CliLoader should share path configuration', () => {
    const WorkspaceManager = require('../services/workspace-manager');
    const CliLoader = require('../services/cli-loader');

    const manager = new WorkspaceManager();
    const loader = new CliLoader();

    expect(manager.claudePath).toBe(loader.claudePath);
    expect(manager.historyPath).toBe(loader.historyPath);
  });

  test('All services should initialize without errors', () => {
    const WorkspaceManager = require('../services/workspace-manager');
    const CliLoader = require('../services/cli-loader');
    const SummaryGenerator = require('../services/summary-generator');

    expect(() => new WorkspaceManager()).not.toThrow();
    expect(() => new CliLoader()).not.toThrow();
    expect(() => new SummaryGenerator({ apiKey: 'test' })).not.toThrow();
  });
});

describe('API Routes Availability', () => {
  test('should have workspaces router module', () => {
    expect(() => require('../routes/workspaces')).not.toThrow();
  });

  test('should have sessions router module', () => {
    expect(() => require('../routes/sessions')).not.toThrow();
  });

  test('should have chat router module', () => {
    expect(() => require('../routes/chat')).not.toThrow();
  });
});
