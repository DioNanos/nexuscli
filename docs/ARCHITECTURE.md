# NexusCLI Architecture

## Overview

NexusCLI is a Termux-first AI cockpit that orchestrates multiple AI CLI tools (Claude, Codex, Gemini) through a unified web interface with SSE streaming.

## System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                           FRONTEND                                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │   Chat.jsx  │  │  Sidebar    │  │ ModelSelect │  │  StatusLine │ │
│  │  (main UI)  │  │ (sessions)  │  │  (engine)   │  │   (tools)   │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                         SSE Streaming + REST                         │
└───────────────────────────────────┬─────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                           BACKEND (Express.js)                         │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                        Middleware Layer                          │  │
│  │  ┌──────────┐  ┌────────────────┐  ┌──────────────────────────┐ │  │
│  │  │   CORS   │  │ authMiddleware │  │   chatRateLimiter        │ │  │
│  │  │          │  │    (JWT)       │  │   (10 req/min/user)      │ │  │
│  │  └──────────┘  └────────────────┘  └──────────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                         Routes Layer                             │  │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────────┐ │  │
│  │  │ /chat    │  │ /codex   │  │ /gemini  │  │ /conversations   │ │  │
│  │  │ (Claude) │  │ (OpenAI) │  │ (Google) │  │ /sessions        │ │  │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────────────────┘ │  │
│  └───────┼─────────────┼─────────────┼─────────────────────────────┘  │
│          │             │             │                                 │
│  ┌───────┴─────────────┴─────────────┴────────────────────────────┐   │
│  │                      Services Layer                             │   │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐│   │
│  │  │ ClaudeWrapper  │  │ CodexWrapper   │  │ GeminiWrapper      ││   │
│  │  │ (extends Base) │  │ (extends Base) │  │ (extends Base)     ││   │
│  │  └───────┬────────┘  └───────┬────────┘  └───────┬────────────┘│   │
│  │          │                   │                   │              │   │
│  │          └───────────────────┴───────────────────┘              │   │
│  │                              │                                   │   │
│  │                    ┌─────────┴─────────┐                        │   │
│  │                    │  BaseCliWrapper   │                        │   │
│  │                    │  (process mgmt)   │                        │   │
│  │                    └─────────┬─────────┘                        │   │
│  │                              │                                   │   │
│  │  ┌────────────────┐  ┌──────┴───────┐  ┌────────────────────┐  │   │
│  │  │ SessionManager │  │ OutputParser │  │ WorkspaceManager   │  │   │
│  │  │ (sync/resume)  │  │ (JSON parse) │  │ (discover/mount)   │  │   │
│  │  └────────────────┘  └──────────────┘  └────────────────────┘  │   │
│  └─────────────────────────────────────────────────────────────────┘  │
│                                                                        │
│  ┌─────────────────────────────────────────────────────────────────┐  │
│  │                        Data Layer                                │  │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────────────┐ │  │
│  │  │ sql.js (SQLite)│  │     Models     │  │    Migrations      │ │  │
│  │  │ (Termux-safe)  │  │ User/Conv/Msg  │  │ 001-004_*.sql      │ │  │
│  │  └────────────────┘  └────────────────┘  └────────────────────┘ │  │
│  └─────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                        CLI TOOLS (External)                            │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │
│  │   Claude CLI    │  │   Codex CLI     │  │   Gemini CLI    │        │
│  │   (Anthropic)   │  │   (OpenAI)      │  │   (Google)      │        │
│  │                 │  │                 │  │                 │        │
│  │  - OAuth auth   │  │  - API key auth │  │  - OAuth auth   │        │
│  │  - .jsonl logs  │  │  - JSON logs    │  │  - JSON logs    │        │
│  │  - DeepSeek/GLM │  │                 │  │                 │        │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘        │
└───────────────────────────────────────────────────────────────────────┘
```

## Data Flow

### 1. Chat Request Flow

```
User Input → Chat.jsx → POST /api/v1/chat → authMiddleware → rateLimiter
    │
    ▼
chatRouter → ClaudeWrapper.sendMessage()
    │
    ├── Spawn CLI process (child_process.spawn)
    ├── Register process (BaseCliWrapper)
    ├── Stream stdout via OutputParser
    │
    ▼
SSE Events ← OutputParser.parse() ← stdout chunks
    │
    ├── type: 'status' → StatusLine.jsx
    ├── type: 'message_done' → Messages state
    │
    ▼
Message.create() → SQLite → Response complete
```

### 2. Session Sync Pattern

```
FILESYSTEM = SOURCE OF TRUTH

~/.claude/projects/{workspace-slug}/{session-id}.jsonl
    │
    ▼
WorkspaceManager.discoverWorkspaces()
    │
    ▼
SessionImporter.importAll()
    │
    ▼
SQLite (cache only) → Frontend Sidebar
```

## Key Components

### Backend Services

| Service | Purpose |
|---------|---------|
| `ClaudeWrapper` | Spawns Claude CLI, parses output, handles DeepSeek/GLM |
| `CodexWrapper` | Spawns Codex CLI with reasoning effort control |
| `GeminiWrapper` | Spawns Gemini CLI with session management |
| `BaseCliWrapper` | Process tracking, interrupt capability (ESC/SIGINT) |
| `SessionManager` | Conversation ↔ Session mapping, cross-engine bridging |
| `WorkspaceManager` | Discovers workspaces from CLI projects directories |
| `OutputParser` | Parses JSON stream from CLIs into status events |

### Frontend Hooks

| Hook | Purpose |
|------|---------|
| `useTheme` | Dark/light theme with localStorage persistence |
| `useAutoSTT` | Speech-to-text (Whisper or browser) |
| `useWakeLock` | Prevent Android device sleep |
| `useJobStream` | SSE event processing |

## Database Schema

```sql
-- Core tables
conversations (id, title, created_at, updated_at, metadata)
messages (id, conversation_id, role, content, engine, created_at, metadata)
sessions (id, engine, workspace_path, conversation_id, title, last_activity)
users (id, username, password_hash, role, is_locked, locked_until)

-- Performance indexes
idx_sessions_workspace_path
idx_conversations_updated_at
idx_sessions_id_workspace
```

## Security

- JWT authentication with configurable expiry (default 7 days)
- bcrypt password hashing (10 salt rounds)
- Rate limiting on chat endpoints (10 req/min/user)
- HTTPS auto-setup with self-signed certificates
- Dangerous command filtering (rm -rf, kill -9, etc.)

## Ports

| Port | Protocol | Use |
|------|----------|-----|
| 41800 | HTTP | Local access |
| 41801 | HTTPS | Remote access, microphone (browser security) |
