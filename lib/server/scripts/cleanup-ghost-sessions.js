#!/usr/bin/env node

const { initDb, getDb } = require('../db');
const Message = require('../models/Message');

/**
 * Identify and clean up "ghost" conversations
 * Ghost = conversation with 0 messages OR only 1 user message (no assistant reply)
 */
async function cleanupGhostSessions() {
  await initDb();
  const db = getDb();

  console.log('[Cleanup] Starting ghost session cleanup...');

  const conversations = db.prepare('SELECT id, title, created_at FROM conversations').all();
  console.log(`[Cleanup] Total conversations: ${conversations.length}`);

  const ghosts = [];

  for (const conv of conversations) {
    // Only need first two messages to detect ghosts
    const messages = Message.getByConversation(conv.id, 2);

    if (messages.length === 0) {
      ghosts.push({ ...conv, reason: 'NO_MESSAGES' });
    } else if (messages.length === 1 && messages[0].role === 'user') {
      ghosts.push({ ...conv, reason: 'NO_REPLY' });
    }
  }

  console.log(`[Cleanup] Found ${ghosts.length} ghost conversations`);

  if (ghosts.length === 0) {
    console.log('[Cleanup] No ghosts found - database is clean!');
    return;
  }

  console.log('\n[Cleanup] Ghost conversations:');
  ghosts.forEach(g => {
    console.log(`  - ${g.id.substring(0, 8)}: "${g.title}" (${g.reason})`);
  });

  const shouldDelete = process.argv.includes('--force');

  if (!shouldDelete) {
    console.log('\n[Cleanup] Dry run complete. Use --force to delete.');
    return;
  }

  const deleteConvo = db.prepare('DELETE FROM conversations WHERE id = ?');
  const deleteMessages = db.prepare('DELETE FROM messages WHERE conversation_id = ?');

  for (const ghost of ghosts) {
    deleteMessages.run(ghost.id);
    deleteConvo.run(ghost.id);
  }

  console.log(`\n[Cleanup] Deleted ${ghosts.length} ghost conversations`);
}

if (require.main === module) {
  cleanupGhostSessions()
    .then(() => process.exit(0))
    .catch(err => {
      console.error('[Cleanup] Error:', err);
      process.exit(1);
    });
}

module.exports = { cleanupGhostSessions };
