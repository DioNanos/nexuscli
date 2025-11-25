-- ============================================================
-- SESSIONS: Lightweight index of all CLI sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  engine TEXT NOT NULL DEFAULT 'claude-code',
  workspace_path TEXT NOT NULL,
  session_path TEXT,
  title TEXT NOT NULL,
  last_used_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  pinned INTEGER DEFAULT 0,
  importance INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  metadata TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_workspace ON sessions(workspace_path);
CREATE INDEX IF NOT EXISTS idx_sessions_last_used ON sessions(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_pinned ON sessions(pinned, last_used_at DESC);

-- ============================================================
-- SESSION_SUMMARIES: Contextual memory for each session
-- ============================================================
CREATE TABLE IF NOT EXISTS session_summaries (
  session_id TEXT PRIMARY KEY,
  summary_short TEXT NOT NULL,
  summary_long TEXT,
  key_decisions TEXT,
  tools_used TEXT,
  files_modified TEXT,
  updated_at INTEGER NOT NULL,
  version INTEGER DEFAULT 1,
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_summaries_updated ON session_summaries(updated_at DESC);

-- ============================================================
-- WORKSPACE_MEMORY: Project-level context (optional)
-- ============================================================
CREATE TABLE IF NOT EXISTS workspace_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workspace_path TEXT UNIQUE NOT NULL,
  summary TEXT,
  tech_stack TEXT,
  architecture_notes TEXT,
  important_files TEXT,
  session_count INTEGER DEFAULT 0,
  last_activity INTEGER,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_memory_activity ON workspace_memory(last_activity DESC);

-- ============================================================
-- MIGRATION: Map old conversations to new sessions
-- ============================================================
INSERT INTO sessions (
  id,
  engine,
  workspace_path,
  session_path,
  title,
  last_used_at,
  created_at,
  pinned,
  importance,
  message_count,
  metadata
)
SELECT
  c.id,
  'claude-code' as engine,
  COALESCE(
    json_extract(c.metadata, '$.workspace'),
    '/data/data/com.termux/files/home/Dev/NexusCLI/backend'
  ) as workspace_path,
  NULL as session_path,
  c.title,
  c.updated_at as last_used_at,
  c.created_at,
  COALESCE(json_extract(c.metadata, '$.bookmarked'), 0) as pinned,
  0 as importance,
  (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id) as message_count,
  c.metadata
FROM conversations c
WHERE NOT EXISTS (SELECT 1 FROM sessions WHERE id = c.id);

-- ============================================================
-- VERIFICATION: Count check
-- ============================================================
-- This will be run separately for verification
-- SELECT 'OLD' as source, COUNT(*) as count FROM conversations
-- UNION ALL
-- SELECT 'NEW' as source, COUNT(*) as count FROM sessions;
