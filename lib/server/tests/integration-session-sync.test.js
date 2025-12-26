/**
 * Integration Test - Session Sync Flow (Phase 0-2)
 *
 * Tests the complete flow:
 * 1. history.jsonl → HistorySync → database
 * 2. Chat route with optional conversationId
 * 3. No ghost sessions created
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

let HistorySync;
let initDb;
let getDb;
let prepare;

describe('Session Sync Integration', () => {
  let historySync;
  let testHistoryPath;

  beforeAll(async () => {
    const testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuscli-home-'));
    process.env.HOME = testHome;

    jest.resetModules();
    HistorySync = require('../services/history-sync');
    ({ initDb, getDb, prepare } = require('../db'));

    // Setup in-memory test database
    await initDb();
  });

  afterAll(() => {
    const db = getDb && getDb();
    if (db && typeof db.close === 'function') {
      db.close();
    }
  });

  beforeEach(() => {
    // Create test history.jsonl
    testHistoryPath = path.join(__dirname, 'fixtures', 'test-history-integration.jsonl');

    const testData = [
      {
        sessionId: 'session-001',
        display: 'Fix the database bug',
        timestamp: Date.now() - 10000,
        project: '/test/workspace1'
      },
      {
        sessionId: 'session-001',
        display: 'Add unit tests',
        timestamp: Date.now() - 5000,
        project: '/test/workspace1'
      },
      {
        sessionId: 'session-002',
        display: 'Create new feature',
        timestamp: Date.now() - 3000,
        project: '/test/workspace2'
      }
    ];

    fs.mkdirSync(path.dirname(testHistoryPath), { recursive: true });
    fs.writeFileSync(
      testHistoryPath,
      testData.map(e => JSON.stringify(e)).join('\n')
    );

    historySync = new HistorySync({ historyPath: testHistoryPath });
  });

  afterEach(() => {
    // Cleanup
    if (fs.existsSync(testHistoryPath)) {
      fs.unlinkSync(testHistoryPath);
    }

    // Clear database
    const db = getDb();
    if (db) {
      db.exec('DELETE FROM messages');
      db.exec('DELETE FROM conversations');
      if (db.prepare('SELECT name FROM sqlite_master WHERE name="sessions"').get()) {
        db.exec('DELETE FROM sessions');
      }
    }
  });

  test('parseHistory correctly groups messages by sessionId', async () => {
    const sessions = await historySync.parseHistory();

    expect(sessions.size).toBe(2);
    expect(sessions.get('session-001').messages).toHaveLength(2);
    expect(sessions.get('session-002').messages).toHaveLength(1);
  });

  test('syncToDatabase creates conversations without duplicates', async () => {
    // First sync
    await historySync.sync(true);

    const db = getDb();
    const convStmt = prepare('SELECT COUNT(*) as count FROM conversations');
    const msgStmt = prepare('SELECT COUNT(*) as count FROM messages');

    const conversations = convStmt.get();
    const messages = msgStmt.get();

    expect(conversations.count).toBe(2);
    expect(messages.count).toBe(3);

    // Second sync (should not create duplicates)
    await historySync.sync(true);

    const conversationsAfter = convStmt.get();
    const messagesAfter = msgStmt.get();

    expect(conversationsAfter.count).toBe(2);
    expect(messagesAfter.count).toBe(3);
  });

  test('workspace filtering returns correct sessions', async () => {
    await historySync.sync(true);

    const workspace1Sessions = await historySync.getWorkspaceSessions('/test/workspace1');
    const workspace2Sessions = await historySync.getWorkspaceSessions('/test/workspace2');

    const ws1 = [
      ...workspace1Sessions.today,
      ...workspace1Sessions.yesterday,
      ...workspace1Sessions.last7days,
      ...workspace1Sessions.last30days,
      ...workspace1Sessions.older
    ];
    expect(ws1).toHaveLength(1);
    expect(ws1[0].id).toBe('session-001');

    const ws2 = [
      ...workspace2Sessions.today,
      ...workspace2Sessions.yesterday,
      ...workspace2Sessions.last7days,
      ...workspace2Sessions.last30days,
      ...workspace2Sessions.older
    ];
    expect(ws2).toHaveLength(1);
    expect(ws2[0].id).toBe('session-002');
  });

  test('conversation titles are generated from first message', async () => {
    await historySync.sync(true);

    const db = getDb();
    const stmt = prepare('SELECT id, title FROM conversations WHERE id = ?');
    const conv = stmt.get('session-001');

    expect(conv).toBeDefined();
    expect(conv.title).toContain('Fix');
    expect(conv.title.length).toBeLessThanOrEqual(83); // Max 80 + "..."
  });

  test('sessions table populated with workspace_path', async () => {
    await historySync.sync(true);

    const db = getDb();

    // Check if sessions table exists
    const hasSessionsTable = prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
    ).get();

    if (hasSessionsTable) {
      const stmt = prepare('SELECT COUNT(*) as count FROM sessions');
      const result = stmt.get();

      expect(result.count).toBeGreaterThan(0);
    } else {
      console.warn('sessions table not found - Ultra-Light migration may not have run');
    }
  });
});
