## Overview

NexusCLI is a lightweight AI cockpit that orchestrates Claude Code, Codex CLI, Gemini CLI, and Qwen Code from a single web and terminal interface.

The project is runtime-aware:

- each engine can expose `native` and `custom` lanes
- model selection is tied to a concrete runtime
- the UI can inspect runtime availability and update state
- sessions and messages persist runtime metadata in the local database

NexusCLI is `npm-first` and targets Linux, macOS, and Termux without requiring desktop-native builds for the core application.

---

## Features

- Multi-engine orchestration for Claude, Codex, Gemini, and Qwen
- Runtime-aware model catalog with `native` and `custom` lanes
- SSE streaming with realtime tool and status updates
- Interrupt and resume support per engine
- Session import and history sync from native CLI stores
- Workspace isolation, switching, and history
- File and image attachments where supported
- Runtime inventory API and UI runtime manager
- Conversation search, bookmark/pin, and job runner API
- Voice input support with HTTPS auto-setup

---

## Current Model Support

| Engine | Lane | Examples |
|--------|------|----------|
| Claude | Native | `sonnet`, `opus`, `haiku` |
| Claude | Custom | `deepseek-*`, `glm-4.7`, `glm-5`, `qwen3.5-plus`, `qwen3-max-2026-01-23`, `kimi-k2.5`, `MiniMax-M2.7` |
| Codex | Native | `gpt-5.4`, `gpt-5.3-codex`, `gpt-5.2-codex`, `gpt-5.1-codex-max`, `codex-mini-latest` |
| Codex | Custom | `qwen3-coder-plus`, `qwen3-coder-next`, `qwen3.5-plus`, `glm-5`, `deepseek-ai/DeepSeek-V3.2-TEE` |
| Gemini | Native | `gemini-3-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-pro`, `gemini-2.5-flash` |
| Qwen | Native | `qwen3-coder-plus`, `qwen3-coder-next`, `qwen3.5-plus`, `qwen3-max` |
| Qwen | Custom | `glm-4.7`, `kimi-k2.5` |

See [docs/RUNTIME_MODEL.md](docs/RUNTIME_MODEL.md) for the runtime model and provider mapping.

---

## Install

```bash
npm install -g @mmmbuto/nexuscli
```

Then initialize:

```bash
nexuscli init
```

And start the server:

```bash
nexuscli start
```

---

## Runtime Management

NexusCLI separates:

- `engine`
- `lane`
- `runtime`
- `provider`
- `model`

Runtime inventory is available through:

- UI runtime manager
- `GET /api/v1/runtimes`
- `POST /api/v1/runtimes/check`
- `POST /api/v1/runtimes/install`
- `POST /api/v1/runtimes/update`

---

## API Keys

Provider keys can be stored locally via:

```bash
nexuscli api list
nexuscli api set deepseek <key>
nexuscli api set zai <key>
nexuscli api set alibaba <key>
nexuscli api set chutes <key>
nexuscli api set minimax <key>
nexuscli api set openai <key>
```

These keys are used only for custom provider lanes that need compatible API routing.

---

## Commands

| Command | Description |
|---------|-------------|
| `nexuscli init` | Setup wizard |
| `nexuscli start` | Start server |
| `nexuscli stop` | Stop server |
| `nexuscli status` | Show server status |
| `nexuscli engines` | Inspect/configure runtime-aware engines |
| `nexuscli model` | Set/get default model |
| `nexuscli config` | Read/edit configuration |
| `nexuscli api` | Manage provider API keys |
| `nexuscli workspaces` | Manage workspaces |
| `nexuscli logs` | View server logs |
| `nexuscli setup-termux` | Termux bootstrap helpers |
| `nexuscli update` | Update NexusCLI |
| `nexuscli uninstall` | Remove NexusCLI |

---

## Network Access

| Protocol | Default Port | Use Case |
|----------|--------------|----------|
| HTTP | `41800` | Local access |
| HTTPS | `41801` | Remote access and browser microphone support |

HTTPS certificates are auto-generated on first run.

---

## Development

```bash
git clone <upstream-or-fork-url> nexuscli
cd nexuscli
npm install
cd frontend && npm install && npm run build && cd ..
npm run dev
```

---

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [docs/API.md](docs/API.md)
- [docs/GUIDE.md](docs/GUIDE.md)
- [docs/RUNTIME_MODEL.md](docs/RUNTIME_MODEL.md)
- [docs/PTY_ARCHITECTURE.md](docs/PTY_ARCHITECTURE.md)

---

## License

MIT License. See [LICENSE](LICENSE).
