# Phase 14: Session-Server Routing - Context

**Gathered:** 2026-05-01
**Status:** Ready for planning

<domain>
## Phase Boundary

This phase delivers transparent server routing for all MCP tool calls. The three composite entry points (`prefect_create_session`, `prefect_delegate`, `prefect_dispatch`) accept an optional `server` param to name the target OpenCode instance. On session creation, the sessionId→server mapping is written to `~/.config/prefect/sessions.json`. All 40 tools look up that map on every call and create a per-URL OpenCode client, so subsequent calls automatically reach the correct server — even after an MCP server restart. Stale sessions (server restarted, session gone) are detected via 404, cleaned from the map, and surfaced as actionable errors. `ensureOpencodeRunning()` is updated to accept a `ServerEntry` and start the correct instance.

</domain>

<decisions>
## Implementation Decisions

### Client Architecture

- **D-01:** Replace the single global `const client = createOpencodeClient(...)` with a per-call `getClient(serverUrl)` helper that caches clients by URL string (create on first use). Every tool call resolves the target server URL (via sessions.json lookup or fallback chain) and passes it to `getClient()`.
- **D-02:** The refactor is mechanical: 40 substitutions of `client.x.y(...)` → `getClient(serverUrl).x.y(...)`. No architectural restructuring needed — one helper function, one pass.
- **D-03:** The client cache lives in module scope (Map<string, OpencodeClient>). No TTL — clients are lightweight and the server URL set is small.

### Transparent Routing Scope

- **D-04:** ALL 37 non-entry-point tools look up `sessions.json` and route to the correct server. No partial routing. The session→server lookup is cheap; split-brain (some tools hitting the wrong server silently) is unacceptable.
- **D-05:** Tools that do NOT take a `sessionId` (workspace API tools like `prefect_vcs_info`, `prefect_find_file`, etc.) keep the current fallback behavior: first registered server → `PREFECT_SERVER_URL`.

### Server Resolution Fallback Chain

- **D-06:** Resolution order for any tool call:
  1. If tool takes `sessionId` → look up `sessions.json` → use that server's URL
  2. If no sessionId (or sessionId not in map) → `server` param (entry points only) → look up registry by name
  3. If no `server` param → first entry in `servers.json` registry
  4. If registry empty → `PREFECT_SERVER_URL` env var (default `http://localhost:4096`)
- **D-07:** If a named server is specified but not found in the registry → throw immediately with: `"Server '{name}' not found in registry. Run 'prefect list-servers' to see registered servers."`

### Session Map (`sessions.json`)

- **D-08:** Session→server map file: `~/.config/prefect/sessions.json`. Format: `{ "sessions": { "<sessionId>": { "server": "<name>", "url": "<http://host:port>" } } }`.
- **D-09:** Map is read on every tool call (no in-process cache). File is written immediately when a session is created by any of the three entry points. This ensures correctness across MCP server restarts.
- **D-10:** New module `src/sessions.ts` handles all sessions.json reads/writes (parallel to `src/registry.ts`). Do not extend `registry.ts` — separate concerns cleanly.
- **D-11:** Composite tools (`prefect_delegate`, `prefect_dispatch`) create a session internally — they MUST write to `sessions.json` at that internal creation point, not just `prefect_create_session`.

### Stale Session Handling

- **D-12:** When any tool call receives a 404 from OpenCode on a stored sessionId: remove the stale entry from `sessions.json`, then throw with this exact message format:
  ```
  Session {sessionId} not found on server '{serverName}' ({serverUrl}).
  The session may have been deleted or the server restarted.
  Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.
  ```
- **D-13:** Stale detection applies to ALL tools that take a sessionId (same scope as D-04).

### `ensureOpencodeRunning()` Design

