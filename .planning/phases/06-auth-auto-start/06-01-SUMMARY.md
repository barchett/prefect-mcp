---
phase: 06-auth-auto-start
plan: "01"
subsystem: auth
tags: [auth, http-basic-auth, infra, security]
dependency_graph:
  requires: []
  provides: [src/auth.ts, INFRA-06-readme-warning]
  affects: [src/index.ts]
tech_stack:
  added: []
  patterns: [call-time-env-read, Buffer.from-base64, Config.fetch-hook]
key_files:
  created:
    - src/auth.ts
    - src/auth.test.ts
  modified:
    - README.md
decisions:
  - "buildAuthHeader reads env inside function body (D-01): credentials read at call time, consistent with resolveDirectory() precedent"
  - "Buffer.from() not btoa() (D-03): Node.js runtime consistency"
  - "authFetch clones request with merged headers: existing headers preserved, Authorization always overrides"
  - "INFRA-06 warning placed after env table, before .mcp.json example: most visible location for the security guidance"
metrics:
  duration: "163s"
  completed: "2026-04-28"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 1
---

# Phase 6 Plan 1: Auth Header Injection and INFRA-06 README Warning Summary

**One-liner:** Node.js Buffer-based HTTP Basic Auth wrapper (`buildAuthHeader` + `authFetch`) that injects credentials at call time via the `@opencode-ai/sdk` Config.fetch hook, with INFRA-06 README warning against committing credentials.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create src/auth.ts — buildAuthHeader + authFetch (TDD) | 8f9020d | src/auth.ts (created), src/auth.test.ts (created at c8a5ad7) |
| 2 | Add INFRA-06 warning to README.md Configuration section | 87cb2a3 | README.md (modified) |

## Implementation Details

### src/auth.ts

- `buildAuthHeader()` — reads `OPENCODE_SERVER_PASSWORD` and `OPENCODE_SERVER_USERNAME` inside the function body (never at module scope). Returns `{ Authorization: 'Basic <token>' }` or `{}`. Username defaults to `'opencode'`. Token built with `Buffer.from()`.
- `authFetch(request)` — matches `Config.fetch` signature from `@opencode-ai/sdk`. Forwards request unchanged when no password set. Clones request with merged headers (auth header always wins on `Authorization` key) when password is set. Uses `globalThis.fetch` for Node.js compatibility.
- No default export. No third-party imports. No top-level side effects.

### README.md

- Added `OPENCODE_SERVER_PASSWORD` and `OPENCODE_SERVER_USERNAME` rows to the Configuration env table.
- Added `> **Security (INFRA-06):**` warning block immediately after the table, before the `.mcp.json` override example.

## TDD Gate Compliance

- RED gate commit: `c8a5ad7` — `test(06-01): add failing tests for buildAuthHeader and authFetch`
- GREEN gate commit: `8f9020d` — `feat(06-01): implement src/auth.ts — buildAuthHeader + authFetch`
- All 5 auth tests pass; all 30 pre-existing tests still pass.

## Deviations from Plan

None — plan executed exactly as written.

## Threat Surface Scan

No new network endpoints, auth paths, file access patterns, or schema changes introduced beyond what the plan's threat model documents. `src/auth.ts` is a pure utility module with no side effects at load time.

## Self-Check: PASSED

- src/auth.ts: FOUND
- src/auth.test.ts: FOUND
- Commit c8a5ad7 (RED test): FOUND
- Commit 8f9020d (GREEN impl): FOUND
- Commit 87cb2a3 (README docs): FOUND
