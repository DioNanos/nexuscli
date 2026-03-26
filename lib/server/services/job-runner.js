const { v4: uuidv4 } = require('uuid');
const CliWrapper = require('../lib/cli-wrapper');
const db = require('../db');

const cliWrapper = new CliWrapper({
  workspaceDir: process.cwd()
});

function ensureSseMap() {
  if (!global.sseConnections) {
    global.sseConnections = new Map();
  }
}

function emitSSE(jobId, event) {
  ensureSseMap();
  const res = global.sseConnections.get(jobId);
  if (!res) return;

  try {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  } catch (error) {
    console.error(`[Jobs] SSE write error for job ${jobId}:`, error);
    global.sseConnections.delete(jobId);
  }
}

async function executeJob(jobId, { tool, command, workingDir, timeout }) {
  console.log(`[Jobs] Executing job ${jobId}`);

  let stmt = db.prepare(`
    UPDATE jobs
    SET status = ?, started_at = ?
    WHERE id = ?
  `);
  stmt.run('executing', Date.now(), jobId);

  emitSSE(jobId, {
    type: 'status',
    category: 'executing',
    message: 'Executing on localhost...',
    icon: '▶',
    timestamp: new Date().toISOString()
  });

  try {
    const result = await cliWrapper.execute({
      jobId,
      tool,
      command,
      workingDir,
      timeout,
      onStatus: (event) => emitSSE(jobId, event)
    });

    stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, exit_code = ?, stdout = ?, stderr = ?,
          duration = ?, completed_at = ?
      WHERE id = ?
    `);

    const status = result.exitCode === 0 ? 'completed' : 'failed';
    stmt.run(
      status,
      result.exitCode,
      result.stdout,
      result.stderr,
      result.duration,
      Date.now(),
      jobId
    );

    emitSSE(jobId, {
      type: 'response_done',
      exitCode: result.exitCode,
      duration: result.duration
    });
    emitSSE(jobId, { type: 'done' });
  } catch (error) {
    console.error(`[Jobs] Job ${jobId} error:`, error);

    stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, stderr = ?, completed_at = ?
      WHERE id = ?
    `);
    stmt.run('failed', error.message, Date.now(), jobId);

    emitSSE(jobId, {
      type: 'error',
      error: error.message
    });
    emitSSE(jobId, { type: 'done' });
  }
}

function createJob({
  conversationId = null,
  messageId = null,
  nodeId = 'localhost',
  tool = 'bash',
  command,
  workingDir,
  timeout = 30000,
  metadata = null,
}) {
  const jobId = uuidv4();
  const now = Date.now();

  const decoratedCommand = metadata ? `${command}\n# ${JSON.stringify(metadata)}` : command;

  const stmt = db.prepare(`
    INSERT INTO jobs (
      id, conversation_id, message_id, node_id, tool, command,
      status, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    jobId,
    conversationId,
    messageId,
    nodeId,
    tool,
    decoratedCommand,
    'queued',
    now
  );

  setImmediate(() => {
    executeJob(jobId, { tool, command, workingDir, timeout });
  });

  return {
    jobId,
    nodeId,
    tool,
    command,
    status: 'queued',
    createdAt: now,
    streamEndpoint: `/api/v1/jobs/${jobId}/stream`
  };
}

function killJob(jobId) {
  return cliWrapper.kill(jobId);
}

module.exports = {
  createJob,
  executeJob,
  emitSSE,
  ensureSseMap,
  killJob,
};
