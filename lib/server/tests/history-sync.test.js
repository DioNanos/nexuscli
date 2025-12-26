const fs = require('fs');
const path = require('path');
const os = require('os');

describe('HistorySync', () => {
  let tmpDir;
  let testHome;
  let historyPath;
  let HistorySync;
  let initDb;
  let prepare;
   let getDb;
  let historySync;

  const writeHistory = () => {
    const entries = [
      { sessionId: 'test-1', display: 'First message', timestamp: 1000, project: '/test/path' },
      { sessionId: 'test-1', display: 'Second message', timestamp: 2000, project: '/test/path' },
      { sessionId: 'test-2', display: 'Another session', timestamp: 3000, project: '/other/path' }
    ];

    const content = entries.map(e => JSON.stringify(e)).join('\n');
    fs.mkdirSync(path.dirname(historyPath), { recursive: true });
    fs.writeFileSync(historyPath, content, 'utf8');
  };

  beforeEach(async () => {
    // Fresh temp DB per test
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-db-'));
    testHome = fs.mkdtempSync(path.join(os.tmpdir(), 'nexuscli-home-'));
    process.env.HOME = testHome;

    jest.resetModules();
    ({ initDb, prepare, getDb } = require('../db'));
    await initDb();

    HistorySync = require('../services/history-sync');

    historyPath = path.join(tmpDir, 'test-history.jsonl');
    writeHistory();

    historySync = new HistorySync({ historyPath, syncCacheMs: 0 });
  });

  afterEach(() => {
    try {
      const db = getDb();
      if (db && typeof db.close === 'function') {
        db.close();
      }
    } catch (_) {
      // ignore cleanup errors
    }
  });

  test('parseHistory groups by sessionId', async () => {
    const sessions = await historySync.parseHistory();

    expect(sessions.size).toBe(2);
    expect(sessions.get('test-1').messages).toHaveLength(2);
    expect(sessions.get('test-2').messages).toHaveLength(1);
    expect(sessions.get('test-1').project).toBe('/test/path');
  });

  test('syncToDatabase creates conversations and messages', async () => {
    const sessions = await historySync.parseHistory();
    const result = await historySync.syncToDatabase(sessions, { force: true });

    expect(result.newConversations).toBe(2);
    expect(result.newMessages).toBe(3);

    const convRow = prepare('SELECT metadata FROM conversations WHERE id = ?').get('test-1');
    const metadata = JSON.parse(convRow.metadata);
    expect(metadata.workspace).toBe('/test/path');
  });

  test('incremental sync does not duplicate messages', async () => {
    await historySync.sync(true);
    const second = await historySync.sync(true);

    expect(second.newConversations).toBe(0);
    expect(second.newMessages).toBe(0);
  });

  test('getWorkspaceSessions filters by workspace path', async () => {
    await historySync.sync(true);

    const grouped = await historySync.getWorkspaceSessions('/test/path');
    const sessions = [
      ...grouped.today,
      ...grouped.yesterday,
      ...grouped.last7days,
      ...grouped.last30days,
      ...grouped.older
    ];
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('test-1');
  });
});
