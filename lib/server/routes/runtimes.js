const express = require('express');
const RuntimeManager = require('../services/runtime-manager');
const { createJob } = require('../services/job-runner');

const router = express.Router();
const runtimeManager = new RuntimeManager();

router.get('/', async (_req, res) => {
  try {
    const inventory = await runtimeManager.getRuntimeInventory();
    res.json({
      platform: runtimeManager.platformId,
      runtimes: inventory,
    });
  } catch (error) {
    console.error('[Runtimes] Inventory error:', error);
    res.status(500).json({ error: 'Failed to fetch runtime inventory' });
  }
});

router.post('/check', async (_req, res) => {
  try {
    const inventory = await runtimeManager.getRuntimeInventory();
    res.json({
      platform: runtimeManager.platformId,
      runtimes: inventory,
      checkedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Runtimes] Check error:', error);
    res.status(500).json({ error: 'Failed to check runtimes' });
  }
});

function queueRuntimeAction(req, res, action) {
  const { runtimeId } = req.body || {};

  if (!runtimeId) {
    return res.status(400).json({ error: 'runtimeId required' });
  }

  const command = runtimeManager.resolveAction(runtimeId, action);
  if (!command) {
    return res.status(400).json({ error: `No ${action} command configured for ${runtimeId}` });
  }

  const job = createJob({
    tool: 'bash',
    command,
    timeout: action === 'check' ? 15000 : 180000,
    metadata: {
      runtimeId,
      action,
      platform: runtimeManager.platformId,
    },
  });

  return res.status(202).json({
    ...job,
    runtimeId,
    action,
  });
}

router.post('/install', (req, res) => queueRuntimeAction(req, res, 'install'));
router.post('/update', (req, res) => queueRuntimeAction(req, res, 'update'));

module.exports = router;
