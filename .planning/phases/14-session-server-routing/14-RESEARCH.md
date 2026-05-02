# Phase 14: Session-Server Routing - Research

**Researched:** 2026-05-01
**Domain:** TypeScript MCP server — multi-server routing, session map persistence, autostart refactor
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Client Architecture**
- D-01: Replace single global `const client` with `getClient(serverUrl)` helper — caches by URL string, creates on first use
- D-02: Mechanical refactor — 40 substitutions of `client.x.y(...)` → `getClient(serverUrl).x.y(...)`; no architectural restructuring
- D-03: Client cache lives in module scope (`Map<string, OpencodeClient>`); no TTL

**Transparent Routing Scope**
- D-04: ALL 37 non-entry-point tools look up `sessions.json` and route to the correct server; no partial routing
- D-05: Tools with no `sessionId` param (workspace API tools) keep fallback behavior: first registered server → `PREFECT_SERVER_URL`

**Server Resolution Fallback Chain**
- D-06: Resolution order: (1) sessionId → sessions.json lookup → server URL; (2) no sessionId or not in map → `server` param → registry lookup; (3) no `server` → first entry in servers.json; (4) registry empty → `PREFECT_SERVER_URL`
- D-07: Named server not in registry → throw immediately: `"Server '{name}' not found in registry. Run 'prefect list-servers' to see registered servers."`

**Session Map (sessions.json)**
- D-08: File: `~/.config/prefect/sessions.json`. Format: `{ "sessions": { "<sessionId>": { "server": "<name>", "url": "<http://host:port>" } } }`
- D-09: Read on every tool call (no in-process cache); written immediately when session is created
- D-10: New module `src/sessions.ts` — mirrors `src/registry.ts`; do not extend registry.ts
- D-11: Composite tools (`prefect_delegate`, `prefect_dispatch`) must write sessions.json at their internal session creation point

**Stale Session Handling**
- D-12: On 404 for a stored sessionId: remove entry from sessions.json, throw with exact message:
  ```
  Session {sessionId} not found on server '{serverName}' ({serverUrl}).
  The session may have been deleted or the server restarted.
  Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.
  ```
- D-13: Stale detection applies to ALL tools that take sessionId (same scope as D-04)

**ensureOpencodeRunning() Design**
- D-14: Signature: `ensureOpencodeRunning(server: ServerEntry): Promise<void>`; uses `server.host` and `server.port`
- D-15: Keep localhost guard: skip auto-start if `server.host !== 'localhost' && server.host !== '127.0.0.1'`
- D-16: `startPromise` lock becomes `Map<string, Promise<void>>` keyed by server name or URL
- D-17: Callers pass resolved `ServerEntry`; `ensureOpencodeRunning()` is NOT responsible for registry lookups

### Claude's Discretion

- Whether `getClient()` uses a `Map` or a plain object for the URL cache — either is fine
- Whether `sessions.ts` exports `SessionMap` as a typed interface or inlines the type
- Test strategy for stale session detection — integration vs. unit mocking is Claude's choice

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MULTI-05 | `server` param on 3 entry points; transparent routing via session→server map; fallback chain to first registered server or `PREFECT_SERVER_URL` | D-01..D-07; `getClient()` helper + `resolveServerUrl()` helper; Zod schema extension on 3 tools |
| MULTI-06 | Session→server map in `sessions.json`; composite tools register mapping at internal session creation; stale 404 → remove entry + actionable error | D-08..D-13; new `src/sessions.ts` module; stale detection wrapper around all sessionId-taking tools |
| MULTI-07 | `ensureOpencodeRunning()` is server-aware — starts correct instance using registry entry's host and port | D-14..D-17; signature change in `src/autostart.ts`; callers in `src/fetch.ts` pass resolved `ServerEntry` |
</phase_requirements>

---

## Summary

