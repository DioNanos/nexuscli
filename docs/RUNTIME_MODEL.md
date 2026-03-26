# Runtime Model

## Overview

NexusCLI models execution with five explicit identifiers:

- `engine`
- `lane`
- `runtimeId`
- `providerId`
- `modelId`

This replaces the old engine-only approach where a single hardcoded model list and a single binary were assumed per provider.

## Core Terms

### Engine

Top-level product family:

- `claude`
- `codex`
- `gemini`
- `qwen`

### Lane

Execution mode inside an engine:

- `native`
- `custom`

### Runtime

Concrete CLI command used by a lane, for example:

- `claude`
- `codex`
- `codex-lts`
- `gemini`
- `qwen`

### Provider

Upstream or compatible API endpoint behind a custom lane:

- `anthropic`
- `openai`
- `google`
- `qwen`
- `deepseek`
- `zai`
- `alibaba`
- `chutes`
- `minimax`

### Model

Selected model identifier inside that engine/lane/provider combination.

## Current Rules

### Claude

- `native` uses the latest `claude` CLI
- `custom` also uses `claude`, but injects provider-specific `ANTHROPIC_*` env overrides

### Codex

- `native` uses the latest `codex`
- `custom` uses `codex-lts`
- custom Codex lanes inject provider-specific config overrides for compatible gateways

### Gemini / Qwen

- both already participate in the same runtime-aware catalog
- current implementation is strongest on native lanes

## Persistence

Runtime-aware metadata is stored on:

- `sessions.lane`
- `sessions.runtime_id`
- `sessions.provider_id`
- `sessions.model_id`
- `messages.lane`
- `messages.runtime_id`
- `messages.provider_id`
- `messages.model_id`

This allows resume/import/history logic to understand how a conversation was actually executed.

## API Surface

Relevant endpoints:

- `GET /api/v1/models`
- `GET /api/v1/config`
- `GET /api/v1/runtimes`
- `POST /api/v1/runtimes/check`
- `POST /api/v1/runtimes/install`
- `POST /api/v1/runtimes/update`

Chat requests can include:

- `model`
- `lane`
- `runtimeId`

## Why This Exists

Without the runtime model, the UI can list a model that the local subsystem cannot actually execute.

With the runtime model:

- the catalog knows whether a model is `native` or `custom`
- the runtime layer knows which binary and provider configuration must be used
- the UI can display availability and update/install actions
- persisted sessions carry enough metadata for audit and debugging
