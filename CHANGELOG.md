# Changelog

All notable changes to this project will be documented in this file.

## [0.9.3] - 2025-12-19
### Fixed
- Normalize Termux workspace paths (auto-correct `/data/data/com/termux/...`) to prevent Claude spawn ENOENT and stalled GLM-4.6/DeepSeek runs.
- Workspaces API now filters and merges invalid paths to keep the UI dropdown clean.
- Session importer reads `cwd` from Claude session files when available for accurate workspace mapping.

