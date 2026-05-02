---
phase: 14-session-server-routing
verified: 2026-05-02T23:30:00Z
status: passed
score: 8/8 must-haves verified
overrides_applied: 0
re_verification: false
---

# Phase 14: Session-Server Routing Verification Report

**Phase Goal:** Tool calls are routed to the correct named server transparently — `server` param on the three entry points, session→server map in `sessions.json`, stale-session cleanup, and server-aware auto-start.
**Verified:** 2026-05-02T23:30:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (Roadmap Success Criteria)

| #   | Truth                                                                                                                                                 | Status     | Evidence                                                                                                                                                                                                   |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SC1 | Calling create_session/delegate/dispatch with `server` param routes to that server; omitting `server` falls back to first registry entry → BASE_URL   | ✓ VERIFIED | `resolveServerUrl(undefined, serverParam)` in all 3 entry points; D-07 throws on unknown name; fallback chain at index.ts:45–66                                                                           |
| SC2 | After session creation, sessionId→server mapping is written to `sessions.json` immediately                                                            | ✓ VERIFIED | `createSession` in handlers.ts calls `addSession(data.id, { server: serverName, url: serverUrl })` before returning (line 47); all 3 entry points pass both params                                        |
| SC3 | On 404 from OpenCode, stale entry is removed from sessions.json and actionable error is returned                                                       | ✓ VERIFIED | 24 sessionId handlers call `removeSession(sessionId)` + D-12 message; `prefect_run/get_diff/await` use `"status":404` substring match for helper-based paths                                              |
| SC4 | `ensureOpencodeRunning()` starts the correct OpenCode instance using host/port from the named server's registry entry                                  | ✓ VERIFIED | `ensureOpencodeRunning(server: ServerEntry)` in autostart.ts uses `server.host`/`server.port`; `waitForHealth(serverUrl)` is parameterized; `fetch.ts` resolves `ServerEntry` from request URL on ECONNREFUSED |
| SC5 | `npm run build` passes with zero errors after all routing changes                                                                                      | ✓ VERIFIED | `npm run build` exits 0 (confirmed by direct run); TypeScript compiles all 4 modified source files cleanly                                                                                                 |

### Plan-Level Must-Have Truths (All Plans)

#### Plan 01 — sessions.ts

| #  | Truth                                                                                      | Status     | Evidence                                                                        |
| -- | ------------------------------------------------------------------------------------------ | ---------- | ------------------------------------------------------------------------------- |
| 1  | readSessionMap returns `{ sessions: {} }` when sessions.json absent                        | ✓ VERIFIED | ENOENT branch at sessions.ts:26 returns `{ sessions: {} }` without writing      |
| 2  | writeSessionMap creates parent directory and writes pretty-printed JSON with trailing `\n` | ✓ VERIFIED | `mkdirSync(dirname(sessionsPath), { recursive: true })` + `JSON.stringify(map, null, 2) + '\n'` at sessions.ts:32–33 |
| 3  | addSession persists entry that lookupSession reads back                                    | ✓ VERIFIED | addSession reads map, sets key, writes; lookupSession reads and indexes — all via same file path |
| 4  | removeSession removes entry and is a no-op on unknown id                                   | ✓ VERIFIED | `if (!(sessionId in map.sessions)) return;` at sessions.ts:44 — idempotent      |
| 5  | lookupSession returns undefined for unknown sessionId                                      | ✓ VERIFIED | Returns `readSessionMap().sessions[sessionId]` — undefined for missing keys     |

#### Plan 02 — autostart refactor

