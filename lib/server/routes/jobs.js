const express = require('express');
const db = require('../db');
const {
  createJob,
  emitSSE,
  ensureSseMap,
  killJob,
} = require('../services/job-runner');

const router = express.Router();

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

    const job = createJob({
      conversationId: conversationId || null,
      messageId: messageId || null,
      nodeId,
      tool,
      command,
      workingDir,
      timeout,
    });

    console.log(`[Jobs] Created job ${job.jobId}: ${tool} - ${command.substring(0, 50)}`);
    res.status(201).json(job);

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
  ensureSseMap();
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
    const killed = killJob(jobId);

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

module.exports = router;