- **D-14:** Function signature changes to accept a `ServerEntry` param: `ensureOpencodeRunning(server: ServerEntry): Promise<void>`. Uses `server.host` and `server.port` instead of reading `BASE_URL` globally.
- **D-15:** Keep the existing localhost guard: skip auto-start if `server.host !== 'localhost' && server.host !== '127.0.0.1'` and throw with the same style of message as today.
- **D-16:** The `startPromise` lock (D-06 in autostart.ts) should be keyed by server name or URL string so concurrent calls for different servers don't block each other.
- **D-17:** Callers pass the resolved `ServerEntry` (from registry lookup or fallback) — `ensureOpencodeRunning()` is not responsible for registry lookups.

### Claude's Discretion

- Whether `getClient()` uses a `Map` or a plain object for the URL cache — either is fine.
- Whether `sessions.ts` exports `SessionMap` as a typed interface or inlines the type — Claude's call.
- Test strategy for stale session detection — integration vs. unit mocking is Claude's choice.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Existing Implementation to Modify
- `src/registry.ts` — `ServerEntry` interface and registry read/write helpers; `sessions.ts` should follow the same pattern
- `src/autostart.ts` — current `ensureOpencodeRunning()` implementation; D-14 changes the signature
- `src/handlers.ts` — `createSession()` helper; must accept and pass server URL for sessions.json write
- `src/index.ts` — global `client` creation (line ~23) and all 40 tool handler registrations; the refactor target for D-01/D-02

### Requirements
- `.planning/REQUIREMENTS.md` §MULTI-05 — server param + transparent routing spec
- `.planning/REQUIREMENTS.md` §MULTI-06 — sessions.json persistence + stale handling spec
- `.planning/REQUIREMENTS.md` §MULTI-07 — server-aware auto-start spec
- `.planning/ROADMAP.md` §Phase 14 — success criteria (5 items)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/registry.ts` — `readRegistry()`, `writeRegistry()`, `ServerEntry` interface — `sessions.ts` should mirror this pattern exactly (read/write helpers, typed interface, path constant)
- `src/autostart.ts` — `parsePort()`, localhost guard, promise lock pattern (`startPromise`) — all reusable; just change BASE_URL to use the passed-in ServerEntry
- `src/handlers.ts` — `createSession()` already extracted as a helper; will need a `serverUrl` param added so it can write to sessions.json at creation time
- `src/fetch.ts` — `buildAuthHeader()` for health-check calls in `waitForHealth()`

### Established Patterns
- Registry read/write: read-at-call-time (no in-process cache), write with `mkdirSync({ recursive: true })` to ensure parent dirs — follow this exactly in `sessions.ts`
- Error throwing: `throw new Error(JSON.stringify(error))` on API errors; `throw new Error("descriptive message")` for logic errors — D-12 error uses the descriptive style
- Tool handler shape: `{ name, description, inputSchema, handler }` registered in one place in `index.ts`

### Integration Points
- `src/index.ts` line ~23: global `client` → becomes `getClient(url)` per-call
- `src/handlers.ts` `createSession()`: needs `serverUrl` param to write sessions.json
- `src/autostart.ts` `ensureOpencodeRunning()`: signature change + startPromise keyed by URL
- New file: `src/sessions.ts` — session map read/write module

</code_context>

<specifics>
## Specific Ideas

- `getClient(serverUrl: string)` — cache key is the full URL string (e.g., `"http://localhost:4096"`). Return type is `ReturnType<typeof createOpencodeClient>`.
- Sessions.json format decided by user: `{ "sessions": { "<id>": { "server": "<name>", "url": "<url>" } } }` — store both name and URL so the error message can show both without a registry re-lookup.
- The `startPromise` lock in autostart.ts should become `Map<string, Promise<void>>` keyed by URL (or server name) to allow concurrent starts of different servers.
- `server` param Zod schema on the 3 entry points: `z.string().min(1).optional().describe("Named server from registry (prefect list-servers). Omit to use the first registered server or PREFECT_SERVER_URL.")`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 14-session-server-routing*
*Context gathered: 2026-05-01*