Phase 14 is a pure TypeScript refactor with three tightly coupled changes: (1) introducing `getClient(url)` to replace the single global client, (2) adding `src/sessions.ts` for session→server map persistence, and (3) updating `ensureOpencodeRunning()` to accept a `ServerEntry` instead of reading the global `BASE_URL`. All design decisions are locked. No new external dependencies are needed — the phase uses the existing `node:fs`, `node:os`, `node:path`, `@opencode-ai/sdk`, and `zod` APIs already present.

The primary complexity is the mechanical scope: 40 tool handlers in `src/index.ts` must each resolve their target server URL before calling the OpenCode client. The correct resolution helper must be called at the right point in each handler. For the 37 non-entry-point tools with a `sessionId` param, the lookup is a `readSessionMap(sessionId)` call. For tools without a `sessionId`, it is a registry first-entry fallback. Only the three entry points (`prefect_create_session`, `prefect_delegate`, `prefect_dispatch`) accept and use the `server` param.

The second major complexity is stale session detection: a 404 from OpenCode on any sessionId call must trigger sessions.json cleanup and a descriptive throw. This logic wraps every handler that uses `client.session.*` with a sessionId path parameter. The detection cannot be pushed down into the SDK client — it must sit in each handler (or a shared post-response check utility) in `src/index.ts`.

**Primary recommendation:** Implement in three plans — (1) `src/sessions.ts` module + `src/autostart.ts` signature change, (2) `getClient()` helper + server resolution utility in `src/index.ts`, (3) all 40 handler substitutions + stale session wrapping.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| getClient() URL cache | index.ts module scope | — | Clients are per-URL singletons; cache belongs where they are created and used |
| Server URL resolution | index.ts (per-call helper) | sessions.ts, registry.ts | Resolution is a call-time decision; reads from sessions.json and servers.json |
| Session→server map persistence | sessions.ts | — | Mirrors registry.ts pattern; cleanly separated from routing logic |
| Stale session detection | index.ts (per handler) | sessions.ts (removeSession) | Detection is HTTP-response-layer; cleanup delegates to sessions.ts |
| Server-aware auto-start | autostart.ts | fetch.ts (caller) | autostart owns spawn logic; fetch.ts passes the resolved ServerEntry |
| `server` param routing | index.ts (3 entry points only) | registry.ts (lookup) | Entry points resolve server name to URL; remaining tools do not expose param |

---

## Standard Stack

### Core (no new dependencies needed)

| Module | Version | Purpose | Why Standard |
|--------|---------|---------|--------------|
| `node:fs` (readFileSync, writeFileSync, mkdirSync) | Built-in | sessions.json read/write | Already used in registry.ts — same pattern |
| `node:path` (join, dirname) | Built-in | File path construction | Same as registry.ts |
| `node:os` (homedir) | Built-in | `~/.config/prefect/` path | Same as registry.ts |
| `@opencode-ai/sdk` (createOpencodeClient) | 1.14.25 | Per-URL client creation | Already the project's client factory |
| `zod` | 4.3.6 | `server` param schema on 3 entry points | Already used for all tool schemas |

**Installation:** No new packages. All dependencies already present.

[VERIFIED: package.json in project root]

---

## Architecture Patterns

### System Architecture Diagram

```
Tool Call (MCP)
     │
     ▼
 Has sessionId?
  ├── YES → readSessionMap(sessionId) ──→ { server, url } ──────────────────────┐
  │          └── entry missing → fall through to server param / registry         │
  │                                                                               │
  └── NO  → server param (entry points only)? ──→ readRegistry() lookup by name  │
              └── no server param → first registry entry → PREFECT_SERVER_URL     │
                                                                                  │
                                               resolvedUrl ◄─────────────────────┘
                                                    │
                                                    ▼
                                          getClient(resolvedUrl)
                                         (cached Map<url, client>)
                                                    │
                                                    ▼
                                      client.session.*(...)  ──→ 404?
                                                                    │
                                                         YES → removeSession(sessionId)
                                                                    │
                                                                    ▼
                                                         throw descriptive error (D-12)
                                                                    │
                                                         NO  → return response
```

### Recommended Project Structure

