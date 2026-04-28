---
phase: 07-composite-tools
plan: "01"
subsystem: handlers
tags:
  - refactor
  - handler-extraction
  - typescript
dependency_graph:
  requires: []
  provides:
    - src/handlers.ts (createSession, runPrompt, getDiff, RunPromptOptions)
  affects:
    - src/index.ts (three tool handlers now delegate to handlers.ts)
tech_stack:
  added: []
  patterns:
    - Handler extraction: SDK calls moved to named async functions accepting client as first param
    - AbortError propagation: runPrompt does not catch AbortError; caller owns timeout/abort logic
    - Unified diff patch: getDiff appends patch string via createPatch from diff package
key_files:
  created:
    - src/handlers.ts
  modified:
    - src/index.ts
decisions:
  - Client passed as first parameter to all handler functions; no exported client global — keeps handlers testable and stateless
  - AbortController and timer stay in src/index.ts (TIMEOUT_MS belongs there); runPrompt only receives the signal
  - PartSchema and createPatch imports removed from src/index.ts after extraction (unused)
metrics:
  duration: "~4 minutes"
  completed: "2026-04-28T19:13:59Z"
  tasks_completed: 2
  files_changed: 2
---

# Phase 7 Plan 01: Handler Extraction Summary

**One-liner:** Extracted createSession/runPrompt/getDiff into src/handlers.ts with AbortError propagation and diff patch computation, leaving all 18 tool registrations and AbortController logic untouched in src/index.ts.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/handlers.ts with createSession, runPrompt, getDiff | 42024d9 | src/handlers.ts (created) |
| 2 | Update src/index.ts to call extracted handlers | 6a13803 | src/index.ts (modified) |

## What Was Built

Created `src/handlers.ts` with three named async handler functions:

- `createSession(client, title, directory)` — wraps `client.session.create`, throws on API error, returns session object with `.id`
- `runPrompt(client, sessionId, prompt, opts, directory, signal)` — wraps `client.session.prompt` with PartSchema validation; propagates AbortError to caller (no try/catch)
- `getDiff(client, sessionId, messageID, directory)` — wraps `client.session.diff` and appends `patch: createPatch(d.file, d.before, d.after)` to each FileDiff entry

Updated `src/index.ts` to:
- Import `{ createSession, runPrompt, getDiff }` from `./handlers.js`
- Replace the inline SDK call bodies of `opencode_create_session`, `opencode_run`, and `opencode_get_diff` with single delegation calls
- Remove now-unused `PartSchema` and `createPatch` imports (moved to handlers.ts)
- Preserve all 18 registerTool registrations, all inputSchemas, TIMEOUT_MS, and AbortController/timer logic unchanged

## Verification Results

- `npm run build` exits 0 (TypeScript clean)
- `npm test` exits 0 (34/34 tests pass)
- `grep -c "registerTool" src/index.ts` = 18
- `grep "AbortError" src/handlers.ts` returns comment only (no catch)
- `grep "try {" src/handlers.ts` returns nothing

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Cleanup] Removed unused imports from src/index.ts**
- **Found during:** Task 2
- **Issue:** After delegating to handlers.ts, `PartSchema` (from ./parts.js) and `createPatch` (from diff) were no longer referenced in src/index.ts — only used in a comment
- **Fix:** Removed both unused imports from src/index.ts; also removed `RunPromptOptions` from the handlers import line since it is not referenced directly in index.ts
- **Files modified:** src/index.ts
- **Commit:** 6a13803

The plan specified removing `createPatch` if it was the only user; both `createPatch` and `PartSchema` were removed as they are fully moved to handlers.ts. Build remained clean after removal.

## Known Stubs

None. All three handler functions are fully wired with real SDK calls.

## Threat Flags

No new network endpoints, auth paths, or trust boundaries introduced. This is a pure internal refactor — existing SDK call paths remain identical, only moved to a named function layer.

## Self-Check: PASSED

- [x] src/handlers.ts exists: confirmed
- [x] src/index.ts updated: confirmed
- [x] Commit 42024d9 exists: `git log --oneline | grep 42024d9` — found
- [x] Commit 6a13803 exists: `git log --oneline | grep 6a13803` — found
- [x] npm run build exits 0: confirmed
- [x] npm test 34/34 pass: confirmed
- [x] 18 registerTool calls preserved: confirmed
