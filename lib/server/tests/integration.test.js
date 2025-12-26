/**
 * Integration Tests - Ultra-Light Architecture
 * Phase 7 - End-to-end flow validation
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const TEST_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuscli-home-'));
process.env.HOME = TEST_HOME;

let initDb;
let getDb;
let prepare;

beforeAll(async () => {
  jest.resetModules();
  ({ initDb, getDb, prepare } = require('../db'));
  await initDb(); // run migrations for session tables
});

afterAll(() => {
  const db = getDb && getDb();
  if (db && typeof db.close === 'function') {
    db.close();
  }
});

describe('Database Integration', () => {
  test('should initialize database successfully', async () => {
    const db = getDb();
    expect(db).toBeDefined();
    expect(typeof db.exec).toBe('function');
  });

  test('should have sessions table', async () => {
    const row = prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'").get();
    expect(row).not.toBeNull();
  });

  test('should have session_summaries table', async () => {
    const row = prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_summaries'").get();
    expect(row).not.toBeNull();
  });

  test('should have workspace_memory table', async () => {
    const row = prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace_memory'").get();
    expect(row).not.toBeNull();
  });

  test('should query sessions successfully', async () => {
    const row = prepare('SELECT COUNT(*) as count FROM sessions').get();
    expect(row).toBeDefined();
    expect(Object.prototype.hasOwnProperty.call(row, 'count')).toBe(true);
  });
});

describe('Service Integration', () => {
  test('WorkspaceManager + CliLoader should share path configuration', () => {
    const WorkspaceManager = require('../services/workspace-manager');
    const CliLoader = require('../services/cli-loader');

    const manager = new WorkspaceManager();
    const loader = new CliLoader();

    expect(manager.claudePath).toBe(loader.claudePath);
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
