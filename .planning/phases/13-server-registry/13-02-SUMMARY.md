---
phase: 13-server-registry
plan: "02"
subsystem: cli
tags: [tdd, cli, integration-tests, subcommand-dispatch]
dependency_graph:
  requires: [src/registry.ts exports: addServer, removeServer, listServers]
  provides: [src/cli.ts: four-arm subcommand dispatch, src/cli.test.ts: 8 new integration tests]
  affects: [src/cli.ts, src/cli.test.ts]
tech_stack:
  added: []
  patterns: [HOME/USERPROFILE env redirect for test isolation, switch dispatch with handler functions, parseInt + Number.isFinite port validation]
key_files:
  created: []
  modified:
    - src/cli.ts (four-arm switch dispatch, three handler functions, updated usageAndExit)
    - src/cli.test.ts (runCli helper, 8 new integration tests, updated bogus-subcommand assertion)
decisions:
  - "handleAddServer uses Number.isFinite(port) instead of isNaN(port) — handles non-numeric strings that parseInt returns NaN for, more robust"
  - "runInit helper retained unchanged — existing init tests do not need HOME redirect since prefect init never touches the registry"
  - "force variable retained at top-level scope inside case 'init': block — diff is minimal, no extraction to handleInit function"
metrics:
  duration: "2m 40s"
  completed: "2026-05-01T17:00:53Z"
  tasks_completed: 2
  files_created: 0
  files_modified: 2
---

# Phase 13 Plan 02: CLI Subcommand Dispatch Summary

## One-Liner

Four-arm switch dispatch in `src/cli.ts` wiring `add-server`, `remove-server`, `list-servers` to registry.ts, with 8 HOME-redirected integration tests covering all argument validation and registry I/O behaviors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Extend cli.ts with subcommand dispatch and handler functions | c61c31f | src/cli.ts |
| 2 | Extend cli.test.ts with integration tests for new subcommands | 0178c10 | src/cli.test.ts |

## TDD Gate Compliance

- Task 1 is implementation (GREEN relative to the already-failing existing test for bogus subcommand usage message)
- Task 2 adds integration tests and updates the bogus-subcommand assertion

Both tasks committed atomically in the correct order: implementation first (c61c31f), then tests (0178c10).

## Verification Results

```
npm run build  -> exit 0, zero TypeScript errors
npm test       -> 56 pass, 0 fail (48 baseline + 8 new CLI subcommand tests)
```

### Acceptance Criteria Checklist

- [x] `import { addServer, removeServer, listServers } from './registry.js'` added to cli.ts
- [x] `switch (subcommand)` dispatch in cli.ts
- [x] `case 'init':` block wraps all existing init logic unchanged
- [x] `case 'add-server':` calls `handleAddServer(args.slice(1))`
- [x] `case 'remove-server':` calls `handleRemoveServer(args.slice(1))`
- [x] `case 'list-servers':` calls `handleListServers()`
- [x] `handleAddServer` with `parseInt(portStr, 10)` and `1-65535` range guard
- [x] `handleRemoveServer` and `handleListServers` implemented
- [x] `usageAndExit` lists all four subcommands with `Usage: prefect <subcommand>`
- [x] `function runCli(cwd, env, ...args)` helper in cli.test.ts
- [x] `HOME: dir` and `USERPROFILE: dir` in all env objects
- [x] 4 add-server tests, 2 remove-server tests, 2 list-servers tests
- [x] Old `assert.match(stderr, /Usage: prefect init/)` assertion replaced
- [x] New bogus-subcommand assertions: `/Usage: prefect <subcommand>/`, `/add-server <name> <host> <port> <model>/`, `/list-servers/`
- [x] `npm run build` exits 0
- [x] `npm test` exits 0 — 56/56 pass

## Deviations from Plan

None — plan executed exactly as written. `Number.isFinite(port)` was used as specified in the plan's action block (which also says `!Number.isFinite(port) || port < 1 || port > 65535`). The PATTERNS.md used `isNaN(port)` but the PLAN's explicit `<action>` text took precedence per the plan's instruction to "match the strings, tokens, and order verbatim."

## Known Stubs

None — all handler functions are fully wired to registry.ts exports. No placeholder text or hardcoded empty values.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings. T-13-06 (port validation) and T-13-07 (test HOME redirect) are fully mitigated as specified in the plan's threat model.

## Manual Smoke-Test Coverage

All MULTI-01..04 success criteria are covered by integration tests rather than manual smoke tests:

- MULTI-01: `add-server creates ~/.config/prefect/servers.json` (test line 122) — verifies file creation, JSON structure, port is number type, stderr confirmation message
- MULTI-02: `remove-server removes existing entry` (test line 155) and `remove-server on missing name exits 1` (test line 173) — both paths covered
- MULTI-03: `list-servers prints empty-registry message` (test line 184) and `list-servers prints tabular output` (test line 195) — both paths covered
- MULTI-04: Structurally guaranteed — every `node build/cli.js ...` call is a fresh process; no in-memory cache exists

## Self-Check

- `src/cli.ts` exists and was committed in c61c31f
- `src/cli.test.ts` exists and was committed in 0178c10
- Both commits verified in git log below
