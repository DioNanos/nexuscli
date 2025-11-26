# Default Model Validation & Safe Init Guard

**Date**: 2025-11-26  
**Type**: Fix  
**Files Modified**:
- `lib/config/models.js`
- `lib/server/routes/models.js`
- `lib/server/routes/config.js`
- `lib/cli/model.js`
- `frontend/src/components/Chat.jsx`

---

## Summary
- Centralized the model catalog in `lib/config/models.js` and reused it across backend, CLI, and frontend.
- Prevented `nexuscli model` from running on uninitialized setups to avoid configs with null auth hashes.
- Validated `defaultModel` end-to-end: CLI rejects unknown IDs, API sanitizes/normalizes, frontend only applies if available.
- Ensured the frontend falls back safely when the preferred model is invalid or missing from the catalog.

---

## Details
- Added shared helpers (`getCliTools`, `isValidModelId`, `getDefaultModelId`) to keep models consistent.
- `/api/v1/models` now serves data from the shared catalog; engine-specific lookup reuses the same source.
- `/api/v1/config` sanitizes `preferences.defaultModel` and falls back to a valid catalog default to avoid broken UI/requests.
- `nexuscli model` now refuses to run when not initialized and rejects invalid model IDs with a guided list.
- Chat UI defers applying the preferred model until models are loaded; drops invalid values instead of breaking requests.

---

## Tests
- Manual: `nexuscli model bad-id` → rejection with model list.
- Manual: `nexuscli model <valid>` on uninitialized setup → prompt to run `nexuscli init`, no config created with null hashes.
- Manual: `/api/v1/config` returns valid `defaultModel` and frontend keeps working when config contains an invalid model.