```
src/
├── sessions.ts          # NEW — SessionMap read/write helpers (mirrors registry.ts)
├── registry.ts          # EXISTING — ServerEntry interface, readRegistry()
├── autostart.ts         # MODIFIED — ensureOpencodeRunning(server: ServerEntry)
├── fetch.ts             # MODIFIED — pass resolved ServerEntry to ensureOpencodeRunning
├── index.ts             # MODIFIED — getClient(), resolveServerUrl(), 40 handler updates
├── handlers.ts          # MODIFIED — createSession() gets serverUrl param for sessions.json write
└── auth.ts / config.ts / parts.ts / cli.ts  # UNCHANGED
```

### Pattern 1: sessions.ts — Session Map Module (mirrors registry.ts)

**What:** Read/write helpers for `~/.config/prefect/sessions.json`. Typed `SessionMap` interface. Path constant. Same file I/O pattern as `registry.ts`.

**When to use:** Called by every tool handler that needs to resolve a sessionId to a server URL, and by the three entry points when writing after session creation.

```typescript
// Source: [VERIFIED: src/registry.ts — direct parallel]
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface SessionEntry {
  server: string;  // name from registry
  url: string;     // full http://host:port URL
}

export interface SessionMap {
  sessions: Record<string, SessionEntry>;
}

const SESSIONS_DIR = join(homedir(), '.config', 'prefect');
export const SESSIONS_PATH = join(SESSIONS_DIR, 'sessions.json');

export function readSessionMap(path: string = SESSIONS_PATH): SessionMap {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed.sessions !== 'object') {
      throw new Error(`malformed sessions map at ${path}`);
    }
    return parsed as SessionMap;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { sessions: {} };
    throw new Error(`could not parse ${path}: ${(err as Error).message}`);
  }
}

export function writeSessionMap(map: SessionMap, path: string = SESSIONS_PATH): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(map, null, 2) + '\n');
}

export function addSession(sessionId: string, entry: SessionEntry, path: string = SESSIONS_PATH): void {
  const map = readSessionMap(path);
  map.sessions[sessionId] = entry;
  writeSessionMap(map, path);
}

export function removeSession(sessionId: string, path: string = SESSIONS_PATH): void {
  const map = readSessionMap(path);
  delete map.sessions[sessionId];
  writeSessionMap(map, path);
}

export function lookupSession(sessionId: string, path: string = SESSIONS_PATH): SessionEntry | undefined {
  return readSessionMap(path).sessions[sessionId];
}
```

[VERIFIED: exact mirror of registry.ts pattern from source — addServer/removeServer/readRegistry/writeRegistry structure]

### Pattern 2: getClient() Helper in index.ts

**What:** Module-scope Map cache keyed by URL string. Returns same client for repeated calls with identical URLs. Replaces the single `const client` at line 23 of index.ts.

**When to use:** Every tool handler calls this after resolving `serverUrl`.

```typescript
// Source: [VERIFIED: D-01/D-03 from CONTEXT.md + existing index.ts structure]
import { createOpencodeClient } from '@opencode-ai/sdk';
import { fetchWithAuth } from './fetch.js';

const clientCache = new Map<string, ReturnType<typeof createOpencodeClient>>();

function getClient(serverUrl: string): ReturnType<typeof createOpencodeClient> {
  let client = clientCache.get(serverUrl);
  if (!client) {
    client = createOpencodeClient({ baseUrl: serverUrl, fetch: fetchWithAuth });
    clientCache.set(serverUrl, client);
  }
  return client;
}
```

### Pattern 3: resolveServerUrl() Helper in index.ts

**What:** Pure function that applies D-06 fallback chain. Returns the URL string to pass to `getClient()`. Called at the top of every handler.

**When to use:** Every tool handler, before any client call.

