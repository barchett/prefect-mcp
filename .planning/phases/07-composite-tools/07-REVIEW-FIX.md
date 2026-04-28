---
phase: 07-composite-tools
fixed_at: 2026-04-28T00:00:00Z
review_path: .planning/phases/07-composite-tools/07-REVIEW.md
iteration: 1
findings_in_scope: 4
fixed: 3
skipped: 1
status: partial
---

# Phase 7: Code Review Fix Report

**Fixed at:** 2026-04-28
**Source review:** .planning/phases/07-composite-tools/07-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 4
- Fixed: 3
- Skipped: 1

## Fixed Issues

### WR-01: Off-by-one in `opencode_await` deadline check causes premature timeout

**Files modified:** `src/index.ts`
**Commit:** 302c7b2
**Applied fix:** Replaced `if (Date.now() + pollIntervalMs >= deadline)` with `if (Date.now() >= deadline)` at line 713. The guard now fires only when the deadline has actually passed, not when the elapsed time of a slow status call would leave less than one full `pollIntervalMs` remaining.

---

### WR-02: `opencode_delegate` timeout handler skips session abort when session creation fails mid-call

**Files modified:** `src/index.ts`
**Commit:** bb54052
**Applied fix:** Removed the `&& sessionId` guard from the `AbortError` check in the `opencode_delegate` catch block. The handler now always detects `AbortError` regardless of whether `sessionId` was assigned. When `sessionId` is set it still aborts the session; when it is undefined (abort fired during `createSession`) it returns a descriptive message "during session creation" instead of falling through to the raw `String(err)` path.

---

### WR-04: Non-null assertion `data!` in `handlers.ts` bypasses null safety

**Files modified:** `src/handlers.ts`
**Commit:** 642c216
**Applied fix:** Added explicit null guards after the error checks in both `createSession` (line 29) and `runPrompt` (line 60). The `data!` assertions on both locations were replaced with `if (!data) throw new Error('...: API returned no data and no error')` followed by plain `data` access. All 39 tests pass after this change.

---

## Skipped Issues

### WR-03: `getDiff` call in `opencode_delegate` is outside the abort timeout window

**File:** `src/index.ts:587`
**Reason:** Code already correct — finding does not apply to the actual source. The reviewer's description states "clearTimeout is in catch" and that there is no `clearTimeout` before `getDiff`. However, the actual code at lines 585-587 reads: `runPrompt(...)` on line 585, `clearTimeout(timer)` on line 586, `getDiff(...)` on line 587. The `clearTimeout` is already placed immediately after `runPrompt` and before `getDiff`, exactly as the fix suggests. No change was needed.
**Original issue:** `clearTimeout(timer)` only fires in the catch block, leaving `getDiff` unguarded by the timeout.

---

_Fixed: 2026-04-28_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
