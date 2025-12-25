# NexusCLI API Reference

Base URL: `http://localhost:41800` / `https://localhost:41801`
Version: `0.9.4`

## Authentication

All protected endpoints require JWT token in Authorization header:

```
Authorization: Bearer <token>
```

### Login

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "user",
  "password": "pass"
}
```

Response:
```json
{
  "token": "eyJhbGc...",
  "user": {
    "id": "uuid",
    "username": "user",
    "role": "admin"
  }
}
```

---

## Chat Endpoints

### Claude Chat

```http
POST /api/v1/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Hello",
  "model": "claude-sonnet-4-5-20250929",
  "conversationId": "optional-uuid",
  "workspace": "/path/to/workspace"
}
```

Response: Server-Sent Events (SSE) stream

### Codex Chat

```http
POST /api/v1/codex
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Hello",
  "model": "gpt-5.1",
  "conversationId": "optional-uuid"
}
```

### Gemini Chat

```http
POST /api/v1/gemini
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "Hello",
  "model": "gemini-3-pro",
  "conversationId": "optional-uuid"
}
```

---

## Speech-to-Text

### Check OpenAI Key

```http
GET /api/v1/keys/check/openai
```

Response:
```json
{
  "exists": true
}
```

### Transcribe Audio

```http
POST /api/v1/speech/transcribe
Authorization: Bearer <token>
Content-Type: multipart/form-data

audio: <audio file (webm/opus)>
language: "it" (optional)
```

Response:
```json
{
  "text": "Transcribed text..."
}
```

---

## Models

### List Available Models

```http
GET /api/v1/models
```

Response:
```json
{
  "models": [
    {
      "id": "claude-sonnet-4-5-20250929",
      "name": "Claude Sonnet 4.5",
      "engine": "claude"
    }
  ]
}
```

---

## Workspaces

### List Workspaces

```http
GET /api/v1/workspaces
Authorization: Bearer <token>
```

### Mount Workspace

```http
POST /api/v1/workspaces/:id/mount
Authorization: Bearer <token>
```

### Get Sessions

```http
GET /api/v1/workspaces/:id/sessions
Authorization: Bearer <token>
```

---

## Sessions

### Get Session Messages

```http
GET /api/v1/sessions/:id/messages
Authorization: Bearer <token>
```

Query params:
- `limit` - Max messages (default: 30)
- `before` - Timestamp filter for pagination
- `mode` - `asc` (default) or `desc`

### Import Native Sessions (Claude/Codex/Gemini)

```http
POST /api/v1/sessions/import
Authorization: Bearer <token>
```

Response:
```json
{
  "success": true,
  "imported": { "claude": 12, "codex": 3, "gemini": 1 }
}
```

---

## Health

### Health Check

```http
GET /health
```

Response:
```json
{
  "status": "ok",
  "service": "nexuscli-backend",
  "version": "0.9.4",
  "engines": ["claude", "codex", "gemini"],
  "port": 41800
}
```

---

## Error Responses

```json
{
  "error": "Error message",
  "status": 400
}
```

Common status codes:
- `400` - Bad request
- `401` - Unauthorized
- `404` - Not found
- `500` - Server error
