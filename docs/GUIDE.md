# NexusCLI Guide
Version: 0.7.9

## Quick Start

```bash
# Install
npm install -g @mmmbuto/nexuscli

# Setup
nexuscli init

# Start server
nexuscli start
nexuscli stop                # Stop active generation/server
```

Tip: while the model is generating, use the Stop button (UI) or the interrupt endpoint to halt Claude/Codex/Gemini.

## Voice Input (STT)

NexusCLI supports voice input via OpenAI Whisper.

### Setup

1. Get OpenAI API key from https://platform.openai.com/api-keys

2. Set the key:
```bash
nexuscli api set openai sk-your-api-key
```

3. Start server (HTTPS auto-enabled for mic access):
```bash
nexuscli start
```

4. Access from browser: `https://your-ip:41800`

5. Accept the self-signed certificate warning

6. Click the microphone icon to use voice input

### Remote Access

When accessing from another device (PC, tablet), HTTPS is required for microphone access. NexusCLI automatically generates self-signed certificates during setup.

## CLI Commands

### Server Management

```bash
nexuscli start              # Start server (daemon mode)
nexuscli start --foreground # Start in foreground
nexuscli stop               # Stop server
nexuscli status             # Show server status
```

### API Keys

```bash
nexuscli api list           # List configured keys
nexuscli api set <provider> <key>
nexuscli api delete <provider>
nexuscli api test <provider>
```

Supported providers:
- `openai` - Voice input (Whisper STT)
- `deepseek` - DeepSeek models
- `openrouter` - Multi-provider gateway

### Workspaces

```bash
nexuscli workspaces         # List workspaces
nexuscli workspaces add     # Add workspace
nexuscli workspaces remove  # Remove workspace
nexuscli workspaces scan    # Scan for sessions (Claude); full import via the API endpoint
```

### Session Import (Claude/Codex/Gemini)

- Automatic at backend startup.
- Manual: `POST /api/v1/sessions/import` (admin).

### Engines

```bash
nexuscli engines            # Show available engines
nexuscli engines check      # Check engine status
```

### Users

```bash
nexuscli users list         # List users
nexuscli users add          # Add user
nexuscli users delete       # Delete user
```

## Configuration

Config file: `~/.nexuscli/config.json`

```json
{
  "server": {
    "port": 41800
  },
  "termux": {
    "wake_lock": true,
    "notifications": true
  }
}
```

## Logs

```bash
nexuscli logs               # View server logs
nexuscli logs -f            # Follow logs
```

Log file: `~/.nexuscli/logs/server.log`

## Troubleshooting

### Microphone not working

1. Ensure HTTPS is enabled (check for `https://` in URL)
2. Accept the certificate warning in browser
3. Grant microphone permission when prompted
4. Check OpenAI key is set: `nexuscli api list`

### Server won't start

1. Check if port is in use: `nexuscli status`
2. Stop existing server: `nexuscli stop`
3. Check logs: `nexuscli logs`

### Connection refused

1. Verify server is running: `nexuscli status`
2. Check firewall/network settings
3. Try localhost first: `https://localhost:41800`
