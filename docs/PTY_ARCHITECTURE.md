# PTY Architecture for NexusCLI (Termux Only)

**Version**: 0.9.10-termux
**Date**: 2026-01-08
**Author**: DioNanos

## Executive Summary

NexusCLI is Termux-only. Supports PTY detection with automatic fallback to child_process adapter.

**Key Improvements:**
- Added getPty.js for PTY detection (Termux-only)
- Added @mmmbuto/node-pty-android-arm64 as optional dependency
- Maintained backward compatibility with existing pty-adapter.js
- Zero breaking changes to existing wrappers

## Architecture Overview

### PTY Loader Chain (Termux Only)

nexuscli (wrapper)
    ↓
getPty.getPty()  ← NEW: PTY detection
    ├─→ @mmmbuto/node-pty-android-arm64 (native PTY)
    └─→ null → pty-adapter.js (child_process fallback)

## New Files

### lib/server/lib/getPty.js

PTY loader that:
1. Tries @mmmbuto/node-pty-android-arm64
2. Returns null to trigger fallback adapter

### package.json - optionalDependencies

```json
{
  "optionalDependencies": {
    "@mmmbuto/node-pty-android-arm64": "1.1.0"
  }
}
```

## Existing Files (Unchanged)

### lib/server/lib/pty-adapter.js

Fallback adapter using child_process.spawn. Maintains backward compatibility.

### lib/server/services/claude-wrapper.js
### lib/server/services/gemini-wrapper.js
### lib/server/services/codex-wrapper.js

All wrappers currently use pty-adapter directly. No changes required.

## Installation (Termux)

```bash
npm install @mmmbuto/nexuscli@latest
```

- @mmmbuto/node-pty-android-arm64 will be installed (optional, gracefully degrades)
- Fallback to pty-adapter.js works without warnings

## Testing

### Test PTY Detection

```bash
cd ~/Dev/nexuscli
node -e "
const getPty = require('./lib/server/lib/getPty');
console.log('PTY Available:', getPty.isPtyAvailable());
"
```

### Expected Output (without PTY package):

```
PTY Available: false
[getPty] Termux PTY not available, using fallback adapter
[getPty] Using child_process fallback adapter
```

### Expected Output (with PTY package):

```
PTY Available: true
[getPty] Using @mmmbuto/node-pty-android-arm64 (Termux)
```

## Comparison with Other CLI

| CLI | Platform | PTY Implementation | Fallback | Termux Support |
|-----|----------|-------------------|-----------|---------------|
| **nexuscli** | Termux only | getPty.js | pty-adapter.js | Yes (@mmmbuto/node-pty) |
| **gemini-cli-termux** | Termux | getPty.ts | shellExecutionService | Yes (@mmmbuto/node-pty) |
| **qwen-code-termux** | Termux | getPty.ts | shellExecutionService | Yes (@mmmbuto/node-pty) |
| **codex-termux** | Rust | Native PTY | N/A | N/A |

## Notes

- NexusCLI is Termux-only: no desktop support logic
- All wrappers maintain backward compatibility with pty-adapter.js
- Future migration to getPty.js is optional, not required
