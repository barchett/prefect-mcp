---
phase: 14-session-server-routing
plan: "03"
subsystem: request-routing
tags: [typescript, routing, sessions, multi-server, stale-session, getClient]
dependency_graph:
  requires:
    - plan: "14-01"
      provides: sessions-persistence-module (addSession, lookupSession, removeSession)
    - plan: "14-02"
      provides: ensureOpencodeRunning(ServerEntry) + resolveServerFromRequest in fetch.ts
  provides:
    - getClient(url) per-URL client cache in src/index.ts
    - resolveServerUrl(sessionId?, serverName?) D-06 fallback chain
    - isNotFound(error) D-12 stale-session 404 detection helper
    - serverNameForUrl(url, param?) session name resolution for sessions.json writes
    - server param on 3 entry-point tools (prefect_create_session, prefect_delegate, prefect_dispatch)
    - Full sessionId→server routing for all 23 sessionId-bearing handlers
    - D-12 stale-session detection + cleanup across all 23 sessionId handlers
  affects:
    - src/handlers.ts (createSession signature + sessions.json write)
    - src/index.ts (mass refactor: 40 handler registrations)
tech_stack:
  added: []
  patterns:
    - per-URL Map cache (clientCache) — one createOpencodeClient per unique server URL
    - D-06 fallback chain: sessionId lookup → serverName registry → first registry entry → BASE_URL
    - D-12 stale-session: isNotFound(error) for direct { data, error } handlers; '"status":404' substring for helper-based handlers (runPrompt/getDiff)
    - conditional sessions.json write in createSession (serverUrl && serverName guard)
key_files:
  created: []
  modified:
    - src/handlers.ts
    - src/index.ts
decisions:
  - "Tasks 2 and 3 share src/index.ts and require each other for a green build — both committed together in Task 2's commit; Task 3's commit is an empty annotation commit recording the D-12 substitution stats"
  - "prefect_run/prefect_get_diff/prefect_await use string-search '\"status\":404' for D-12 detection because runPrompt/getDiff helpers encode SDK errors via JSON.stringify before re-throwing — isNotFound() cannot inspect the re-thrown Error object"
  - "prefect_await has two D-12 detection paths: (1) isNotFound on messagesResult.error (direct SDK call), (2) '\"status\":404' substring on getDiff helper errors — belt-and-suspenders"
  - "serverNameForUrl() falls back to serverParam ?? 'default' when registry is empty — ensures sessions.json entries are always named even on a fresh install with no registered servers"
  - "BASE_URL constant kept at module scope (Pitfall 4 from RESEARCH.md) — Step 4 fallback in resolveServerUrl when registry is empty"
  - "global const client removed (D-01) — replaced by clientCache Map + getClient(url)"
metrics:
  duration: "~25 min"
  completed_date: "2026-05-02"
  tasks_completed: 3
  files_created: 0
  files_modified: 2
---

# Phase 14 Plan 03: Wire session-server routing into MCP request path

Wire the Wave 1 modules (sessions.ts, registry.ts, autostart ServerEntry) into the actual MCP request path: per-URL client cache, D-06 server URL resolution, D-12 stale-session detection, and sessions.json writes on session creation across all 40 tool handlers.

## What Was Built

### Helper Functions Added to src/index.ts

All four helpers are at module scope, after the `BASE_URL`/`TIMEOUT_MS` constants and before the first `server.registerTool` call.

**`getClient(serverUrl: string)`** — per-URL client cache (D-01..D-03)
```typescript
const clientCache = new Map<string, ReturnType<typeof createOpencodeClient>>();
function getClient(serverUrl: string): ReturnType<typeof createOpencodeClient>
```
Replaces the single global `const client = createOpencodeClient(...)`. Each unique URL gets exactly one SDK client instance, cached for reuse.

**`resolveServerUrl(sessionId?: string, serverName?: string): string`** — D-06 fallback chain
```typescript
function resolveServerUrl(sessionId?: string, serverName?: string): string
```
Resolution order:
1. `sessionId` → `lookupSession(sessionId)` → `entry.url` (sessions.json lookup)
2. `serverName` → `readRegistry()` → find by name → `http://host:port` (D-07 throws if not found)
3. No inputs → first registry entry → `http://host:port`
4. Registry empty → `BASE_URL` (PREFECT_SERVER_URL env var)

D-07 error message (exact): `Server '${serverName}' not found in registry. Run 'prefect list-servers' to see registered servers.`

