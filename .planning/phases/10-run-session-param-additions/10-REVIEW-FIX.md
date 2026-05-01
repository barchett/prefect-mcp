---
phase: 10-run-session-param-additions
fixed_at: 2026-05-01T00:00:00Z
review_path: .planning/phases/10-run-session-param-additions/10-REVIEW.md
iteration: 1
fix_scope: critical_warning
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 10: Code Review Fix Report

**Fixed at:** 2026-05-01
**Source review:** .planning/phases/10-run-session-param-additions/10-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: files[].url accepts any string — no scheme validation

**Files modified:** `src/index.ts`
**Commit:** fcdc674
**Applied fix:** Added `.refine((u) => u.startsWith('file://'), ...)` to the `url` field in the `files` array schema in both `prefect_run` and `prefect_prompt_async`. Non-file:// URIs now fail Zod validation before reaching the API.

### WR-02: agentInput and agent can be set simultaneously with no conflict detection

**Files modified:** `src/index.ts`
**Commit:** fcdc674
**Applied fix:** Added `.refine((v) => !(v.agent && v.agentInput), ...)` to the inputSchema of both `prefect_run` and `prefect_prompt_async`. Callers who supply both agent and agentInput now receive a clear validation error.

### WR-03: prefect_delegate and prefect_dispatch silently ignore new Phase 10 parameters

**Files modified:** `src/index.ts`
**Commit:** fcdc674
**Applied fix:** Updated descriptions of `prefect_delegate` and `prefect_dispatch` to explicitly note they do not support tools/files/messageID/agentInput/subtaskInput, and direct callers to use the primitives directly for those features.

---

_Fixed: 2026-05-01_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
