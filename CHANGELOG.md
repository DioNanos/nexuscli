# Changelog

All notable changes to this project will be documented in this file.

## [0.9.7-termux] - 2025-12-28
### Added
- QWEN engine integration (Qwen Code CLI) with SSE streaming.
- QWEN models in catalog: `coder-model`, `vision-model`.
- QWEN session import + resume support.
### Changed
- Statusbar now reflects QWEN tool activity in real time (stream-json parsing).

## [0.9.6] - 2025-12-26
### Fixed
- Restore Jobs CLI wrapper and Termux PTY adapter removed during cleanup.
- Use Termux-safe shell/runtime resolution for job execution (no hardcoded /bin or /usr/bin paths).
- Surface job stream errors correctly in the UI.

## [0.9.5] - 2025-12-25
### Added
- GPT-5.2 Codex set as default Codex model.
### Changed
- Updated Codex model catalog to match OpenAI CLI.
### Fixed
- i18n import after cleanup.

## [0.9.4] - 2025-12-25
### Added
- Dark/Light theme toggle with CSS variables and localStorage persistence.
- Rate limiting on chat endpoints (10 req/min per user).
- Architecture documentation (`docs/ARCHITECTURE.md`).

## [0.9.3] - 2025-12-19
### Fixed
- Normalize Termux workspace paths (auto-correct `/data/data/com/termux/...`) to prevent Claude spawn ENOENT and stalled GLM-4.6/DeepSeek runs.
- Workspaces API now filters and merges invalid paths to keep the UI dropdown clean.
- Session importer reads `cwd` from Claude session files when available for accurate workspace mapping.