**`isNotFound(error: unknown): boolean`** — D-12 stale-session 404 detection
```typescript
function isNotFound(error: unknown): boolean
// checks (error as Record<string, unknown>).status === 404
```
Used for handlers that get raw `{ data, error }` from SDK calls. NOT used for runPrompt/getDiff/await — see D-12 special cases below.

**`serverNameForUrl(serverUrl: string, serverParam?: string): string`** — session name resolution
```typescript
function serverNameForUrl(serverUrl: string, serverParam?: string): string
// registry lookup by URL → found.name ?? serverParam ?? 'default'
```
Used by the 3 entry points to resolve a human-readable server name for sessions.json writes. Falls back to `serverParam` (user's input) then `'default'` when registry is empty.

### Entry Points: server Param Schema

All 3 entry points received the same `server` field in their inputSchema:
```typescript
server: z.string().min(1).optional().describe(
  "Named server from registry (prefect list-servers). Omit to use the first registered server or PREFECT_SERVER_URL."
),
```

Handler bodies resolve the URL and write to sessions.json:
```typescript
const serverUrl = resolveServerUrl(undefined, serverParam);
const serverName = serverNameForUrl(serverUrl, serverParam);
const session = await createSession(getClient(serverUrl), title, dir, parentID, serverUrl, serverName);
```

### src/handlers.ts createSession Changes (D-11)

Added two trailing optional params (`serverUrl?: string`, `serverName?: string`) and the sessions.json write:
```typescript
if (serverUrl && serverName) {
  addSession(data.id, { server: serverName, url: serverUrl });
}
```
The `if (serverUrl && serverName)` guard preserves backward compatibility for callers passing only the original 4 params.

### Handler Counts

| Category | Count | Pattern |
|----------|-------|---------|
| Entry points | 3 | `server` param + `resolveServerUrl(undefined, serverParam)` + `createSession(..., serverUrl, serverName)` |
| Workspace tools | 14 | `resolveServerUrl()` no args + `getClient(serverUrl).x.y(...)` |
| SessionId-bearing | 23 | `resolveServerUrl(sessionId)` + `getClient(serverUrl)` + D-12 detection |
| **Total** | **40** | |

### D-12 Stale-Session Detection

**Standard pattern** (20 of 23 sessionId handlers):
```typescript
const serverUrl = resolveServerUrl(sessionId);
const { data, error } = await getClient(serverUrl).session.X(...);
if (error) {
  if (isNotFound(error)) {
    const entry = lookupSession(sessionId);
    removeSession(sessionId);
    throw new Error(
      `Session ${sessionId} not found on server '${entry?.server ?? 'unknown'}' (${serverUrl}).\n` +
      `The session may have been deleted or the server restarted.\n` +
      `Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.`,
    );
  }
  throw new Error(JSON.stringify(error));
}
```

**Special pattern — runPrompt/getDiff helper-based handlers** (prefect_run, prefect_get_diff, prefect_await):

The `runPrompt` and `getDiff` helpers in `src/handlers.ts` call `if (error) throw new Error(JSON.stringify(error))` internally. The thrown error reaches the handler's catch block as an `Error` object with a JSON-stringified message — not as a raw `{ data, error }` pair. `isNotFound()` cannot inspect this. Instead, these handlers use a substring check:
```typescript
if (typeof (err as Error).message === 'string' && (err as Error).message.includes('"status":404')) {
  const entry = lookupSession(sessionId);
  removeSession(sessionId);
  const staleUrl = entry?.url ?? resolveServerUrl();
  return { content: [{ type: 'text', text: `Session ${sessionId} not found on server '...'` }], isError: true };
}
```

**Special pattern — prefect_inspect** (Promise.all with 3 endpoints):
```typescript
const serverUrl = resolveServerUrl(sessionId);
const c = getClient(serverUrl);
const [statusResult, todoResult, diffResult] = await Promise.all([...]);
for (const r of [todoResult, diffResult]) {  // only sessionId-bearing endpoints
  if (r.error && isNotFound(r.error)) { /* D-12 throw */ }
}
```

**prefect_await**: Has both patterns — `isNotFound` on `messagesResult.error` (direct SDK call) and `'"status":404'` substring on the getDiff helper error in the catch block.

### Verification Stats (post-implementation)

| Check | Count | Expected |
|-------|-------|----------|
| `resolveServerUrl(sessionId)` | 24 | ≥23 |
| `getClient(serverUrl)` | 43 | ≥23 |
| `removeSession(sessionId)` | 24 | ≥23 |
| D-12 message `not found on server` | 24 | ≥23 |
| `isNotFound(` | 22 | ≥1 |
| `lookupSession(sessionId)` | 25 | ≥23 |
| Bare `client.session.` in executable code | 0 | 0 |
| `server: z.string().min(1).optional()` | 3 | 3 |
| `serverNameForUrl(serverUrl, serverParam)` | 3 | 3 |
| `resolveServerUrl()` no-args | 17 | ≥14 |

### BASE_URL and Global Client

- `BASE_URL` constant declaration preserved at module scope (Pitfall 4 — Step 4 fallback in resolveServerUrl)
- `const client = createOpencodeClient(...)` global removed (D-01) — replaced by `clientCache` + `getClient()`

## Commits

| Task | Commit | Type | Message |
|------|--------|------|---------|
| Task 1 | f3947fb | feat | feat(14-03): createSession persists sessionId→server in sessions.json |
| Task 2 + 3 | 9d94ac2 | feat | feat(14-03): add getClient/resolveServerUrl + entry-point server param + workspace tool routing |
| Task 3 annotation | fae4d33 | feat | feat(14-03): route 23 sessionId tools via sessions.json + add D-12 stale-session detection |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Tasks 2 and 3 committed together due to shared file + build dependency**
- **Found during:** Task 2 build verification
- **Issue:** src/index.ts is modified by both Task 2 (helpers + entry points + workspace tools) and Task 3 (sessionId handlers). After Task 2's changes removed the global `client` variable, Task 3's still-unreplaced `client.x.y(...)` calls caused 28 TypeScript errors. The build could not pass until ALL `client.` references were replaced — making Task 2's acceptance criteria (`npm run build` exits 0) impossible without completing Task 3 first.
- **Fix:** Completed all Task 3 substitutions before committing. Committed the full src/index.ts under Task 2's message, then made Task 3's commit as an empty annotation commit recording the D-12 substitution stats.
- **Files modified:** src/index.ts
- **Commits:** 9d94ac2 (all changes), fae4d33 (Task 3 annotation)

## Manual Smoke Test Note (for /gsd-verify-work)

To validate the routing end-to-end:
1. Register two servers: `prefect add-server server1 localhost 4096 qwen2.5-coder` and `prefect add-server server2 localhost 4097 qwen2.5-coder`
2. Call `prefect_create_session` with `server: "server1"` — verify `~/.config/prefect/sessions.json` has an entry with `url: "http://localhost:4096"` and `server: "server1"`
3. Call `prefect_create_session` with `server: "server2"` — verify a second entry with `url: "http://localhost:4097"` and `server: "server2"`
4. Call any sessionId tool (e.g. `prefect_session_get`) with the server1 session ID — verify it routes to port 4096
5. Verify an unknown server name throws: `prefect_create_session { server: "nonexistent" }` should return "not found in registry" error

## Known Stubs

None — all helper functions are wired to live registry/sessions reads. No placeholder data or TODO markers introduced.

## Threat Flags

No new security surface introduced beyond what is documented in the plan's threat model (T-14-09 through T-14-14). The `server` param is restricted to registered names only (cannot supply raw URLs). The D-12 error message intentionally discloses server name and URL per T-14-11 disposition: accept.

## Self-Check: PASSED

| Item | Status |
|------|--------|
| src/handlers.ts: import { addSession } | FOUND |
| src/handlers.ts: serverUrl?, serverName? params | FOUND |
| src/handlers.ts: addSession(data.id, ...) | FOUND |
| src/index.ts: import { readRegistry } | FOUND |
| src/index.ts: import { lookupSession, removeSession } | FOUND |
| src/index.ts: clientCache Map | FOUND |
| src/index.ts: function getClient | FOUND |
| src/index.ts: function resolveServerUrl | FOUND |
| src/index.ts: function isNotFound | FOUND |
| src/index.ts: function serverNameForUrl | FOUND |
| src/index.ts: D-07 error string | FOUND |
| src/index.ts: global client removed | CONFIRMED (0 matches) |
| src/index.ts: BASE_URL preserved | FOUND |
| src/index.ts: 3x server param | FOUND (count=3) |
| src/index.ts: 24x D-12 message | FOUND (count=24) |
| src/index.ts: 0 bare client.session. in code | CONFIRMED |
| npm run build exits 0 | PASSED |
| npm test 66 pass 0 fail | PASSED |
| Task commits f3947fb, 9d94ac2, fae4d33 | FOUND |
| 14-03-SUMMARY.md | THIS FILE |
