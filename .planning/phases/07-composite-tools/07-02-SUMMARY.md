---
phase: 07-composite-tools
plan: "02"
subsystem: composite-tools
tags:
  - composite-tools
  - typescript
  - workflow
dependency_graph:
  requires:
    - src/handlers.ts (createSession, runPrompt, getDiff from plan 07-01)
  provides:
    - opencode_delegate (blocking composite: session+run+diff in one call)
    - opencode_dispatch (non-blocking composite: session+promptAsync)
    - opencode_inspect (parallel snapshot: status+todos+changedFiles)
    - opencode_await (poll loop: status until idle, reconstruct result+diff)
  affects:
    - src/index.ts (4 new tool registrations, 2 re-added imports)
tech_stack:
  added: []
  patterns:
    - Composite tool: sequential await calls wrapping extracted handler functions
    - AbortController timeout pattern: clearTimeout in both success and catch branches
    - Parallel SDK fetch: Promise.all of three session endpoints in opencode_inspect
    - Poll loop: while(true) with deadline check and configurable pollIntervalMs
    - Global status map indexing: session.status() returns map[sessionId] (no path param)
key_files:
  created: []
  modified:
    - src/index.ts (4 new registerTool registrations, re-added PartSchema + createPatch imports)
decisions:
  - Static imports used for PartSchema and createPatch in opencode_await (no dynamic import())
  - session.status() called without path param (global endpoint) — status indexed by sessionId from response map
  - session.todo() called with path.id (required param) — distinct from session.status() behavior
  - opencode_delegate never auto-deletes session after completion (D-06 — caller decides lifecycle)
  - Undefined status entry in opencode_await treated as idle (session may complete before first poll)
  - opencode_await timeout returns isError:true with sessionId in payload so caller can inspect/abort
metrics:
  duration: "~2 minutes"
  completed: "2026-04-28T19:19:28Z"
  tasks_completed: 2
  files_changed: 1
---

# Phase 7 Plan 02: Composite Tools Summary

**One-liner:** Four composite MCP tools registered in src/index.ts — opencode_delegate (blocking session+run+diff), opencode_dispatch (non-blocking fire-and-forget), opencode_inspect (parallel status+todos+changedFiles snapshot), opencode_await (poll-until-idle with result reconstruction).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add opencode_delegate and opencode_dispatch | a5d2267 | src/index.ts (modified) |
| 2 | Add opencode_inspect and opencode_await | cc4967d | src/index.ts (modified) |

## What Was Built

Added four composite tool registrations to `src/index.ts`:

**opencode_delegate** (WORKFLOW-01, WORKFLOW-02):
- Blocking composite: `createSession` → `runPrompt` → `getDiff` in one call
- Returns `{ sessionId, result, diff }` — same shapes as the three atomic tools
- AbortController fires after `TIMEOUT_MS`; on AbortError, calls `client.session.abort()` (with `.catch(() => {})` to suppress secondary errors) and returns `isError: true`
- Session kept alive after completion — no auto-delete (D-06)

**opencode_dispatch** (WORKFLOW-03):
- Non-blocking composite: `createSession` → `client.session.promptAsync` → returns `{ sessionId }` immediately
- Same model/agent/system override fields as `opencode_run`
- Agent runs in background; caller uses `opencode_await` or `opencode_inspect` to track

**opencode_inspect** (WORKFLOW-04):
- Compact snapshot via `Promise.all` of three parallel SDK calls
- `session.status()` called without path (global endpoint); status extracted by indexing response map: `(data as Record<string, { type: string }>)[sessionId]?.type ?? 'unknown'`
- `session.todo({ path: { id: sessionId } })` — path.id required
- `session.diff()` mapped to `{ file, additions, deletions }` only — no patch content (D-10)
- Returns `{ status, todos, changedFiles }`

**opencode_await** (WORKFLOW-05, WORKFLOW-06):
- Poll loop: `while (true)` checks `session.status()` until `statusEntry.type === 'idle'` or entry is undefined (treated as idle — session completed before first poll)
- Deadline check `Date.now() + pollIntervalMs >= deadline` before each sleep prevents overrun
- On timeout: returns `isError: true` with `{ error: "...timed out...", sessionId }` payload (D-15)
- On idle: fetches messages+diff via `Promise.all`, filters for last assistant message by `info.role === 'assistant'`
- Validates parts with `PartSchema.array().parse()` — same as `opencode_run`
- Diff mapped with `createPatch(d.file, d.before, d.after)` — same as `getDiff` in handlers.ts
- Returns `{ result: { info, parts }, diff }` — same shape as `opencode_delegate` (D-13)

Re-added static imports to `src/index.ts`:
- `import { createPatch } from 'diff'` — removed by Plan 07-01 since it moved to handlers.ts; needed here for opencode_await's diff mapping
- `import { PartSchema } from './parts.js'` — removed by Plan 07-01; needed here for opencode_await's parts validation

## Verification Results

- `npm run build` exits 0 (TypeScript clean)
- `npm test` exits 0 (34/34 tests pass)
- `grep -c "registerTool" src/index.ts` = 22 (18 existing + 4 new)
- `grep "await import(" src/index.ts` = no matches (no dynamic imports)
- `grep "session.status" src/index.ts | grep "path:"` = no matches (global endpoint, no path param)
- `grep "session.todo" src/index.ts | grep "path:"` = match with `path: { id: sessionId }` (required)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Cleanup] Re-added PartSchema and createPatch static imports**
- **Found during:** Task 2 pre-implementation analysis
- **Issue:** Plan 07-01 Summary explicitly noted that PartSchema and createPatch were removed from src/index.ts as unused after handler extraction. The plan's IMPORTANT note warned this would happen and instructed re-adding them as static imports for opencode_await.
- **Fix:** Added `import { createPatch } from 'diff'` and `import { PartSchema } from './parts.js'` back to src/index.ts top-level imports at Task 1 time (before opencode_await needed them), preventing dynamic import() usage.
- **Files modified:** src/index.ts
- **Commit:** a5d2267

## Known Stubs

None. All four composite tools are fully wired with real SDK calls. No hardcoded values, placeholder text, or unconnected data flows.

## Threat Flags

No new network endpoints or auth paths introduced. All four tools communicate exclusively with the already-established OpenCode localhost endpoint via the existing `client` instance. The threat mitigations specified in the plan's threat register (T-07-02-01 through T-07-02-05) are all implemented:

- T-07-02-01: `timeoutMs` caps poll duration; deadline check prevents overrun; isError:true on timeout
- T-07-02-02: `clearTimeout(timer)` in both success and catch branches; `session.abort()` called on AbortError

## Self-Check: PASSED

- [x] src/index.ts exists and modified: confirmed
- [x] Commit a5d2267 exists: `git log --oneline | grep a5d2267` — found
- [x] Commit cc4967d exists: `git log --oneline | grep cc4967d` — found
- [x] `grep -c "registerTool" src/index.ts` = 22: confirmed
- [x] `npm run build` exits 0: confirmed
- [x] `npm test` 34/34 pass: confirmed
- [x] No dynamic imports: confirmed
- [x] No STATE.md or ROADMAP.md modifications: confirmed
