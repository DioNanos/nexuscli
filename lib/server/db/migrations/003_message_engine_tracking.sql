-- ============================================================
-- MIGRATION 003: Add engine tracking to messages
-- Enables context bridging between Claude/Codex engines
-- ============================================================

-- Add engine column to messages table
ALTER TABLE messages ADD COLUMN engine TEXT DEFAULT 'claude';

-- Index for filtering by engine
CREATE INDEX IF NOT EXISTS idx_messages_engine ON messages(engine);

-- Composite index for conversation + engine queries
CREATE INDEX IF NOT EXISTS idx_messages_conversation_engine ON messages(conversation_id, engine);

-- ============================================================
-- BACKFILL: Set engine based on metadata or default to claude
-- ============================================================
UPDATE messages SET engine = 'claude' WHERE engine IS NULL;
