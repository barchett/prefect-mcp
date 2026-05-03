---
phase: 15-onboarding-session-reuse
plan: "01"
subsystem: cli
tags: [multi-server, onboarding, claude-md, registry, cli]
dependency_graph:
  requires: []
  provides: [MULTI-08, MULTI-09]
  affects: [src/cli.ts, src/cli.test.ts]
tech_stack:
  added: []
  patterns: [line-scan-section-update, tdd-red-green]
key_files:
  created: []
  modified:
    - src/cli.ts
    - src/cli.test.ts
decisions:
  - "Used block-scoped const for reg inside case 'init' to avoid TypeScript duplicate-binding error"
  - "updateClaudemdWorkers wrapped in try/catch in both callers to avoid blocking server registration on CLAUDE.md write failure"
  - "Line-scan approach (split on newline, findIndex) used for section detection per plan guidance — no regex substitution"
metrics:
  duration: "~12 minutes"
  completed: "2026-05-03"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
  tests_added: 7
  commits: 3
---

# Phase 15 Plan 01: CLAUDE.md Workers Section + Init Guidance Summary

**One-liner:** `updateClaudemdWorkers()` helper writes `## Available Workers` to CLAUDE.md on every add/remove-server, and `prefect init` prints first-server onboarding guidance when registry is empty.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 (RED) | Failing tests for MULTI-08 + MULTI-09 | 3f20e5c | src/cli.test.ts |
| 1 (GREEN) | updateClaudemdWorkers() + handleAddServer/handleRemoveServer wiring | da7f010 | src/cli.ts |
| 2 (GREEN) | MULTI-09 init guidance at both exit-0 paths | 3d53bc8 | src/cli.ts |

## What Was Built

### MULTI-08: `updateClaudemdWorkers(cwd: string): void`

Added to `src/cli.ts`. Behavior:
- Reads `CLAUDE.md` at `cwd` (creates empty string if absent)
- Calls `readRegistry()` to get current server list
- Builds `## Available Workers` section with one bullet per server: `- **name** — provider/model, host:port`
- Uses `*(no servers registered)*` placeholder when registry is empty
- Line-scan to find existing section heading; replaces from heading to next `## ` or EOF
- If section absent, appends with blank-line separator
- Normalizes to exactly one trailing newline
- Wrapped in try/catch at each call site

Called from:
- `handleAddServer` — after `addServer()` succeeds, before `process.exit(0)`
- `handleRemoveServer` — after `removeServer()` succeeds, before `process.exit(0)`

### MULTI-09: Init guidance

Added to both exit-0 paths in `case 'init'`:
- Case 1 (fresh `.mcp.json` created)
- Cases 2/4 (prefect key added or force-overwritten)

Guidance message printed to stderr when `readRegistry().servers.length === 0`:
```
No servers registered yet. Register your first OpenCode server:
  prefect add-server <name> <host> <port> <provider> <model>
Example:
  prefect add-server local localhost 4096 ollama qwen2.5-coder
```

Case 3 (exit-1, refuse without --force) intentionally excluded.

## Tests Added (7 new, 75 total)

| Test | Requirement |
|------|-------------|
| MULTI-08: add-server creates CLAUDE.md with Available Workers section | MULTI-08 |
| MULTI-08: remove-server updates section to placeholder when registry empty | MULTI-08 |
| MULTI-08: add-server preserves existing CLAUDE.md content | MULTI-08 |
| MULTI-08: repeated add-server does not duplicate section | MULTI-08 |
| MULTI-08: CLAUDE.md ends with exactly one newline | MULTI-08 |
| MULTI-09: init prints guidance when registry empty | MULTI-09 |
| MULTI-09: init silent when servers already registered | MULTI-09 |

## Verification

- `npm run build` — exits 0, zero TypeScript errors
- `npm test` — 75/75 pass (0 failures)
- Manual smoke: `node build/cli.js add-server local localhost 4096 ollama qwen3` in /tmp → CLAUDE.md created with `## Available Workers` section (1 match confirmed)
- `prefect init` from fresh dir with empty HOME → prints "No servers registered yet" guidance

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Block-scoped `reg` inside switch case**

- **Found during:** Task 2 implementation
- **Issue:** The plan's guidance used `const reg = readRegistry()` inline in the case body. TypeScript requires block scoping for `const` inside switch cases to avoid duplicate-binding errors across cases.
- **Fix:** Wrapped each guidance check in a `{ ... }` block to create proper lexical scope. No behavior change.
- **Files modified:** src/cli.ts
- **Commit:** 3d53bc8

## Known Stubs

None. All CLAUDE.md section content is sourced from the live registry.

## TDD Gate Compliance

- RED gate: `test(15-01)` commit 3f20e5c — 6 new tests, all failing
- GREEN gate: `feat(15-01)` commits da7f010 and 3d53bc8 — all 75 tests passing

## Self-Check

Files created/modified:
- src/cli.ts — FOUND (modified with updateClaudemdWorkers and init guidance)
- src/cli.test.ts — FOUND (7 new tests added)

Commits:
- 3f20e5c — FOUND (test RED)
- da7f010 — FOUND (feat GREEN Task 1)
- 3d53bc8 — FOUND (feat GREEN Task 2)

## Self-Check: PASSED