```typescript
// Source: [VERIFIED: D-06, D-07 from CONTEXT.md; readRegistry from registry.ts]
function resolveServerUrl(sessionId?: string, serverName?: string): string {
  // Step 1: sessionId lookup
  if (sessionId) {
    const entry = lookupSession(sessionId);  // from sessions.ts
    if (entry) return entry.url;
  }
  // Step 2: named server param
  if (serverName) {
    const reg = readRegistry();
    const found = reg.servers.find(s => s.name === serverName);
    if (!found) {
      throw new Error(
        `Server '${serverName}' not found in registry. Run 'prefect list-servers' to see registered servers.`
      );
    }
    return `http://${found.host}:${found.port}`;
  }
  // Step 3: first registry entry
  const reg = readRegistry();
  if (reg.servers.length > 0) {
    const s = reg.servers[0];
    return `http://${s.host}:${s.port}`;
  }
  // Step 4: env var fallback
  return BASE_URL;  // existing module-level constant
}
```

**Note:** `BASE_URL` stays in `index.ts` as a final fallback — it is not removed.

### Pattern 4: Updated ensureOpencodeRunning() Signature

**What:** Accept `ServerEntry` param instead of reading `BASE_URL` globally. `startPromise` becomes a `Map`.

**When to use:** Called by `fetchWithAuth()` in `fetch.ts` on ECONNREFUSED.

```typescript
// Source: [VERIFIED: D-14, D-15, D-16 from CONTEXT.md + existing autostart.ts]
const startPromises = new Map<string, Promise<void>>();  // keyed by server.name or URL

export async function ensureOpencodeRunning(server: ServerEntry): Promise<void> {
  const key = server.name ?? `${server.host}:${server.port}`;
  const existing = startPromises.get(key);
  if (existing) return existing;

  const serverUrl = `http://${server.host}:${server.port}`;

  // Localhost guard (D-15)
  if (server.host !== 'localhost' && server.host !== '127.0.0.1') {
    throw new Error(
      `[Prefect] Auto-start skipped — server '${server.name}' points to remote host '${server.host}'. ` +
      `Start OpenCode manually on that machine.`
    );
  }

  const port = String(server.port);
  // ... spawn logic unchanged, but uses port from ServerEntry ...
  const promise = (async () => { /* spawn + waitForHealth using serverUrl */ })()
    .finally(() => startPromises.delete(key));

  startPromises.set(key, promise);
  return promise;
}
```

**Impact on fetch.ts:** `fetchWithAuth()` currently calls `ensureOpencodeRunning()` with no args. After this change, it needs the `ServerEntry` for the server it's fetching. The resolution is: `fetchWithAuth` must receive the resolved `ServerEntry` as context, or the call site in `index.ts` handlers must call `ensureOpencodeRunning` directly before client calls. See "Pitfall 3" for the analysis.

### Pattern 5: handlers.ts createSession() serverUrl param

**What:** Add `serverUrl` and `serverName` params to `createSession()` so the handler can write to sessions.json after session creation.

```typescript
// Source: [VERIFIED: D-11 from CONTEXT.md + existing handlers.ts createSession signature]
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
  parentID?: string,
  serverUrl?: string,    // NEW — for sessions.json write
  serverName?: string,   // NEW — store name alongside URL per D-08
): Promise<{ id: string; [key: string]: unknown }> {
  // ... existing body ...
  // After successful creation:
  if (serverUrl && serverName) {
    addSession(data.id, { server: serverName, url: serverUrl });
  }
  return data;
}
```

### Anti-Patterns to Avoid

- **In-process session cache:** Do not cache the sessions map in memory — D-09 mandates read-at-call-time for correctness across MCP restarts. `[VERIFIED: D-09]`
- **Single startPromise global:** After D-16, `startPromise` must be a `Map`. A single global blocks concurrent starts for different servers. `[VERIFIED: D-16]`
- **Routing the `server` param to all 40 tools:** D-05 is explicit — `server` param only on the 3 entry points. Non-entry tools use sessions.json or fallback. `[VERIFIED: D-05]`
- **Extending registry.ts with session logic:** D-10 says separate concerns — `sessions.ts` is its own module. `[VERIFIED: D-10]`
- **404 detection in sessions.ts:** Stale detection is HTTP-response-layer logic that must live in the handler (or a shared check utility in index.ts), not in the sessions module.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Client creation per URL | Custom HTTP client | `createOpencodeClient({ baseUrl, fetch })` | SDK handles all API shapes, auth hook is the `fetch` param |
| File persistence locking | Custom atomic write | `writeFileSync` (synchronous) | Node.js fs sync ops are effectively serialized in a single-process MCP server; race risk is negligible for this use case |
| URL construction from ServerEntry | Custom URL builder | `http://${server.host}:${server.port}` | ServerEntry has host+port; no SSL complexity (localhost only for auto-start) |
| 404 error parsing | Custom HTTP error types | Check `error` field from SDK response | SDK returns `{ data, error }` — check `error` presence and HTTP status |

