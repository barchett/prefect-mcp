---
phase: 14-session-server-routing
plan: "01"
subsystem: sessions-persistence
tags: [sessions, persistence, file-io, tdd, multi-server]
dependency_graph:
  requires: []
  provides: [sessions-persistence-module]
  affects: [src/sessions.ts, src/sessions.test.ts, package.json]
tech_stack:
  added: []
  patterns: [read-at-call-time, mkdirSync-recursive-guard, silent-no-op-idempotent-remove]
key_files:
  created:
    - src/sessions.ts
    - src/sessions.test.ts
  modified:
    - package.json
decisions:
  - "removeSession is a silent no-op on unknown sessionId per D-12 — stale-session cleanup path in Plan 03 calls removeSession in a 404 retry handler that must be idempotent"
  - "readSessionMap validates typeof parsed.sessions === 'object' && !Array.isArray(parsed.sessions) per T-14-03 — prevents silent routing to wrong server on malformed file"
  - "SESSIONS_PATH mirrors REGISTRY_PATH pattern: ~/.config/prefect/sessions.json (D-08, D-09)"
metrics:
  duration: "2m 24s"
  completed_date: "2026-05-02"
  tasks_completed: 2
  files_created: 2
  files_modified: 1
---

# Phase 14 Plan 01: sessions.ts Module Summary

sessions.ts persistence module — SessionEntry/SessionMap types + 5 CRUD helpers for session-to-server routing map at `~/.config/prefect/sessions.json`.

## What Was Built

### src/sessions.ts — Exported API

**Interfaces:**
```typescript
export interface SessionEntry {
  server: string;  // name from registry (matches ServerEntry.name in servers.json)
  url: string;     // full http://host:port URL
}

export interface SessionMap {
  sessions: Record<string, SessionEntry>;
}
```

**Constant:**
```typescript
export const SESSIONS_PATH: string  // = join(homedir(), '.config', 'prefect', 'sessions.json')
```

**Helpers:**
```typescript
export function readSessionMap(sessionsPath?: string): SessionMap
export function writeSessionMap(map: SessionMap, sessionsPath?: string): void
export function addSession(sessionId: string, entry: SessionEntry, sessionsPath?: string): void
export function removeSession(sessionId: string, sessionsPath?: string): void   // silent no-op on unknown id
export function lookupSession(sessionId: string, sessionsPath?: string): SessionEntry | undefined
```

### Key Behavioral Properties

- **removeSession is idempotent**: calling `removeSession` on an unknown `sessionId` returns silently without throwing or writing. Plan 03's stale-session 404 retry path depends on this — it will call `removeSession` in an error handler that may fire more than once.
- **readSessionMap validates structure**: throws `could not parse ...` on malformed JSON and `malformed sessions map ...` when `sessions` field is absent or not a plain object. This prevents silent routing to a wrong server on a corrupted file (T-14-03).
- **ENOENT returns empty map**: `readSessionMap` on a missing file returns `{ sessions: {} }` — no bootstrapping required, helpers work on a fresh install.
- **read-at-call-time**: no in-process cache — every helper call reads from disk, consistent with registry.ts pattern (D-09, D-10).

### src/sessions.test.ts — Test Coverage

8 tests, all isolated with `freshTmp()`/`rmSync` teardown. Every helper call passes an explicit path — the default `SESSIONS_PATH` is never touched in tests.

| # | Test Name |
|---|-----------|
| 1 | readSessionMap returns `{ sessions: {} }` when file does not exist |
| 2 | writeSessionMap creates parent directory and writes pretty-printed JSON with trailing newline |
| 3 | addSession persists a new entry and lookupSession reads it back |
| 4 | lookupSession returns undefined for unknown sessionId |
| 5 | removeSession removes a known entry and persists |
| 6 | removeSession on unknown id is a silent no-op (does not throw) |
| 7 | readSessionMap throws on malformed JSON (regex: `/could not parse/`) |
| 8 | readSessionMap throws when sessions field is missing or not an object (regex: `/malformed/`) |

### Test Count Delta

56 (existing) → 64 (after plan) — 8 new tests, 0 regressions.

### package.json Change

`scripts.test` extended with `build/sessions.test.js` at the end of the `node --test` invocation.

## Commits

| Task | Commit | Type | Message |
|------|--------|------|---------|
| 1 (RED) | 3e95844 | test | test(14-01): add failing tests for sessions.ts module |
| 2 (GREEN) | ddd74e4 | feat | feat(14-01): implement sessions.ts session->server map module |

## TDD Gate Compliance

- RED gate: `test(14-01)` commit 3e95844 — build failed with `Cannot find module './sessions.js'`
- GREEN gate: `feat(14-01)` commit ddd74e4 — all 8 tests pass, build exits 0

## Deviations from Plan

None — plan executed exactly as written. The sessions.ts code matches the template in the plan verbatim.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/sessions.ts | FOUND |
| src/sessions.test.ts | FOUND |
| 14-01-SUMMARY.md | FOUND |
| commit 3e95844 (RED) | FOUND |
| commit ddd74e4 (GREEN) | FOUND |
