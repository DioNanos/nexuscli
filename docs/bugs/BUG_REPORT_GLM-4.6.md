# Bug Report: GLM-4.6 e DeepSeek non funzionano in NexusCLI

## Data
2025-12-19

## Issue
I modelli alternativi (GLM-4.6 da Z.ai e DeepSeek) rimangono in "Processing request" senza produrre output.

## Analisi

### 1. CLI funziona manualmente ✅
```bash
env ANTHROPIC_BASE_URL=https://api.z.ai/api/anthropic \
ANTHROPIC_AUTH_TOKEN=KEY \
ANTHROPIC_MODEL=GLM-4.6 \
claude --print --verbose --output-format stream-json --session-id UUID "test"
```
- Produce correttamente JSON stream
- Risponde con GLM-4.6 model
- Tools funzionano

### 2. Problemi identificati:

#### A. pty-adapter non cattura output ❌
- `/lib/server/lib/pty-adapter.js` usa `child_process.spawn`
- stdout/stderr events non triggerano per GLM/DeepSeek
- Funziona per Claude nativo

#### B. Fix tentati:
1. ✅ Non passare `--model` per modelli alternativi
2. ✅ Timeout dinamico (GLM: 60min, DeepSeek: 15min)
3. ✅ `ANTHROPIC_MODEL` env var configurato
4. ❌ Direct spawn wrapper (non risolve)

### 3. Dati log:
```
[ClaudeWrapper] GLM-4.6 detected - using Z.ai API with extended timeout
[ClaudeWrapper] Model: glm-4-6 (Z.ai API)
[BaseWrapper] Registered pty process
[Nessun output PTY]
```

### 4. Comportamento:
- Processo spawnato (PID visible)
- Nessun stdout/stderr catturato
- Timeout dopo X minuti
- UI rimane "Processing..."

## Possibili cause
1. **Buffering**: GLM potrebbe bufferizzare output diversamente
2. **Encoding**: Output in encoding diverso da atteso
3. **PTY/tty requirements**: GLM potrebbe richiedere vero PTY
4. **Race condition**: Processo termina prima di catturare output

## Raccomandazione
Investigare se GLM/DeepSeek richiedono un vero terminale PTY vs pipe standard. Considerare:
- Usare `node-pty` nativo se disponibile
- Forzare `--force-tty` o opzioni simili
- Testare con `spawn` con `{ tty: true }`

## Fix da applicare
1. Opzione 1: Forzare node-pty per modelli alternativi
2. Opzione 2: Usare ws代理 per GLM/DeepSeek
3. Opzione 3: Limitare a Claude nativo finché non risolto