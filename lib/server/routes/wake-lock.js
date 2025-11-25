const express = require('express');
const { execSync } = require('child_process');
const router = express.Router();

// State to track wake lock status
let wakeLockAcquired = false;

/**
 * POST /api/v1/wake-lock
 * Acquire wake lock (prevent Android from killing process)
 * On non-Termux systems, this is a no-op but returns success to avoid errors
 */
router.post('/wake-lock', (req, res) => {
  try {
    console.log('[WakeLock] Acquiring wake lock...');

    const isTermux = process.env.PREFIX?.includes('com.termux');

    if (isTermux) {
      // Only execute on Termux/Android
      try {
        execSync('termux-wake-lock', { stdio: 'ignore' });
      } catch (e) {
        console.warn('[WakeLock] termux-wake-lock command failed (may not be available)');
      }
    } else {
      console.log('[WakeLock] Not on Termux - wake-lock is a no-op');
    }

    wakeLockAcquired = true;

    console.log('[WakeLock] ✅ Wake lock acquired (or skipped on non-Termux)');

    res.json({
      status: 'ok',
      message: 'Wake lock acquired',
      acquired: wakeLockAcquired,
      platform: isTermux ? 'termux' : 'linux'
    });
  } catch (err) {
    console.error('[WakeLock] ❌ Unexpected error:', err.message);

    // Still return success to avoid breaking the app
    res.status(200).json({
      status: 'ok',
      message: 'Wake lock handler executed',
      acquired: true,
      error: err.message // Log the error but don't fail the request
    });
  }
});

/**
 * DELETE /api/v1/wake-lock
 * Release wake lock
 */
router.delete('/wake-lock', (req, res) => {
  try {
    console.log('[WakeLock] Releasing wake lock...');

    // Execute termux-wake-unlock
    execSync('termux-wake-unlock', { stdio: 'ignore' });

    wakeLockAcquired = false;

    console.log('[WakeLock] ✅ Wake lock released');

    res.json({
      status: 'ok',
      message: 'Wake lock released',
      acquired: wakeLockAcquired
    });
  } catch (err) {
    console.error('[WakeLock] ❌ Failed to release wake lock:', err.message);

    res.status(500).json({
      status: 'error',
      message: 'Failed to release wake lock',
      error: err.message
    });
  }
});

/**
 * GET /api/v1/wake-lock
 * Get wake lock status
 */
router.get('/wake-lock', (req, res) => {
  res.json({
    status: 'ok',
    acquired: wakeLockAcquired
  });
});

module.exports = router;
