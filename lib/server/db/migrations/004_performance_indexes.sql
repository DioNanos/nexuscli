-- Migration 004: Performance indexes for chat list optimization
-- Created: 2025-11-22
--
-- Adds indexes to improve:
-- - Workspace filtering (sessions.workspace_path)
-- - Conversation listing (conversations.updated_at)
-- - Session-conversation joins

-- Index for workspace filtering
CREATE INDEX IF NOT EXISTS idx_sessions_workspace_path ON sessions(workspace_path);

-- Index for conversation sorting (updated_at DESC)
CREATE INDEX IF NOT EXISTS idx_conversations_updated_at ON conversations(updated_at DESC);

-- Composite index for session-conversation joins
CREATE INDEX IF NOT EXISTS idx_sessions_id_workspace ON sessions(id, workspace_path);
