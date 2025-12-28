-- ============================================================
-- MIGRATION 005: Fix engine column to NOT NULL
-- Ensures all messages have a valid engine field for proper avatar display
-- ============================================================

-- Step 1: Backfill any NULL values to 'claude' (safe default)
UPDATE messages SET engine = 'claude' WHERE engine IS NULL OR engine = '';

-- Step 2: Recreate messages table with NOT NULL constraint
-- SQLite doesn't support ALTER COLUMN directly, so we recreate

-- Create new table with proper schema
CREATE TABLE IF NOT EXISTS messages_new (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  metadata TEXT,
  engine TEXT NOT NULL DEFAULT 'claude',
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Copy all data from old table to new table
INSERT INTO messages_new
  SELECT id, conversation_id, role, content, created_at, metadata,
         COALESCE(engine, 'claude') AS engine
  FROM messages;

-- Drop old table
DROP TABLE messages;

-- Rename new table to original name
ALTER TABLE messages_new RENAME TO messages;

-- Step 3: Recreate all indexes
CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at ASC);
CREATE INDEX IF NOT EXISTS idx_messages_engine ON messages(engine);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_engine ON messages(conversation_id, engine);

-- Verification query ( informational only )
SELECT 'Messages with NULL engine (should be 0):' as check_name,
       COUNT(*) as count
FROM messages WHERE engine IS NULL;