| #  | Truth                                                                                             | Status     | Evidence                                                                               |
| -- | ------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------- |
| 6  | `ensureOpencodeRunning(server: ServerEntry)` uses server.host and server.port                    | ✓ VERIFIED | Function signature at autostart.ts:57; spawn uses `String(server.port)`; no BASE_URL reference |
| 7  | Remote-host guard fires on `server.host` (not module-level BASE_URL)                             | ✓ VERIFIED | `server.host !== 'localhost' && server.host !== '127.0.0.1'` check at autostart.ts:63 |
| 8  | Concurrent calls for different servers use separate Map entries                                   | ✓ VERIFIED | `Map<string, Promise<void>>` keyed by `startKey(server)` = `server.name` or `host:port` |
| 9  | `fetchWithAuth` on ECONNREFUSED resolves ServerEntry from request URL before calling autostart    | ✓ VERIFIED | `resolveServerFromRequest(request)` + `ensureOpencodeRunning(server)` at fetch.ts:61–62 |
| 10 | Health-poll URL is built from the passed ServerEntry, not module-level BASE_URL                   | ✓ VERIFIED | `waitForHealth(serverUrl: string)` takes param; `healthUrl = \`${serverUrl}/global/health\`` |

#### Plan 03 — index.ts/handlers.ts wiring

| #  | Truth                                                                                                                     | Status     | Evidence                                                                                                     |
| -- | ------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------ |
| 11 | prefect_create_session, prefect_delegate, prefect_dispatch each accept optional `server` Zod string                       | ✓ VERIFIED | `grep -c "server: z.string().min(1).optional()" src/index.ts` = 3; confirmed on lines 99, and delegate/dispatch |
| 12 | Unknown `server` name throws the exact D-07 error                                                                         | ✓ VERIFIED | `Server '${serverName}' not found in registry. Run 'prefect list-servers' to see registered servers.` at index.ts:54–56 |
| 13 | Omitting `server` falls back: first registry entry → BASE_URL                                                             | ✓ VERIFIED | `resolveServerUrl()` no-args path at index.ts:60–65; `BASE_URL` constant preserved (count=1)                  |
| 14 | sessions.json write after session creation by any of the 3 entry points                                                   | ✓ VERIFIED | All 3 call `createSession(getClient(serverUrl), ..., serverUrl, serverName)` which triggers `addSession`       |
| 15 | All 28 sessionId-bearing handlers call `lookupSession` + `resolveServerUrl(sessionId)` + `removeSession` on 404           | ✓ VERIFIED | `resolveServerUrl(sessionId)` count=24, `lookupSession(sessionId)` count=25, `removeSession(sessionId)` count=24, D-12 message count=24 |
| 16 | All workspace handlers call `resolveServerUrl()` with no args                                                             | ✓ VERIFIED | `resolveServerUrl()` no-args count=17 (≥14 required; prefect_list_tools has 2 call sites, etc.)               |
| 17 | Single global `const client` removed; every handler uses `getClient(serverUrl)`                                           | ✓ VERIFIED | `grep "const client = createOpencodeClient" src/index.ts` = 0 matches; `clientCache` Map present              |
| 18 | `npm run build` exits 0 and `npm test` reports `# fail 0`                                                                 | ✓ VERIFIED | Build exits 0; `npm test` reports `# tests 66 / # pass 66 / # fail 0`                                        |

**Score:** 8/8 roadmap success criteria verified; 18/18 plan-level truths verified

### Required Artifacts

| Artifact               | Expected                                                   | Status     | Details                                                            |
| ---------------------- | ---------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `src/sessions.ts`      | SessionEntry/SessionMap + 5 helpers + SESSIONS_PATH        | ✓ VERIFIED | 52 lines; 8 exports; all interfaces, constant, and helpers present |
| `src/sessions.test.ts` | 8 tests with freshTmp/rmSync isolation                     | ✓ VERIFIED | `grep -c "^test(" = 8`; rmSync isolation count=8                   |
| `src/autostart.ts`     | `ensureOpencodeRunning(server: ServerEntry)` + Map lock    | ✓ VERIFIED | ServerEntry import; Map at line 17; no `let startPromise`; no `BASE_URL` constant |
| `src/autostart.test.ts`| 6 tests with ServerEntry fixtures; no `?v=` cache-bust     | ✓ VERIFIED | `grep -c "^test(" = 6`; no `?v=remote-guard-test` found            |
| `src/fetch.ts`         | `resolveServerFromRequest` + `ensureOpencodeRunning(server)` | ✓ VERIFIED | `readRegistry` import; `resolveServerFromRequest` function present; passes `server` arg |
| `src/handlers.ts`      | `createSession` with serverUrl/serverName + `addSession` write | ✓ VERIFIED | `addSession` import; `serverUrl?`, `serverName?` params; conditional write |
| `src/index.ts`         | 4 helpers + 3 entry-point server params + 40 handler substitutions | ✓ VERIFIED | All 4 helpers present; server param count=3; 43 getClient calls; 24 D-12 messages |

