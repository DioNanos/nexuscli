#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function testHistoryAccess() {
  const historyPath = path.join(process.env.HOME || '', '.claude', 'history.jsonl');

  console.log(`[Test] Checking access to: ${historyPath}`);
  console.log(`[Test] HOME env: ${process.env.HOME}`);
  console.log(`[Test] USER env: ${process.env.USER}`);

  if (!fs.existsSync(historyPath)) {
    console.error('[Test] ❌ history.jsonl NOT FOUND');
    process.exit(1);
  }

  console.log('[Test] ✅ history.jsonl exists');

  try {
    fs.accessSync(historyPath, fs.constants.R_OK);
    console.log('[Test] ✅ Read permission OK');
  } catch (err) {
    console.error('[Test] ❌ No read permission:', err.message);
    process.exit(1);
  }

  try {
    const content = fs.readFileSync(historyPath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim()).slice(0, 10);

    console.log(`[Test] ✅ Read ${lines.length} lines successfully`);

    if (lines.length > 0) {
      const firstEntry = JSON.parse(lines[0]);
      console.log('[Test] Sample entry:', {
        sessionId: firstEntry.sessionId ? firstEntry.sessionId.substring(0, 8) : null,
        project: firstEntry.project,
        timestamp: firstEntry.timestamp ? new Date(firstEntry.timestamp).toISOString() : null
      });
    }
  } catch (err) {
    console.error('[Test] ❌ Failed to read/parse:', err.message);
    process.exit(1);
  }

  console.log('\n[Test] ✅ All checks passed!');
}

testHistoryAccess();
