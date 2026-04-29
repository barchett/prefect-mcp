---
phase: 09-npm-distribution
plan: "01"
subsystem: core
tags:
  - npm-publishing
  - tool-rename
  - env-var-migration
dependency_graph:
  requires: []
  provides:
    - prefect_* tool names across all src/*.ts
    - PREFECT_* env var primary reads with OPENCODE_* soft-migration fallback
    - package.json publishing manifest (prefect-mcp name, files whitelist, dual bin)
  affects:
    - src/index.ts
    - src/auth.ts
    - src/config.ts
    - src/autostart.ts
    - src/handlers.ts
    - src/auth.test.ts
    - src/autostart.test.ts
    - package.json
tech_stack:
  added: []
  patterns:
    - "Pattern 1 (module-init IIFE): PREFECT_SERVER_URL in index.ts and autostart.ts"
    - "Pattern 2 (call-time warned flag): PREFECT_SERVER_PASSWORD/USERNAME in auth.ts, PREFECT_DEFAULT_PROJECT in config.ts"
key_files:
  created: []
  modified:
    - src/index.ts
    - src/auth.ts
    - src/config.ts
    - src/autostart.ts
    - src/handlers.ts
    - src/diff-patch.test.ts
    - src/session-command.test.ts
    - src/auth.test.ts
    - src/autostart.test.ts
    - package.json
decisions:
  - "Pattern 1 for module-init reads (index.ts, autostart.ts): IIFE fires at most once at module load — no warned flag needed"
  - "Pattern 2 for call-time reads (auth.ts, config.ts): module-level warned flags prevent repeated stderr noise"
  - "build/auth.test.js added to test command — was compiled but excluded from npm test (pre-existing gap)"
metrics:
  duration_seconds: 396
  completed_date: "2026-04-29"
  tasks_completed: 4
  tasks_total: 4
  files_modified: 10
---

# Phase 9 Plan 01: Tool Rename + Env Var Migration + Publishing Manifest Summary

**One-liner:** Blanket opencode_ → prefect_ rename across 25 tools, PREFECT_* env var primary reads with one-time-warned OPENCODE_* soft-migration fallback, and npm publishing manifest (prefect-mcp name, files whitelist, dual bin entries).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Rename all opencode_* tool names to prefect_* | 90e4811 | src/index.ts, src/handlers.ts, src/diff-patch.test.ts, src/session-command.test.ts |
| 2 | Apply env var soft migration in 4 source files | 42eed28 | src/index.ts, src/autostart.ts, src/auth.ts, src/config.ts |
| 3 | Update test files to canonical PREFECT_* env var names | 6dff47f | src/auth.test.ts, src/autostart.test.ts, package.json |
| 4 | Add npm publishing fields to package.json + final test gate | 1fe6a09 | package.json |

## Key Results

### Tool Name Renames

57 `opencode_` occurrences replaced with `prefect_` across 4 files. All 25 tool registrations renamed:

- `prefect_create_session`, `prefect_abort`, `prefect_run`, `prefect_prompt_async`, `prefect_get_diff`
- `prefect_approve_permission`, `prefect_fork`, `prefect_revert`
- `prefect_session_list`, `prefect_session_get`, `prefect_session_status`, `prefect_session_messages`, `prefect_session_message`, `prefect_session_delete`, `prefect_session_rename`, `prefect_session_children`, `prefect_session_unrevert`, `prefect_session_command`
- `prefect_delegate`, `prefect_dispatch`, `prefect_inspect`, `prefect_await`
- `prefect_list_agents`, `prefect_list_providers`, `prefect_find_symbol`

Zero `opencode_` references remain in any `src/*.ts` file.

### Env Var Migration

5 canonical OPENCODE_* read sites migrated across 4 files:

| File | Var | Pattern | Warned Flag |
|------|-----|---------|-------------|
| src/index.ts | OPENCODE_URL → PREFECT_SERVER_URL | 1 (module-init IIFE) | none (fires once at module load) |
| src/autostart.ts | OPENCODE_URL → PREFECT_SERVER_URL | 1 (module-init IIFE) | none (fires once at module load) |
| src/auth.ts | OPENCODE_SERVER_PASSWORD → PREFECT_SERVER_PASSWORD | 2 (call-time) | `warnedPassword` |
| src/auth.ts | OPENCODE_SERVER_USERNAME → PREFECT_SERVER_USERNAME | 2 (call-time) | `warnedUsername` |
| src/config.ts | OPENCODE_DEFAULT_PROJECT → PREFECT_DEFAULT_PROJECT | 2 (call-time) | `warnedDefaultProject` |

All deprecation warnings go to `console.error` (stdout is the JSON-RPC pipe). No `console.log` added.

`resolveDirectory()` still returns `undefined` when neither param nor either env var is set — Phase 5 locked contract preserved.

### Test Files

- `src/auth.test.ts`: 17× PREFECT_SERVER_PASSWORD + 9× PREFECT_SERVER_USERNAME (exercising primary read path)
- `src/autostart.test.ts`: 5× PREFECT_SERVER_URL + 4× PREFECT_SERVER_PASSWORD
- Remote-guard test sets `PREFECT_SERVER_URL = 'http://192.168.1.100:4096'` before dynamic import (Pitfall 3 avoided)

### package.json

```json
{
  "name": "prefect-mcp",
  "version": "1.0.0",
  "type": "module",
  "description": "TypeScript MCP server that exposes OpenCode's HTTP API as Claude Code tools",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "files": ["build/", "README.md"],
  "publishConfig": { "access": "public" },
  "bin": {
    "prefect": "./build/cli.js",
    "prefect-mcp": "./build/index.js"
  }
}
```

### Test Gate (D-02)

`npm test` exits 0 — **39/39 tests pass**.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] Added build/auth.test.js to npm test command**
- **Found during:** Task 3
- **Issue:** `src/auth.test.ts` compiled to `build/auth.test.js` but was excluded from the `npm test` command in `package.json`. The 5 auth tests were never executed by `npm test`, so renamed env var behavior in auth.ts was untested.
- **Fix:** Added `build/auth.test.js` to the test command in `package.json` (done in Task 3 commit alongside test file updates).
- **Files modified:** `package.json`
- **Commit:** 6dff47f

## Known Stubs

None. All env var reads are wired to real environment variables. All tool registrations are live.

## Threat Flags

No new security-relevant surface introduced. All changes are renames. The `files` whitelist in `package.json` correctly excludes `src/`, `.planning/`, `.mcp.json`, and `node_modules/` from the published tarball (T-09-01 mitigated).

## Self-Check: PASSED

All 10 modified files exist on disk. All 4 task commits verified in git log.

| Check | Result |
|-------|--------|
| src/index.ts | FOUND |
| src/auth.ts | FOUND |
| src/config.ts | FOUND |
| src/autostart.ts | FOUND |
| src/handlers.ts | FOUND |
| src/auth.test.ts | FOUND |
| src/autostart.test.ts | FOUND |
| src/diff-patch.test.ts | FOUND |
| src/session-command.test.ts | FOUND |
| package.json | FOUND |
| commit 90e4811 (Task 1) | FOUND |
| commit 42eed28 (Task 2) | FOUND |
| commit 6dff47f (Task 3) | FOUND |
| commit 1fe6a09 (Task 4) | FOUND |
