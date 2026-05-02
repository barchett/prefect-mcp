---
phase: 14-session-server-routing
plan: "02"
subsystem: infra
tags: [typescript, autostart, multi-server, registry, fetch]

# Dependency graph
requires:
  - phase: 13-server-registry
    provides: ServerEntry interface and readRegistry() from src/registry.ts
provides:
  - ensureOpencodeRunning(server ServerEntry) — per-server Map lock replaces single global
  - resolveServerFromRequest(request) — registry-backed URL-to-ServerEntry resolution in fetch.ts
  - _resetStartPromise() now clears Map (test isolation)
  - waitForHealth(serverUrl string) — parameterized health poll URL
affects: [14-03-PLAN.md, src/index.ts mass refactor, any caller of ensureOpencodeRunning]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-server Map lock: Map<string, Promise<void>> keyed by server.name or host:port for concurrent-safe multi-server spawning"
    - "ServerEntry resolution: fetch.ts reads registry on ECONNREFUSED; synthesizes minimal entry as fallback for unregistered URLs"
    - "D-17 separation: autostart.ts does not consult registry; caller (fetch.ts) resolves the entry"

key-files:
  created: []
  modified:
    - src/autostart.ts
    - src/autostart.test.ts
    - src/fetch.ts

key-decisions:
  - "D-14: ensureOpencodeRunning accepts ServerEntry — no longer reads BASE_URL from module env"
  - "D-15: localhost guard fires on server.host (not module-level BASE_URL constant)"
  - "D-16: Map<string, Promise<void>> keyed by server name enables concurrent starts for distinct servers"
  - "D-17: caller (fetch.ts) resolves ServerEntry; autostart.ts does not consult registry itself"
  - "Pitfall 1 / Option 1: resolveServerFromRequest reads registry; synthesizes minimal fallback entry for URLs with no registry match"
  - "fetch.ts updated in same wave as autostart.ts to keep build green (Task 2 implemented before Task 1 commit to satisfy TypeScript)"

requirements-completed: [MULTI-07]

# Metrics
duration: 7min
completed: 2026-05-02
---

# Phase 14 Plan 02: autostart ServerEntry refactor + fetch.ts ServerEntry resolution

**`ensureOpencodeRunning` now accepts `ServerEntry`, uses a per-server `Map` lock, and health-polls server-specific URLs; `fetchWithAuth` resolves the target `ServerEntry` from the request URL on ECONNREFUSED**

## Performance

- **Duration:** 7 min
- **Started:** 2026-05-02T22:18:09Z
- **Completed:** 2026-05-02T22:24:23Z
- **Tasks:** 2 (+ 1 TDD RED commit)
- **Files modified:** 3

## Accomplishments

- Replaced the single global `let startPromise` lock with `Map<string, Promise<void>>` keyed by `server.name` — concurrent starts for distinct servers no longer block each other (Test 3)
- Parameterized `waitForHealth(serverUrl)` so health polls target the passed server's host:port rather than a module-level `BASE_URL` constant (Test 6)
- Rewrote `ensureOpencodeRunning` to accept `ServerEntry`; remote-host guard fires on `server.host` without needing the `?v=` ESM cache-bust trick in tests (Test 1)
- Added `resolveServerFromRequest` to `fetch.ts`: reads registry, matches by host+port, synthesizes minimal fallback if no registry match; passes resolved entry to `ensureOpencodeRunning(server)` on ECONNREFUSED
- Test suite: autostart tests grew from 4 to 6; full suite 56 → 58 passing; 0 failures

## Task Commits

Each task was committed atomically:

1. **RED: Failing tests (TDD gate)** - `5710df8` (test)
2. **Task 1: Refactor src/autostart.ts + rewrite src/autostart.test.ts** - `1b214e6` (refactor)
3. **Task 2: Update src/fetch.ts to resolve ServerEntry** - `f9b24c3` (fix)

_Note: TDD task has separate RED commit followed by GREEN implementation commit._

## Files Created/Modified

- `src/autostart.ts` — Removed `BASE_URL`/`parsePort`; added `ServerEntry` import; replaced `let startPromise` with `Map`; added `startKey()`; updated `waitForHealth(serverUrl)` and `ensureOpencodeRunning(server: ServerEntry)`; `_resetStartPromise()` now calls `startPromises.clear()`
- `src/autostart.test.ts` — Rewrote from 4 to 6 tests using `ServerEntry` fixtures; removed `?v=remote-guard-test` cache-bust import; added Test 3 (concurrent different servers) and Test 6 (health URL uses passed port)
- `src/fetch.ts` — Added `readRegistry` import; added `resolveServerFromRequest(request)`; replaced bare `ensureOpencodeRunning()` with `ensureOpencodeRunning(server)` where `server` is resolved from request URL

## Decisions Made

- fetch.ts was updated in the same execution wave as autostart.ts because the TypeScript compiler enforces the new signature immediately — the build would not pass until fetch.ts called the new signature. This is expected: Task 2 was always planned to follow Task 1 in the same plan.
- The `resolveServerFromRequest` fallback synthesizes a `ServerEntry` with `name = requestUrl.hostname` and `model = ''` — sufficient for `ensureOpencodeRunning` which only needs `host` and `port` for the spawn and localhost guard.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Applied Task 2 (fetch.ts) changes before running Task 1 tests**
- **Found during:** Task 1 verification (GREEN phase build)
- **Issue:** After writing the new `ensureOpencodeRunning(server: ServerEntry)` signature, `tsc` emitted `TS2554: Expected 1 arguments, but got 0` for `src/fetch.ts` line 35. The build would not pass until fetch.ts was updated.
- **Fix:** Implemented the full Task 2 fetch.ts changes (as planned) to unblock the build, then committed Task 1 (autostart.ts) separately, then committed Task 2 (fetch.ts).
- **Files modified:** src/fetch.ts
- **Verification:** `npm run build` exits 0; `node --test build/autostart.test.js` reports `# pass 6`
- **Committed in:** f9b24c3 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (Rule 3 — blocking)
**Impact on plan:** Task 2 changes were always part of this plan; the only deviation was applying them before completing Task 1 verification due to TypeScript's cross-file type checking. No scope creep.

## Issues Encountered

None — both tasks completed on first attempt.

## Note for Plan 03

`ensureOpencodeRunning` no longer auto-fires from any module-level singleton. Plan 03 handlers in `src/index.ts` do **NOT** need to call `ensureOpencodeRunning` directly — `fetchWithAuth` still handles it on ECONNREFUSED. The only change Plan 03 needs in this area is to ensure each tool call resolves the correct server URL and passes it to `getClient(serverUrl)`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `ensureOpencodeRunning(server: ServerEntry)` signature is finalized — Plan 03's mass `index.ts` refactor can proceed
- `resolveServerFromRequest` in fetch.ts handles ECONNREFUSED for any registered or unregistered server URL
- Full test suite at 58/58 passing — clean baseline for Plan 03

## Self-Check: PASSED

- src/autostart.ts: FOUND
- src/autostart.test.ts: FOUND
- src/fetch.ts: FOUND
- 14-02-SUMMARY.md: FOUND
- Commits 5710df8, 1b214e6, f9b24c3: all present
- Build: exits 0
- Tests: 58 pass, 0 fail

---
*Phase: 14-session-server-routing*
*Completed: 2026-05-02*