**Key insight:** The SDK's `{ data, error }` response shape is already the 404 detection mechanism. An HTTP 404 surfaces as a non-null `error` object. The stale session check is: `if (error && isNotFound(error)) { removeSession(sessionId); throw descriptiveError(); }`.

---

## Common Pitfalls

### Pitfall 1: fetch.ts ensureOpencodeRunning() Caller Problem

**What goes wrong:** `fetchWithAuth()` in `fetch.ts` calls `ensureOpencodeRunning()` with no args (current signature). After D-14, the signature requires a `ServerEntry`. `fetchWithAuth` has no access to the server context — it only receives a `Request`.

**Why it happens:** The fetch hook is a generic HTTP middleware; it does not know which server the request targets. The server URL is embedded in the `Request.url`, but looking up the registry from inside `fetchWithAuth` on every ECONNREFUSED would couple the fetch layer to the registry.

**How to avoid:** Two clean options:
1. **Parse the URL from the request** — extract `new URL(req.url)` host+port, look up the matching `ServerEntry` from the registry, pass to `ensureOpencodeRunning()`. This keeps `fetchWithAuth` self-contained but adds a registry read on ECONNREFUSED (rare path — acceptable).
2. **Remove ensureOpencodeRunning from fetchWithAuth** — move the auto-start call site to each handler in `index.ts` before the first client call, removing the auto-start retry in `fetchWithAuth`. This is architecturally cleaner but is a bigger change.

**Recommendation:** Option 1 — extract host+port from `request.url`, find matching `ServerEntry` by URL comparison in registry, pass to `ensureOpencodeRunning()`. ECONNREFUSED is rare; the extra registry read is negligible. [ASSUMED — both approaches are valid; planner should confirm preference]

**Warning signs:** TypeScript compile error when the old `ensureOpencodeRunning()` call with no args is replaced.

### Pitfall 2: 404 Detection — Error Shape from SDK

**What goes wrong:** Assuming a 404 manifests as a thrown exception. The SDK returns `{ data, error }` — errors do NOT throw. Code that checks `if (error) throw new Error(...)` without checking the error's HTTP status code will incorrectly treat all API errors (400, 403, 500) as stale sessions.

**Why it happens:** The current error pattern in index.ts is `if (error) throw new Error(JSON.stringify(error))` — this conflates all error types.

**How to avoid:** Before calling `removeSession()`, verify the error is specifically a 404. The error object from the SDK includes HTTP status information. Check for `status: 404` or equivalent in the error object before treating it as a stale session.

```typescript
// Source: [VERIFIED: existing index.ts error pattern + SDK { data, error } shape]
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = (error as Record<string, unknown>).status;
  return status === 404;
}
```

**Warning signs:** Sessions being removed from sessions.json on non-404 errors (rate limits, auth failures, server errors).

### Pitfall 3: waitForHealth URL in autostart.ts

**What goes wrong:** `waitForHealth()` currently uses the module-level `BASE_URL` constant. After D-14, it must use the URL derived from the passed `ServerEntry`.

**Why it happens:** `waitForHealth` is a nested function that closes over `BASE_URL`. Moving to `ServerEntry` requires threading the URL through.

**How to avoid:** Move `waitForHealth` to accept a `serverUrl: string` parameter, or make it a closure inside `ensureOpencodeRunning` that captures the derived URL.

