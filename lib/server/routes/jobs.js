const express = require('express');
const { v4: uuidv4 } = require('uuid');
const CliWrapper = require('../lib/cli-wrapper');
const db = require('../db');

const router = express.Router();

// CLI wrapper instance
const cliWrapper = new CliWrapper({
  workspaceDir: process.cwd()
});

/**
 * POST /api/v1/jobs
 * Create and execute job
 */
router.post('/', async (req, res) => {
  try {
    const {
      conversationId,
      messageId,
      nodeId = 'localhost',
      tool = 'bash',
      command,
      workingDir,
      timeout = 30000
    } = req.body;

    // Validate input
    if (!command) {
      return res.status(400).json({ error: 'Command is required' });
    }

    // Create job ID
    const jobId = uuidv4();
    const now = Date.now();

    // Insert job into database
    const stmt = db.prepare(`
      INSERT INTO jobs (
        id, conversation_id, message_id, node_id, tool, command,
        status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      jobId,
      conversationId || null,
      messageId || null,
      nodeId,
      tool,
      command,
      'queued',
      now
    );

    console.log(`[Jobs] Created job ${jobId}: ${tool} - ${command.substring(0, 50)}`);

    // Return job info with stream endpoint
    res.status(201).json({
      jobId,
      nodeId,
      tool,
      command,
      status: 'queued',
      createdAt: now,
      streamEndpoint: `/api/v1/jobs/${jobId}/stream`
    });

    // Execute job asynchronously (don't block response)
    setImmediate(() => {
      executeJob(jobId, { tool, command, workingDir, timeout });
    });

  } catch (error) {
    console.error('[Jobs] Create error:', error);
    res.status(500).json({ error: 'Failed to create job' });
  }
});

/**
 * GET /api/v1/jobs/:jobId/stream
 * SSE stream for job execution
 */
router.get('/:jobId/stream', (req, res) => {
  const { jobId } = req.params;

  console.log(`[Jobs] SSE stream opened for job ${jobId}`);

  // Set SSE headers (LibreChat/NexusChat pattern)
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Get job from database
  const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
  const job = stmt.get(jobId);

  if (!job) {
    res.write(`data: ${JSON.stringify({
      type: 'error',
      error: 'Job not found'
    })}\n\n`);
    res.end();
    return;
  }

  // If job already completed, send final result
  if (job.status === 'completed' || job.status === 'failed') {
    res.write(`data: ${JSON.stringify({
      type: 'response_done',
      exitCode: job.exit_code,
      duration: job.duration
    })}\n\n`);

    res.write(`data: ${JSON.stringify({
      type: 'done'
    })}\n\n`);

    res.end();
    return;
  }

  // Store SSE connection in a Map (keyed by jobId)
  if (!global.sseConnections) {
    global.sseConnections = new Map();
  }

  global.sseConnections.set(jobId, res);

  // Emit initial queued status
  res.write(`data: ${JSON.stringify({
    type: 'status',
    category: 'queued',
    nodeId: job.node_id,
    message: `Queued on ${job.node_id}...`,
    icon: '⏱️',
    timestamp: new Date().toISOString()
  })}\n\n`);

  // Cleanup on client disconnect
  req.on('close', () => {
    console.log(`[Jobs] SSE stream closed for job ${jobId}`);
    global.sseConnections.delete(jobId);
  });
});

/**
 * GET /api/v1/jobs/:jobId
 * Get job result
 */
router.get('/:jobId', (req, res) => {
  try {
    const stmt = db.prepare('SELECT * FROM jobs WHERE id = ?');
    const job = stmt.get(req.params.jobId);

    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json(job);
  } catch (error) {
    console.error('[Jobs] Get error:', error);
    res.status(500).json({ error: 'Failed to get job' });
  }
});

/**
 * DELETE /api/v1/jobs/:jobId
 * Cancel running job
 */
router.delete('/:jobId', (req, res) => {
  try {
    const { jobId } = req.params;

    // Try to kill running process
    const killed = cliWrapper.kill(jobId);

    // Update job status
    const stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, completed_at = ?
      WHERE id = ?
    `);

    stmt.run('cancelled', Date.now(), jobId);

    // Emit cancelled event to SSE stream
    emitSSE(jobId, {
      type: 'status',
      category: 'cancelled',
      message: 'Job cancelled',
      icon: '⛔'
    });

    emitSSE(jobId, { type: 'done' });

    res.json({ success: true, killed });
  } catch (error) {
    console.error('[Jobs] Cancel error:', error);
    res.status(500).json({ error: 'Failed to cancel job' });
  }
});

/**
 * Execute job asynchronously
 */
async function executeJob(jobId, { tool, command, workingDir, timeout }) {
  console.log(`[Jobs] Executing job ${jobId}`);

  // Update status to executing
  let stmt = db.prepare(`
    UPDATE jobs
    SET status = ?, started_at = ?
    WHERE id = ?
  `);
  stmt.run('executing', Date.now(), jobId);

  // Emit executing status
  emitSSE(jobId, {
    type: 'status',
    category: 'executing',
    message: `Executing on localhost...`,
    icon: '▶',
    timestamp: new Date().toISOString()
  });

  try {
    // Execute command via CLI wrapper
    const result = await cliWrapper.execute({
      jobId,
      tool,
      command,
      workingDir,
      timeout,
      onStatus: (event) => {
        // Forward events to SSE stream
        emitSSE(jobId, event);
      }
    });

    // Update job with result
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

    console.log(`[Jobs] Job ${jobId} ${status} (exit: ${result.exitCode}, ${result.duration}ms)`);

    // Emit done events
    emitSSE(jobId, {
      type: 'response_done',
      exitCode: result.exitCode,
      duration: result.duration
    });

    emitSSE(jobId, {
      type: 'done'
    });

  } catch (error) {
    console.error(`[Jobs] Job ${jobId} error:`, error);

    // Update job as failed
    stmt = db.prepare(`
      UPDATE jobs
      SET status = ?, stderr = ?, completed_at = ?
      WHERE id = ?
    `);

    stmt.run('failed', error.message, Date.now(), jobId);

    // Emit error event
    emitSSE(jobId, {
      type: 'error',
      error: error.message
    });

    emitSSE(jobId, { type: 'done' });
  }
}

/**
 * Emit SSE event to connected clients
 */
function emitSSE(jobId, event) {
  if (!global.sseConnections) return;

  const res = global.sseConnections.get(jobId);
  if (res) {
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch (error) {
      console.error(`[Jobs] SSE write error for job ${jobId}:`, error);
      global.sseConnections.delete(jobId);
    }
  }
}

module.exports = router;
