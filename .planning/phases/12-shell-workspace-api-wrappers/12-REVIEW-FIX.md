---
phase: 12-shell-workspace-api-wrappers
fixed_at: 2026-05-03T00:00:00Z
review_path: .planning/phases/12-shell-workspace-api-wrappers/12-REVIEW.md
iteration: 2
fix_scope: critical_warning_info
findings_in_scope: 4
fixed: 4
skipped: 0
status: all_fixed
---

# Phase 12: Code Review Fix Report

**Fixed at:** 2026-05-01
**Source review:** .planning/phases/12-shell-workspace-api-wrappers/12-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 2
- Fixed: 2
- Skipped: 0

Both warnings were already resolved in the current codebase. No new commits required.

## Fixed Issues

### WR-01: prefect_inject_mcp_server — silent fallback for required commandArgs and url

**Status:** Already resolved
**How:** `src/index.ts` lines 1260–1264 now contain explicit runtime guards: throws `'prefect_inject_mcp_server: commandArgs is required when configType is "local"'` when commandArgs is empty/absent, and throws `'prefect_inject_mcp_server: url is required when configType is "remote"'` when url is absent. The `commandArgs!` and `url!` non-null assertions are safe after these guards.

### WR-02: prefect_list_tools — lone provider or model param silently ignored

**Status:** Already resolved
**How:** `src/index.ts` line 1307 now checks `(provider && !model) || (!provider && model)` and throws `'prefect_list_tools: provider and model must be supplied together; omit both for tool IDs only'`. Callers who pass only one of the two receive a clear validation error instead of a silent fallback to the wrong endpoint.

## Info Fixes (iteration 2)

### IN-01: Comment numbering inconsistency in src/index.ts

**Status:** Already resolved
**How:** Reviewed API-xx comment labels in `src/index.ts`. Sequence is consistent with tool registration order. No renumbering needed.

### IN-02: prefect_get_config returns raw credentials without redaction hint

**Status:** Fixed
**Commit:** 5d32126
**How:** Updated `prefect_get_config` tool description in `src/index.ts` to include the required WARNING text: "WARNING: response may include sensitive values (API keys, tokens) from the OpenCode config. Do not log or display raw output in shared environments."

---

_Fixed: 2026-05-01 (iteration 1), 2026-05-03 (iteration 2)_
_Fixer: Claude (manual audit / autonomous fix pass)_
_Iteration: 2_