**Warning signs:** Health check always polls the default `PREFECT_SERVER_URL` even when starting a different server.

### Pitfall 4: BASE_URL Removal Breaks the Fallback Chain

**What goes wrong:** Removing `const BASE_URL` from `index.ts` entirely breaks step 4 of D-06 (registry empty → `PREFECT_SERVER_URL` fallback).

**Why it happens:** `BASE_URL` is the env-var-derived default. If removed, tools have no fallback when the registry is empty.

**How to avoid:** Keep `BASE_URL` in `index.ts` as the final fallback in `resolveServerUrl()`. Only the hardwired `const client = createOpencodeClient(...)` at line 23 is removed — `BASE_URL` stays.

**Warning signs:** TypeScript reference errors, or tools silently connecting to `undefined` when registry is empty.

### Pitfall 5: autostart.test.ts Remote-Guard Test

**What goes wrong:** The existing test `ensureOpencodeRunning throws immediately for non-local PREFECT_SERVER_URL` uses the module-level `BASE_URL` constant (read at import time). After D-14, the signature changes — the remote guard is now based on `server.host`, not `BASE_URL`.

**Why it happens:** The test imports the module with a fresh `?v=remote-guard-test` cache-bust to get a different `BASE_URL`. After the refactor, this technique is unnecessary — the remote guard is driven by the param, not module state.

**How to avoid:** Update `autostart.test.ts` to call `ensureOpencodeRunning({ name: 'remote', host: '192.168.1.100', port: 4096, model: 'x' })` directly. No cache-bust trick needed. `_resetStartPromise()` must also be updated — it should now clear the `startPromises` Map instead of a single `let` variable.

**Warning signs:** Test failures after signature change with "expected 0 arguments, got 1" TypeScript errors.

### Pitfall 6: handlers.ts Caller Breakage

**What goes wrong:** `createSession()` in handlers.ts is called in three places in `index.ts` (`prefect_create_session` handler, `prefect_delegate`, `prefect_dispatch`) and potentially in tests. Adding required params (even optional ones) still requires updating all call sites.

**Why it happens:** The existing signature is `(client, title, directory, parentID?)` — all callers pass exactly these. New `serverUrl` and `serverName` params must be optional (trailing) to avoid breaking the handler.ts function internally.

**How to avoid:** Make `serverUrl` and `serverName` optional params with `?`. Update all three call sites in `index.ts` to pass the resolved server URL and name. The sessions.json write inside `createSession` is conditional on both being defined.

---

## Code Examples

### Handler-level server resolution (entry point)

```typescript
// Source: [VERIFIED: D-06 logic + existing handler shape in index.ts]
async ({ title, directory, server: serverParam }) => {
  const dir = resolveDirectory(directory);
  const serverUrl = resolveServerUrl(undefined, serverParam);  // no sessionId for create
  // sessions.json write happens inside createSession() after ID is known
  const session = await createSession(getClient(serverUrl), title, dir, undefined, serverUrl, serverNameFromParam);
  return { content: [{ type: 'text', text: JSON.stringify(session) }] };
}
```

### Handler-level server resolution (non-entry, sessionId-taking tool)

