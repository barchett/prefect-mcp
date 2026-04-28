---
phase: "05"
plan: "01"
subsystem: directory-infrastructure
tags: [refactor, directory, env-var, typescript]
dependency_graph:
  requires: [04-04-SUMMARY.md]
  provides: [resolveDirectory helper, uniform directory param on all 18 tools]
  affects: [src/index.ts]
tech_stack:
  added: []
  patterns: [resolveDirectory three-tier fallback, per-tool env var read at call time]
key_files:
  modified: [src/index.ts]
decisions:
  - resolveDirectory() exported for reuse in Phase 6 auto-start
  - Returns undefined (not process.cwd()) to avoid silently overriding OpenCode session-level directory tracking
  - OPENCODE_DEFAULT_PROJECT read at call time inside resolveDirectory() — not at module scope — so env changes take effect without server restart
metrics:
  duration_seconds: 185
  completed_date: "2026-04-28"
  tasks_completed: 1
  files_modified: 1
---

# Phase 5 Plan 01: Directory Infrastructure Summary

**One-liner:** Uniform `directory` param on all 18 MCP tools with `resolveDirectory()` helper implementing three-tier fallback (per-tool param → `OPENCODE_DEFAULT_PROJECT` → `undefined`).

## What Was Built

Added `resolveDirectory()` exported helper function to `src/index.ts` and updated all 18 MCP tool registrations to use it uniformly.

### resolveDirectory() helper

```typescript
export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}
```

Placed after the constants block, before `const server = ...`. Exported for Phase 6 reuse.

### Tools Updated

**7 tools gained the `directory` param (previously missing):**
- `opencode_abort`
- `opencode_run` (description notes it routes to project, not sets session cwd)
- `opencode_prompt_async` (same routing description)
- `opencode_get_diff` (preserves `messageID` query param alongside `directory`)
- `opencode_approve_permission`
- `opencode_fork`
- `opencode_revert`
- `opencode_session_command` (same routing description)

**11 tools already had `directory` — updated from inline ternary to `resolveDirectory()`:**
- `opencode_create_session`
- `opencode_session_list`
- `opencode_session_get`
- `opencode_session_status`
- `opencode_session_messages` (preserves `limit` query param alongside `directory`)
- `opencode_session_message`
- `opencode_session_delete`
- `opencode_session_rename`
- `opencode_session_children`
- `opencode_session_unrevert`

All 18 tools now honor `OPENCODE_DEFAULT_PROJECT` via `resolveDirectory()`.

## Verification

`npm run build` passed with zero TypeScript errors after all changes.

## Commits

| Hash | Description |
|------|-------------|
| 3bacc13 | feat(05-01): add resolveDirectory() helper and uniform directory param to all 18 tools |

## Deviations from Plan

None — plan executed exactly as specified in 05-RESEARCH.md. All 18 tools updated, build clean.

## Known Stubs

None.

## Threat Flags

None. This change adds no new network endpoints, auth paths, or trust boundaries. The `directory` parameter is a string forwarded to the already-trusted local OpenCode instance.

## Self-Check: PASSED

- `src/index.ts` modified: FOUND
- Commit 3bacc13: FOUND
- `npm run build` output: zero errors
