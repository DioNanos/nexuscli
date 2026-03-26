# NexusCLI Architecture

## Overview

NexusCLI is a runtime-aware AI cockpit that orchestrates Claude Code, Codex CLI, Gemini CLI, and Qwen Code through a unified web interface with SSE streaming.

The key architectural change is that execution is no longer modeled as `engine only`. Every request is resolved through:

- `engine`
- `lane`
- `runtime`
- `provider`
- `model`

## High-Level Layers

### Frontend

- React application
- SSE stream consumer for live status
- model picker split by `native` / `custom`
- runtime manager for install/update/check actions

### Backend

- Express routes per engine
- runtime inventory and resolution via `RuntimeManager`
- wrapper services for Claude, Codex, Gemini, and Qwen
- `SessionManager` for resume and conversation/session mapping

### Persistence

- `sql.js` SQLite storage
- migration-based schema evolution
- runtime-aware metadata on sessions and messages

## Request Flow

1. UI sends `model`, optional `lane`, optional `runtimeId`.
2. `RuntimeManager.resolveRuntimeSelection()` resolves:
   - engine
   - lane
   - runtime command
   - provider routing
   - model metadata
3. Engine wrapper receives:
   - runtime command
   - env overrides
   - provider auth metadata
   - optional config overrides
4. Wrapper spawns the CLI and streams parsed status events.
5. Sessions and messages are persisted with runtime-aware metadata.

## Runtime Rules

### Claude

- `native` uses the latest `claude` CLI
- `custom` also uses `claude`, but injects provider-specific `ANTHROPIC_*` overrides

### Codex

- `native` uses the latest `codex`
- `custom` uses `codex-lts`
- custom Codex lanes inject provider-specific config overrides for compatible gateways

### Gemini / Qwen

- both participate in the same runtime-aware catalog
- native lanes are first-class
- custom lanes are catalog-aware, with staged runtime support

## Database Schema

```sql
conversations (
  id, title, created_at, updated_at, metadata
)

messages (
  id, conversation_id, role, content, engine,
  lane, runtime_id, provider_id, model_id,
  created_at, metadata
)

sessions (
  id, engine, workspace_path, conversation_id, title,
  lane, runtime_id, provider_id, model_id,
  last_used_at, created_at, message_count
)
```

## Core Services

| Service | Purpose |
|---------|---------|
| `RuntimeManager` | Runtime catalog, lane resolution, inventory, install/update actions |
| `ClaudeWrapper` | Claude native/custom execution through a shared CLI |
| `CodexWrapper` | Codex native/custom execution, including `codex-lts` custom lanes |
| `GeminiWrapper` | Gemini execution and session resume |
| `QwenWrapper` | Qwen execution and session resume |
| `SessionManager` | Conversation/session mapping and native resume metadata |
| `WorkspaceManager` | Workspace discovery and session-origin awareness |

## API Surface

Important runtime-aware endpoints:

- `GET /api/v1/models`
- `GET /api/v1/config`
- `GET /api/v1/runtimes`
- `POST /api/v1/runtimes/check`
- `POST /api/v1/runtimes/install`
- `POST /api/v1/runtimes/update`

## Cross-Platform Notes

- NexusCLI itself is `npm-first`
- desktop mode avoids mandatory native PTY builds for the app core
- Termux keeps dedicated bootstrap helpers
- runtime installers are platform-aware but exposed through one inventory/action layer

## Related Docs

- [RUNTIME_MODEL.md](RUNTIME_MODEL.md)
- [API.md](API.md)
- [PTY_ARCHITECTURE.md](PTY_ARCHITECTURE.md)
