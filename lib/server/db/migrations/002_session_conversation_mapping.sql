-- ============================================================
-- MIGRATION 002: Add conversation_id mapping to sessions
-- Enables sync pattern: conversationId -> sessionId per engine
-- ============================================================

-- Add conversation_id column for frontend mapping
ALTER TABLE sessions ADD COLUMN conversation_id TEXT;

-- Index for fast lookup by conversation
CREATE INDEX IF NOT EXISTS idx_sessions_conversation ON sessions(conversation_id);

-- Composite index for engine + conversation lookup
CREATE INDEX IF NOT EXISTS idx_sessions_engine_conversation ON sessions(engine, conversation_id);

-- ============================================================
-- BACKFILL: Set conversation_id = id for existing sessions
-- (maintains backwards compatibility)
-- ============================================================
UPDATE sessions SET conversation_id = id WHERE conversation_id IS NULL;
