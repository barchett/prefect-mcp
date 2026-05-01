---
phase: 13-server-registry
plan: "01"
subsystem: registry
tags: [tdd, filesystem, cli, persistence]
dependency_graph:
  requires: []
  provides: [src/registry.ts exports: readRegistry, writeRegistry, addServer, removeServer, listServers, ServerEntry, Registry]
  affects: [src/registry.test.ts, package.json]
tech_stack:
  added: [node:os homedir, node:path dirname]
  patterns: [optional-param testability escape hatch, upsert with stderr warning, safe-default file read]
key_files:
  created:
    - src/registry.ts
    - src/registry.test.ts
  modified:
    - package.json (test script extended)
decisions:
  - "addServer uses upsert semantics (overwrite on duplicate name) with stderr warning — matches prefect init --force spirit"
  - "All five exported functions accept optional registryPath defaulting to REGISTRY_PATH — enables temp-dir test isolation without module-level mutation"
  - "port stored as number (not string) to prevent Phase 14 URL construction bugs"
  - "writeRegistry uses dirname(registryPath) with mkdirSync recursive — supports nested paths in tests"
metrics:
  duration: "1m 48s"
  completed: "2026-05-01T16:55:47Z"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 13 Plan 01: Registry Module Summary

## One-Liner

JSON file registry module for `~/.config/prefect/servers.json` with five exported functions (read/write/add/remove/list), optional `registryPath` param for test isolation, upsert semantics on duplicate names, and 9 node:test cases covering all behaviors.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED — write failing tests for registry.ts | dcebc02 | src/registry.test.ts |
| 2 | GREEN — implement registry.ts to pass all tests | d502374 | src/registry.ts, package.json |

## TDD Gate Compliance

- RED gate: `test(13-01)` commit `dcebc02` — build failed with `TS2307: Cannot find module './registry.js'`
- GREEN gate: `feat(13-01)` commit `d502374` — all 48 tests pass (39 baseline + 9 new)
- REFACTOR gate: not needed — implementation was clean on first pass

## Verification Results

```
npm run build  -> exit 0, zero TypeScript errors
npm test       -> 48 pass, 0 fail (9 new registry tests + 39 baseline)
```

### Acceptance Criteria Checklist

- [x] `src/registry.ts` exists and compiles with zero TypeScript errors
- [x] `src/registry.test.ts` exists with 9 test cases
- [x] `export interface ServerEntry` with port as number
- [x] `export interface Registry`
- [x] `readRegistry` — returns `{ servers: [] }` on missing file; exits 1 on malformed JSON
- [x] `writeRegistry` — `mkdirSync(dirname(registryPath), { recursive: true })` + pretty-print
- [x] `addServer` — upsert; logs `Updated existing server` to stderr on duplicate
- [x] `removeServer` — exits 1 with `no server named` message on missing entry
- [x] `listServers` — tabular stdout; `No servers registered` on empty
- [x] All tests use temp-dir isolation; no `homedir()` calls in test file
- [x] `spawnSync` driver pattern for process.exit tests (6, 7, 8)
- [x] `build/registry.test.js` added to package.json test script
- [x] Two atomic git commits: RED then GREEN

## Deviations from Plan

None — plan executed exactly as written. The implementation in Task 2 matched the exact code structure provided in the plan's `<action>` block. No Rule 1/2/3 fixes were needed.

## Known Stubs

None — all five functions are fully implemented with real file I/O.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary crossings introduced. T-13-02 (malformed JSON DoS) is mitigated as planned: `readRegistry` wraps JSON.parse in try/catch and exits 1 with a clear error message.
