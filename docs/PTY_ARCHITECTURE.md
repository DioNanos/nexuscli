# PTY Architecture for NexusCLI (Termux + Linux ARM64)

**Version**: 1.1.0  
**Date**: 2026-01-09  
**Author**: DioNanos

## Executive Summary

NexusCLI uses the shared library `@mmmbuto/pty-termux-utils` to provide
multi-provider PTY support with graceful fallback. Termux and Linux ARM64
get native PTY when available; all other platforms fall back to a
`child_process` adapter.

**Key Improvements:**
- Shared PTY library across Gemini/Qwen/Nexus
- Multi-provider PTY (Termux + Linux ARM64)
- Debug logging via `PTY_DEBUG=1`
- Backward-compatible wrapper APIs

## Architecture Overview

### PTY Loader Chain (Multi‑Provider)

nexuscli (wrappers)
    ↓
pty-adapter.js (compat API)
    ↓
@mmmbuto/pty-termux-utils.getPty()
    ├─→ @mmmbuto/node-pty-android-arm64 (Termux native)
    ├─→ @lydell/node-pty-linux-arm64 (Linux ARM64 native)
    └─→ null → fallback adapter (child_process)

### Provider Priority
1. Termux → `@mmmbuto/node-pty-android-arm64`
2. Linux ARM64 → `@lydell/node-pty-linux-arm64`
3. Fallback → `child_process` adapter

## Files

### lib/server/lib/pty-provider.js
Shared provider wrapper using `@mmmbuto/pty-termux-utils`.

### lib/server/lib/pty-adapter.js
Compatibility adapter. Sync spawn uses fallback; async spawn uses native if available.

### lib/server/lib/getPty.js
Legacy compatibility wrapper (delegates to shared library).

## Dependencies

### package.json (NexusCLI)
```json
{
  "dependencies": {
    "@mmmbuto/pty-termux-utils": "^1.1.0"
  },
  "optionalDependencies": {
    "@mmmbuto/node-pty-android-arm64": "~1.1.0"
  }
}
```

**Note:** Linux ARM64 provider `@lydell/node-pty-linux-arm64` is listed as an
optional dependency **inside** `@mmmbuto/pty-termux-utils`.

## Installation

```bash
npm install @mmmbuto/nexuscli@latest
```

- Termux: native PTY via `@mmmbuto/node-pty-android-arm64`
- Linux ARM64: native PTY via `@lydell/node-pty-linux-arm64`
- Others: fallback adapter

## Testing

### Test PTY Detection

```bash
cd ~/Dev/nexuscli
PTY_DEBUG=1 node -e "
const getPty = require('./lib/server/lib/getPty');
getPty.getPty().then((pty) => {
  console.log('PTY Available:', !!pty, pty?.name || 'fallback');
});
"
```

### Expected Output (Termux)
```
[PTY] Native module loaded: @mmmbuto/node-pty-android-arm64
[PTY] Using native PTY provider: mmmbuto-node-pty
PTY Available: true mmmbuto-node-pty
```

### Expected Output (Linux ARM64)
```
[PTY] Native module loaded: @lydell/node-pty-linux-arm64
[PTY] Using native PTY provider: lydell-node-pty-linux-arm64
PTY Available: true lydell-node-pty-linux-arm64
```

### Expected Output (Fallback)
```
[PTY] Using fallback PTY adapter with child_process
PTY Available: false fallback
```

## Comparison with Other CLI

| CLI | Platform | PTY Implementation | Fallback | Termux | Linux ARM64 |
|-----|----------|-------------------|---------|--------|-------------|
| **nexuscli** | Termux + Linux ARM64 | shared library | child_process | Yes | Yes |
| **gemini-cli-termux** | Termux + Linux ARM64 | shared library | child_process | Yes | Yes |
| **qwen-code-termux** | Termux + Linux ARM64 | shared library | child_process | Yes | Yes |
| **codex-termux** | Rust | Native PTY | N/A | N/A | N/A |

## Notes

- Shared library is the source of truth for provider logic.
- `getPty.js` is retained for compatibility; avoid adding new logic there.
