---
phase: 14-session-server-routing
fixed_at: 2026-05-03T00:00:00Z
review_path: .planning/phases/14-session-server-routing/14-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 6
fixed: 5
skipped: 1
status: partial
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-05-03
**Source review:** .planning/phases/14-session-server-routing/14-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 6 (3 warnings + 3 info)
- Fixed: 5
- Skipped: 1 (WR-02 — already correct in code as reviewed)

## Fixed Issues

### WR-01: prefect_fork does not persist the new session to sessions.json

**Status:** Fixed
**Commit:** c9460aa
**How:** Added `addSession` import to `src/index.ts`. After a successful fork response, the forked session's ID is now written to `sessions.json` using the parent session's `SessionEntry` (same server, URL, and model). This ensures subsequent tool calls can route to the correct server even after an MCP restart.

### WR-02: Stale-session error message cites wrong server URL

**Status:** Already correct
**How:** The existing code at the `isNotFound` branch in `prefect_fork` already captures `const entry = lookupSession(sessionId)` BEFORE calling `removeSession(sessionId)`. The `entry?.server` reference in the error message therefore uses the pre-deletion value. No code change needed.

### WR-03: Corrupt sessions.json causes hard throw in every tool handler

**Status:** Fixed
**Commit:** c9460aa
**How:** `readSessionMap` in `src/sessions.ts` now catches non-ENOENT errors (corrupt/malformed JSON), logs a `console.error` warning, and returns `{ sessions: {} }` instead of re-throwing. This prevents corrupt files from crashing all tool handlers. Session tests updated to expect recovery behavior.

## Info Fixes

### IN-01: addSession import missing from index.ts

**Status:** Fixed
**Commit:** c9460aa
**How:** Added `addSession` to the import from `./sessions.js` in `src/index.ts`.

### IN-02: Sessions tests expected throws on corrupt input

**Status:** Fixed
**Commit:** c9460aa
**How:** Updated `sessions.test.ts` tests 87 and 88 to assert `deepEqual({ sessions: {} })` instead of `assert.throws`, matching the new recovery behavior.

### IN-03: @types/node floating version

**Status:** Fixed
**Commit:** ceb4c84
**How:** Pinned `@types/node` from `"^20.0.0"` to `"25.6.0"` (the installed version).

---

_Fixed: 2026-05-03_
_Fixer: Claude Code (autonomous fix pass)_
_Iteration: 1_
