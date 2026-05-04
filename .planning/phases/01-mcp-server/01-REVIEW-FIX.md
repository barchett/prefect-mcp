---
phase: 01-mcp-server
fixed_at: 2026-05-03T00:00:00Z
review_path: .planning/phases/01-mcp-server/01-REVIEW.md
iteration: 2
fix_scope: critical_warning_info
findings_in_scope: 6
fixed: 6
skipped: 0
status: all_fixed
---

# Phase 01: Code Review Fix Report

**Fixed at:** 2026-05-01
**Source review:** .planning/phases/01-mcp-server/01-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 4
- Skipped: 0

All four warnings were already resolved by subsequent phase work. No new commits required.

## Fixed Issues

### WR-01: Zod v4 incompatibility with MCP SDK 1.x

**Status:** Already resolved
**How:** `@modelcontextprotocol/sdk` updated its `dependencies` and `peerDependencies` to `"zod": "^3.25 || ^4.0"`, explicitly supporting Zod v4. Current install (`zod@4.3.6`) is within the supported range.

### WR-02: `String(data)` silently drops structured response objects

**Status:** Already resolved
**How:** Both `prefect_approve_permission` and `prefect_revert` now return `JSON.stringify(data)`. The only remaining `String(data)` call (line 70) is the `prefect_abort` handler, which the original review explicitly flagged as correct (abort returns a bare boolean).

### WR-03: `opencode_fork` passes empty object body instead of omitting body

**Status:** Already resolved
**How:** Fork handler now uses `...(messageID ? { body: { messageID } } : {})` — the spread produces no `body` property when `messageID` is absent, equivalent to passing `undefined`.

### WR-04: `opencode_run` has no timeout

**Status:** Already resolved
**How:** `TIMEOUT_MS` constant (line 23) reads `PREFECT_TIMEOUT_MS` env var with a 120 s default. The `prefect_run` handler uses `AbortController` to cancel the in-flight request on timeout (line 138), returning an `isError` response instead of hanging.

## Info Fixes (iteration 2)

### IN-01: Pin @types/node floating version

**Status:** Fixed
**Commit:** ceb4c84
**How:** Pinned `@types/node` from `"^20.0.0"` to `"25.6.0"` (the installed version) in `package.json`.

### IN-02: `undefined` title property in session create body

**Status:** Already resolved
**How:** `src/handlers.ts` `createSession` already uses `...(title !== undefined ? { title } : {})`. No code change needed.

---

_Fixed: 2026-05-01 (iteration 1), 2026-05-03 (iteration 2)_
_Fixer: Claude (manual audit — all issues resolved by subsequent phases)_
_Iteration: 2_