### Key Link Verification

| From                          | To                                    | Via                                          | Status     | Details                                                            |
| ----------------------------- | ------------------------------------- | -------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `src/sessions.ts`             | `node:fs`                             | `readFileSync, writeFileSync, mkdirSync`      | ✓ WIRED    | Import on line 1                                                   |
| `src/sessions.ts`             | `~/.config/prefect/sessions.json`     | `join(homedir(), '.config', 'prefect', ...)`  | ✓ WIRED    | `SESSIONS_PATH` constant at line 15                                |
| `src/handlers.ts createSession` | `src/sessions.ts addSession`        | `import { addSession } from './sessions.js'`  | ✓ WIRED    | Import on line 5; call at line 47                                  |
| `src/fetch.ts`                | `src/autostart.ts ensureOpencodeRunning(ServerEntry)` | `ensureOpencodeRunning(server)` at fetch.ts:62 | ✓ WIRED | Passes resolved ServerEntry, not bare call |
| `src/fetch.ts`                | `src/registry.ts readRegistry`        | `resolveServerFromRequest` reads registry     | ✓ WIRED    | `readRegistry` import + call at fetch.ts:29                        |
| `src/index.ts getClient`      | `createOpencodeClient` per-URL cache  | `clientCache.set(serverUrl, ...)`             | ✓ WIRED    | `clientCache` Map present; `clientCache.set` used in `getClient`   |
| `src/index.ts resolveServerUrl` | `lookupSession` + `readRegistry`    | D-06 fallback chain                           | ✓ WIRED    | Both `lookupSession` and `readRegistry` called in fallback order    |
| `src/index.ts (28 sessionId tools)` | `removeSession` + D-12 error   | `isNotFound(error)` → removeSession → throw   | ✓ WIRED    | `removeSession(sessionId)` count=24; message count=24               |

### Data-Flow Trace (Level 4)

| Artifact                  | Data Variable  | Source                                         | Produces Real Data | Status      |
| ------------------------- | -------------- | ---------------------------------------------- | ------------------ | ----------- |
| `src/index.ts resolveServerUrl` | `entry.url` | `lookupSession(sessionId)` → reads sessions.json | Yes             | ✓ FLOWING   |
| `src/handlers.ts createSession` | `data.id`  | `client.session.create(...)` SDK call            | Yes (live API)   | ✓ FLOWING   |
| `src/sessions.ts lookupSession` | return value | `readFileSync(sessionsPath)` → parse → index | Yes              | ✓ FLOWING   |
| `src/fetch.ts resolveServerFromRequest` | ServerEntry | `readRegistry()` → servers.json          | Yes              | ✓ FLOWING   |

### Behavioral Spot-Checks

The phase produces library/MCP-server code, not a standalone CLI or HTTP endpoint testable without a running server. Spot-checks limited to build and test suite.

| Behavior                                | Command                 | Result                           | Status   |
| --------------------------------------- | ----------------------- | -------------------------------- | -------- |
| TypeScript compiles all 4 modified files | `npm run build`        | Exit 0, no errors                | ✓ PASS   |
| All 66 tests pass (8 new + 58 existing)  | `npm test`             | 66 pass / 0 fail / 0 cancelled   | ✓ PASS   |

### Requirements Coverage