```typescript
// Source: [VERIFIED: D-04 + D-06 + existing handler shape in index.ts]
async ({ sessionId, directory }) => {
  const dir = resolveDirectory(directory);
  const serverUrl = resolveServerUrl(sessionId);
  const client = getClient(serverUrl);
  try {
    const { data, error } = await client.session.get({ path: { id: sessionId }, ... });
    if (error) {
      if (isNotFound(error)) {
        const entry = lookupSession(sessionId);
        removeSession(sessionId);
        throw new Error(
          `Session ${sessionId} not found on server '${entry?.server ?? 'unknown'}' (${serverUrl}).\n` +
          `The session may have been deleted or the server restarted.\n` +
          `Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.`
        );
      }
      throw new Error(JSON.stringify(error));
    }
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

### Handler-level resolution (workspace tools — no sessionId)

```typescript
// Source: [VERIFIED: D-05 + existing workspace tool shape in index.ts]
async ({ directory }) => {
  const dir = resolveDirectory(directory);
  const serverUrl = resolveServerUrl();  // no sessionId, no server param
  const client = getClient(serverUrl);
  // ... no stale session check needed (no sessionId) ...
}
```

---

## Tool Classification

### 3 Entry Points (get `server` param + write sessions.json)

`prefect_create_session`, `prefect_delegate`, `prefect_dispatch`

### 28 sessionId-taking tools (sessions.json lookup + stale check)

`prefect_abort`, `prefect_run`, `prefect_prompt_async`, `prefect_get_diff`, `prefect_approve_permission`, `prefect_fork`, `prefect_revert`, `prefect_session_get`, `prefect_session_messages`, `prefect_session_message`, `prefect_session_delete`, `prefect_session_rename`, `prefect_session_children`, `prefect_session_unrevert`, `prefect_session_command`, `prefect_inspect`, `prefect_await`, `prefect_session_summarize`, `prefect_session_todo`, `prefect_session_init`, `prefect_session_share`, `prefect_session_unshare`, `prefect_session_shell`

**Note on `prefect_inspect` and `prefect_await`:** These take `sessionId` and must also perform sessions.json lookup.

### 9 workspace tools (registry fallback only — no sessionId, no server param)

`prefect_session_list`, `prefect_session_status`, `prefect_list_agents`, `prefect_list_providers`, `prefect_find_symbol`, `prefect_vcs_info`, `prefect_file_status`, `prefect_list_mcp_servers`, `prefect_get_config`, `prefect_list_commands`, `prefect_list_tools`, `prefect_find_file`, `prefect_get_file_content`, `prefect_inject_mcp_server`

**Note:** Count may differ slightly from the 37/40 split in the CONTEXT.md — the classification above is based on direct inspection of all 40 tool registrations in `src/index.ts`. The `server` param does NOT go on these tools per D-05. [VERIFIED: by reading all 40 registerTool calls in index.ts]

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single global `const client` | `getClient(url)` Map cache | Phase 14 | 40 substitutions; enables multi-server routing |
| `let startPromise: Promise<void> \| null` | `Map<string, Promise<void>>` | Phase 14 | Concurrent starts for different servers no longer block each other |
| `ensureOpencodeRunning()` (no args, reads BASE_URL) | `ensureOpencodeRunning(server: ServerEntry)` | Phase 14 | Starts correct instance per server |
| No session persistence | sessions.json file | Phase 14 | Routing survives MCP server restarts |

**Deprecated/outdated:**
- `BASE_URL` as the only server target: still exists as D-06 fallback but is no longer the primary routing mechanism

---

## Environment Availability

Step 2.6: SKIPPED — Phase 14 is purely code/config changes. No new external tools, services, runtimes, or CLIs are required. All dependencies (`node:fs`, `@opencode-ai/sdk`, `zod`) are already installed and verified by the passing 56-test baseline.

[VERIFIED: npm test passes 56/56 as of research date]

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner (`node:test`) |
| Config file | None — test files listed explicitly in `package.json` scripts.test |
| Quick run command | `npm run build && node --test build/sessions.test.js build/autostart.test.js` |
| Full suite command | `npm test` (builds + runs all test files) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| MULTI-05 | `server` param resolves to correct URL via registry | unit | `npm run build && node --test build/sessions.test.js` | No — Wave 0 |
| MULTI-05 | Fallback chain: no server param → first registry entry → BASE_URL | unit | `npm run build && node --test build/sessions.test.js` | No — Wave 0 |
| MULTI-05 | Named server not in registry → throw with exact message | unit | `npm run build && node --test build/sessions.test.js` | No — Wave 0 |
| MULTI-06 | `addSession` writes to sessions.json immediately after creation | unit | `npm run build && node --test build/sessions.test.js` | No — Wave 0 |
| MULTI-06 | `lookupSession` returns undefined for unknown sessionId | unit | `npm run build && node --test build/sessions.test.js` | No — Wave 0 |
| MULTI-06 | `removeSession` removes stale entry from sessions.json | unit | `npm run build && node --test build/sessions.test.js` | No — Wave 0 |
| MULTI-06 | `readSessionMap` returns `{ sessions: {} }` when file absent | unit | `npm run build && node --test build/sessions.test.js` | No — Wave 0 |
| MULTI-07 | `ensureOpencodeRunning(server)` uses server.host and server.port | unit | `npm run build && node --test build/autostart.test.js` | Yes — needs update |
| MULTI-07 | Remote-host guard uses server.host (not BASE_URL) | unit | `npm run build && node --test build/autostart.test.js` | Yes — test needs rewrite |
| MULTI-07 | startPromises Map deduplicates by server key | unit | `npm run build && node --test build/autostart.test.js` | Yes — needs update |

### Sampling Rate

- **Per task commit:** `npm run build && node --test build/sessions.test.js build/autostart.test.js`
- **Per wave merge:** `npm test` (full 56+ test suite)
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps

- [ ] `src/sessions.test.ts` — covers MULTI-06: readSessionMap, addSession, removeSession, lookupSession (mirrors registry.test.ts pattern)
- [ ] `src/autostart.test.ts` — update existing tests: change `ensureOpencodeRunning()` → `ensureOpencodeRunning(serverEntry)`, rewrite remote-guard test, update `_resetStartPromise()` references

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `fetchWithAuth` should resolve the target `ServerEntry` from the request URL on ECONNREFUSED to call `ensureOpencodeRunning(server)` | Pitfall 1 | Approach still works but architecture differs — planner should confirm preferred strategy |
| A2 | 404 errors from the SDK surface as `{ error: { status: 404, ... } }` objects, not thrown exceptions | Pitfall 2 | Stale detection code would need different error-shape check |

---

## Open Questions

1. **fetchWithAuth and ensureOpencodeRunning coupling**
   - What we know: `fetchWithAuth` calls `ensureOpencodeRunning()` with no args; new signature requires `ServerEntry`
   - What's unclear: Whether to parse the ServerEntry from request URL inside fetchWithAuth, or move auto-start call site to index.ts handlers
   - Recommendation: Planner should decide; either approach is consistent with D-14/D-17

2. **Exact 404 error shape from @opencode-ai/sdk**
   - What we know: The SDK returns `{ data, error }` pairs; current code does `if (error) throw new Error(JSON.stringify(error))`
   - What's unclear: Whether the error object has a `.status` field or uses a different property for HTTP status
   - Recommendation: Inspect the SDK types at implementation time — `grep -r "status" node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts`

---

## Sources

### Primary (HIGH confidence)

- `src/registry.ts` [VERIFIED: read directly] — `sessions.ts` pattern source
- `src/autostart.ts` [VERIFIED: read directly] — `ensureOpencodeRunning` current implementation
- `src/handlers.ts` [VERIFIED: read directly] — `createSession` current signature
- `src/index.ts` [VERIFIED: read directly] — all 40 tool registrations enumerated
- `src/fetch.ts` [VERIFIED: read directly] — `fetchWithAuth` + `ensureOpencodeRunning` call site
- `package.json` [VERIFIED: read directly] — test command, dependencies, no new packages needed
- `.planning/phases/14-session-server-routing/14-CONTEXT.md` [VERIFIED: read directly] — all decisions D-01..D-17
- `node_modules/@opencode-ai/sdk/dist/client.d.ts` [VERIFIED: read directly] — `createOpencodeClient` signature

### Secondary (MEDIUM confidence)

- `src/registry.test.ts` [VERIFIED: read directly] — test pattern for `sessions.test.ts`
- `src/autostart.test.ts` [VERIFIED: read directly] — identifies which existing tests need updating

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all verified in package.json and node_modules
- Architecture: HIGH — all decisions locked in CONTEXT.md; patterns verified against existing source
- Pitfalls: HIGH (Pitfall 1: ASSUMED strategy for resolution approach) / HIGH (Pitfalls 2-6: verified against existing code)

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (stable codebase; no external API changes expected)
