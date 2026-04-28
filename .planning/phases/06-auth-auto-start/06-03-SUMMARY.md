---
phase: "06-auth-auto-start"
plan: "03"
subsystem: "index-wiring"
tags: ["auth", "autostart", "wiring", "infra", "build"]
dependency_graph:
  requires: ["06-01", "06-02"]
  provides: ["src/index.ts (auth+autostart wired)", "build/index.js"]
  affects: ["all 18 MCP tools (auth headers via SDK fetch hook)", "opencode_run (ECONNREFUSED auto-start)"]
tech_stack:
  added: []
  patterns: ["SDK-fetch-hook injection", "ECONNREFUSED-triggered auto-start", "once-retry after spawn"]
key_files:
  created: []
  modified:
    - path: "src/index.ts"
      description: "Added authFetch + ensureOpencodeRunning imports; threaded authFetch into createOpencodeClient; added ECONNREFUSED detection + retry block in opencode_run catch"
decisions:
  - "authFetch injected at createOpencodeClient level (not per-handler): one-line change, all 18 tools get auth headers transparently — avoids per-handler repetition"
  - "ECONNREFUSED auto-start wired only in opencode_run per D-07: it is the primary first-call tool in the canonical CLAUDE.md workflow; other tools surface honest connection errors"
  - "Retry after ensureOpencodeRunning uses identical prompt body (no escalation): T-06-10 accepted"
  - "build/ directory is gitignored — build verification is a runtime check, not a tracked file change"
metrics:
  duration: "108s"
  completed_date: "2026-04-28"
  tasks_completed: 2
  tasks_total: 3
  files_created: 0
  files_modified: 1
---

# Phase 6 Plan 3: Wire authFetch + ensureOpencodeRunning into src/index.ts Summary

**One-liner:** Three-change wiring of `authFetch` (SDK fetch hook, all 18 tools) and `ensureOpencodeRunning` (ECONNREFUSED trigger in `opencode_run`) into `src/index.ts`, with successful `npm run build` verification.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire authFetch + ensureOpencodeRunning into src/index.ts | a20d65d | src/index.ts (modified) |
| 2 | Build verification — npm run build passes + smoke test | (no commit — build/ is gitignored) | build/index.js, build/auth.js, build/autostart.js (verified) |

## Implementation Details

### src/index.ts — Three targeted changes

**Change 1 — Imports (lines 8-9):**
```typescript
import { authFetch } from './auth.js';
import { ensureOpencodeRunning } from './autostart.js';
```

**Change 2 — Client creation (line 14):**
```typescript
const client = createOpencodeClient({ baseUrl: BASE_URL, fetch: authFetch });
```
All 18 tool handlers now inject HTTP Basic Auth headers on every OpenCode request via the SDK fetch hook. No per-handler changes needed.

**Change 3 — ECONNREFUSED detection in opencode_run catch block (lines ~150-169):**
After the existing `AbortError` check, a new branch detects `TypeError` with `'ECONNREFUSED'` in the message string. On match:
1. Calls `await ensureOpencodeRunning()` (spawns `opencode serve`, polls health)
2. Retries the identical prompt body once
3. On retry success: returns structured `{ info, parts }` response
4. On retry failure: surfaces the retry error as `isError: true`

### Build Verification (Task 2)

- `npm run build` exited 0 (zero TypeScript errors)
- `build/index.js` — 27,590 bytes, executable
- `build/auth.js` — 1,724 bytes (compiled from src/auth.ts)
- `build/autostart.js` — 3,251 bytes (compiled from src/autostart.ts)
- Smoke test: `timeout 3 node build/index.js 2>&1` outputs `Prefect MCP server running (OpenCode: http://localhost:4096)` — no `Fatal:` lines, no uncaught exceptions

## Task 3 Status

**Task 3 (checkpoint:human-verify) is PENDING — handled by the orchestrator.**

The human verification requires:
1. Confirming OpenCode is NOT running, then calling `opencode_run` to trigger auto-start
2. Observing `[Prefect] OpenCode not reachable — spawning 'opencode serve --port 4096'` and `[Prefect] OpenCode is healthy` in stderr
3. Optionally verifying auth header injection with `OPENCODE_SERVER_PASSWORD` set

This is a WSL2 live-environment test. STATE.md blocker: "Auto-start reliability in WSL2 is MEDIUM confidence — live testing required during Phase 6."

## Deviations from Plan

None — plan executed exactly as written. All three changes applied to `src/index.ts` as specified in the plan action block. Build verification confirmed all expected outputs.

## Threat Surface Scan

No new network endpoints, auth paths, or schema changes beyond what the plan's threat model documents.

- T-06-10 (Retry prompt tampering): accepted — identical body retried, no escalation
- T-06-11 (ECONNREFUSED loop): mitigated — `autoStartAttempted` flag in `autostart.ts` ensures spawn fires at most once; retry errors surface as `isError: true`
- T-06-12 (Auth headers on all 18 tools): accepted — all requests go to localhost:4096 (user-controlled)
- T-06-13 (Silent auto-start): mitigated — `console.error` logs spawn event and health-ready event

## Known Stubs

None. All wiring is real: `authFetch` from `src/auth.ts`, `ensureOpencodeRunning` from `src/autostart.ts`, both modules fully implemented in Plans 01 and 02.

## Self-Check: PASSED

- src/index.ts modified: FOUND (verified by grep)
- import { authFetch }: line 8 — FOUND
- import { ensureOpencodeRunning }: line 9 — FOUND
- fetch: authFetch in createOpencodeClient: line 14 — FOUND
- ECONNREFUSED detection: line 154 — FOUND
- ensureOpencodeRunning() call: line 156 — FOUND
- Commit a20d65d: FOUND
- npm run build exits 0: VERIFIED
- build/auth.js: FOUND (27,590 bytes)
- build/autostart.js: FOUND (3,251 bytes)
- build/index.js: FOUND (executable)
- Smoke test output "Prefect MCP server running": VERIFIED