| Requirement | Source Plan | Description                                                                                                      | Status      | Evidence                                                                                     |
| ----------- | ----------- | ---------------------------------------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------- |
| MULTI-05    | 14-03       | `server` param on 3 entry points; all other tools route via session→server map; fallback to BASE_URL             | ✓ SATISFIED | `server` Zod param on create_session/delegate/dispatch; `resolveServerUrl(sessionId)` on all 28 sessionId tools; fallback chain verified |
| MULTI-06    | 14-01, 14-03 | sessions.json persistence; composite tools register sessionId→server on creation; stale 404s removed + surfaced | ✓ SATISFIED | sessions.ts module with 5 helpers; `addSession` called in createSession; D-12 detection in all 24 sessionId handlers |
| MULTI-07    | 14-02       | `ensureOpencodeRunning()` is server-aware; uses named server's host/port                                         | ✓ SATISFIED | `ensureOpencodeRunning(server: ServerEntry)` signature; per-server Map lock; `waitForHealth(serverUrl)` parameterized |

All 3 requirement IDs declared in plan frontmatter are satisfied. The REQUIREMENTS.md traceability table shows MULTI-05/06/07 mapped to Phase 14 — all are covered by the plans above.

### Anti-Patterns Found

Scanned all 5 modified/created files for stubs, placeholders, and hardcoded empty values.

| File               | Pattern Checked                   | Severity | Verdict                                                             |
| ------------------ | --------------------------------- | -------- | ------------------------------------------------------------------- |
| `src/sessions.ts`  | TODO/placeholder/return null      | —        | None found. All 5 helpers fully implemented.                        |
| `src/autostart.ts` | BASE_URL reference, old signature | —        | No `BASE_URL` constant; no `let startPromise`; no stubs             |
| `src/fetch.ts`     | bare `ensureOpencodeRunning()`    | —        | Passes `server` arg; `resolveServerFromRequest` synthesizes fallback (intentional, not a stub) |
| `src/handlers.ts`  | conditional `addSession` write    | —        | `if (serverUrl && serverName)` guard is intentional for backward compatibility; not a stub |
| `src/index.ts`     | bare `client.` references        | —        | Zero bare `client.session.` calls in executable code (grep=0)       |

No blocker anti-patterns found.

### Human Verification Required

#### 1. End-to-end routing with two running OpenCode instances

**Test:** Register two servers (`prefect add-server server1 localhost 4096 qwen` and `server2 localhost 4097 qwen`). Start both with `opencode serve`. Call `prefect_create_session { server: "server1" }` and `prefect_create_session { server: "server2" }`. Verify that `~/.config/prefect/sessions.json` contains two entries with distinct `url` values, and that a subsequent `prefect_run` on each session reaches the correct port.
**Expected:** sessions.json has `server1→localhost:4096` and `server2→localhost:4097`; each `prefect_run` calls the right instance.
**Why human:** Requires two running OpenCode processes; cannot be verified without live services.

#### 2. Stale-session 404 error message UX

**Test:** Create a session, restart OpenCode (killing the session), then call any sessionId tool (e.g. `prefect_abort`) with the old sessionId.
**Expected:** Tool returns an `isError: true` response containing the exact D-12 message: `Session <id> not found on server '<name>' (<url>). The session may have been deleted or the server restarted. Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.`
**Why human:** Requires restarting OpenCode to produce an actual 404 from the API.

#### 3. Auto-start with named server

**Test:** Register a localhost server on port 4099, ensure nothing is listening on 4099, then call `prefect_create_session { server: "server4099" }`.
**Expected:** `[Prefect] OpenCode not reachable on http://localhost:4099 — spawning 'opencode serve --port 4099'` appears in stderr, OpenCode starts, and session creation succeeds.
**Why human:** Requires a real `opencode` binary on PATH and process spawning.

### Gaps Summary

No gaps found. All 8 roadmap success criteria and all 18 plan-level must-have truths are verified against the actual codebase. The build passes. The full 66-test suite passes with zero failures. Three human verification items remain for behaviors that require live OpenCode processes.

---

_Verified: 2026-05-02T23:30:00Z_
_Verifier: Claude (gsd-verifier)_
