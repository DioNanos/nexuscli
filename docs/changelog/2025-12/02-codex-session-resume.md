# 2025-12-02 Codex session resume fix

## Summary
- Fix session loader to use Codex native threadId (`session_path`) and locate rollout files under nested `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`.
- Normalize Codex JSONL entries, skipping meta events and handling payload-based content/roles.
- Expose threadId to `/sessions/:id/messages` and delete endpoint so Codex chats appear and can be cleaned up correctly.

## Testing
- Manual: not run (pending user request). Recommend `npm install -g .` then `nexuscli` Codex chat → verify history visible via `GET /api/v1/sessions/:id/messages`.
