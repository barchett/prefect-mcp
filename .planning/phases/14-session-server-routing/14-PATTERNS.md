# Phase 14: Session-Server Routing - Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 5 new/modified files
**Analogs found:** 5 / 5

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/sessions.ts` | utility (persistence) | file-I/O | `src/registry.ts` | exact |
| `src/sessions.test.ts` | test | file-I/O | `src/registry.test.ts` | exact |
| `src/autostart.ts` | utility (infra) | request-response | `src/autostart.ts` (self — signature change) | self |
| `src/fetch.ts` | middleware | request-response | `src/fetch.ts` (self — caller update) | self |
| `src/handlers.ts` | service | request-response | `src/handlers.ts` (self — param addition) | self |
| `src/index.ts` | controller | request-response | `src/index.ts` (self — 40 handler substitutions) | self |

---

## Pattern Assignments

### `src/sessions.ts` (utility, file-I/O)

**Analog:** `src/registry.ts`

This is a new file. Mirror `src/registry.ts` exactly — same file I/O pattern, same read-at-call-time (no in-process cache), same `mkdirSync({ recursive: true })` guard. The only differences are: file path (`sessions.json` not `servers.json`), interface names (`SessionEntry`, `SessionMap`), and the data shape.

**Imports pattern** (`src/registry.ts` lines 1–3):
```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
```

**Interface and path constant pattern** (`src/registry.ts` lines 5–17):
```typescript
export interface ServerEntry {
  name: string;
  host: string;
  port: number;
  model: string;
}

export interface Registry {
  servers: ServerEntry[];
}

const REGISTRY_DIR = join(homedir(), '.config', 'prefect');
export const REGISTRY_PATH = join(REGISTRY_DIR, 'servers.json');
```

For `sessions.ts`, translate to:
```typescript
export interface SessionEntry {
  server: string;  // name from registry
  url: string;     // full http://host:port URL
}

export interface SessionMap {
  sessions: Record<string, SessionEntry>;
}

const SESSIONS_DIR = join(homedir(), '.config', 'prefect');
export const SESSIONS_PATH = join(SESSIONS_DIR, 'sessions.json');
```

**Read helper pattern** (`src/registry.ts` lines 19–31):
```typescript
export function readRegistry(registryPath: string = REGISTRY_PATH): Registry {
  try {
    const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
    if (!parsed || !Array.isArray(parsed.servers)) {
      throw new Error(`malformed registry at ${registryPath}: expected { servers: [...] }`);
    }
    return parsed as Registry;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { servers: [] };
    throw new Error(`could not parse ${registryPath}: ${(err as Error).message}`);
  }
}
```

For `sessions.ts`, the ENOENT fallback returns `{ sessions: {} }` instead of `{ servers: [] }`. The malformed check differs: `typeof parsed.sessions !== 'object'` instead of `!Array.isArray(parsed.servers)`.

**Write helper pattern** (`src/registry.ts` lines 33–36):
```typescript
export function writeRegistry(reg: Registry, registryPath: string = REGISTRY_PATH): void {
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');
}
```

Copy exactly — only rename the function and type.

**Mutation helpers pattern** (`src/registry.ts` lines 38–58):
```typescript
export function addServer(entry: ServerEntry, registryPath: string = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  const existing = reg.servers.findIndex((s) => s.name === entry.name);
  if (existing !== -1) {
    reg.servers[existing] = entry;
  } else {
    reg.servers.push(entry);
  }
  writeRegistry(reg, registryPath);
}

export function removeServer(name: string, registryPath: string = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  const before = reg.servers.length;
  reg.servers = reg.servers.filter((s) => s.name !== name);
  if (reg.servers.length === before) {
    throw new Error(`no server named '${name}' in registry`);
  }
  writeRegistry(reg, registryPath);
}
```

For `sessions.ts`, the equivalents are `addSession`, `removeSession`, and an additional `lookupSession` (point lookup by key — no equivalent in registry.ts since registry lists all servers):
```typescript
export function lookupSession(sessionId: string, path: string = SESSIONS_PATH): SessionEntry | undefined {
  return readSessionMap(path).sessions[sessionId];
}
```

---

### `src/sessions.test.ts` (test, file-I/O)

**Analog:** `src/registry.test.ts`

Mirror the test file structure exactly. Same test runner (`node:test`), same temp-dir isolation with `mkdtempSync`/`rmSync`, same `freshTmp()` helper, same build artifact existence check, same pattern of passing the path param to every function under test.

**Test file preamble pattern** (`src/registry.test.ts` lines 1–17):
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readRegistry, writeRegistry, addServer, removeServer } from './registry.js';

function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), 'prefect-registry-'));
}

const REGISTRY_BUILD = resolve(process.cwd(), 'build/registry.js');
if (!existsSync(REGISTRY_BUILD)) {
  throw new Error(`Build artifact missing: run 'npm run build' first`);
}
```

For `sessions.test.ts`, change:
- Import from `'./sessions.js'` (`readSessionMap`, `writeSessionMap`, `addSession`, `removeSession`, `lookupSession`)
- `freshTmp()` uses `'prefect-sessions-'` prefix
- Build check uses `'build/sessions.js'`

**Isolation pattern** (`src/registry.test.ts` lines 24–34 — representative test):
```typescript
test('readRegistry returns empty registry when file does not exist', () => {
  const dir = freshTmp();
  try {
    const regPath = join(dir, 'servers.json');
    // File is NOT created
    const reg = readRegistry(regPath);
    assert.deepEqual(reg, { servers: [] });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

Every test uses `try/finally` with `rmSync` — copy this isolation pattern for all `sessions.test.ts` tests.

**Required test coverage for `sessions.test.ts`** (maps to MULTI-06):
1. `readSessionMap` returns `{ sessions: {} }` when file absent
2. `writeSessionMap` creates parent dir and writes pretty-printed JSON with trailing newline
3. `addSession` writes entry immediately
4. `lookupSession` returns `undefined` for unknown sessionId
5. `lookupSession` returns the entry for a known sessionId
6. `removeSession` removes stale entry and persists
7. `removeSession` on unknown id does not throw (unlike `removeServer` — sessions.ts should silently no-op)

---

### `src/autostart.ts` (utility, request-response) — MODIFIED

**Analog:** `src/autostart.ts` (self — signature change)

Three changes only. Do not restructure the file.

**Change 1 — Import `ServerEntry`** (add after existing imports, line 1–3):
```typescript
import { ServerEntry } from './registry.js';
```

**Change 2 — Replace single `let startPromise` with a Map** (currently line 26):
```typescript
// BEFORE (line 26):
let startPromise: Promise<void> | null = null;

// AFTER:
const startPromises = new Map<string, Promise<void>>();
```

**Change 3 — Update `ensureOpencodeRunning` signature and internals** (currently lines 76–114):
```typescript
// BEFORE:
export async function ensureOpencodeRunning(): Promise<void> {
  if (startPromise) return startPromise;
  try {
    const { hostname } = new URL(BASE_URL);
    if (hostname !== 'localhost' && hostname !== '127.0.0.1') {
      throw new Error(`[Prefect] Auto-start skipped — PREFECT_SERVER_URL points to remote host '${hostname}'. ...`);
    }
  } catch (err) { ... }
  const port = parsePort(BASE_URL);
  ...
  startPromise = (async () => { ... })().finally(() => { startPromise = null; });
  return startPromise;
}

// AFTER:
export async function ensureOpencodeRunning(server: ServerEntry): Promise<void> {
  const key = server.name ?? `${server.host}:${server.port}`;
  const existing = startPromises.get(key);
  if (existing) return existing;

  if (server.host !== 'localhost' && server.host !== '127.0.0.1') {
    throw new Error(
      `[Prefect] Auto-start skipped — server '${server.name}' points to remote host '${server.host}'. ` +
      `Start OpenCode manually on that machine.`,
    );
  }

  const port = String(server.port);
  const serverUrl = `http://${server.host}:${server.port}`;
  const cwd = resolveDirectory(undefined);
  console.error(`[Prefect] OpenCode not reachable — spawning 'opencode serve --port ${port}'`);

  const promise = (async () => {
    const child = spawn('opencode', ['serve', '--port', port], {
      stdio: ['ignore', 'ignore', 'inherit'],
      cwd,
      detached: false,
    });
    child.unref();
    await waitForHealth(serverUrl);  // pass URL through
    console.error(`[Prefect] OpenCode is healthy at ${serverUrl}`);
  })().finally(() => startPromises.delete(key));

  startPromises.set(key, promise);
  return promise;
}
```

**Change 4 — Update `waitForHealth` to accept `serverUrl`** (currently lines 46–63):
```typescript
// BEFORE:
async function waitForHealth(): Promise<void> {
  ...
  const healthUrl = `${BASE_URL}/global/health`;

// AFTER:
async function waitForHealth(serverUrl: string): Promise<void> {
  ...
  const healthUrl = `${serverUrl}/global/health`;
```

**Change 5 — Update `_resetStartPromise`** (currently lines 116–118):
```typescript
// BEFORE:
export function _resetStartPromise(): void {
  startPromise = null;
}

// AFTER:
export function _resetStartPromise(): void {
  startPromises.clear();
}
```

**Note:** `BASE_URL` and `parsePort` in `autostart.ts` become unused after the refactor. Remove `BASE_URL` constant from autostart.ts (it reads the env var at module init — no longer needed since the caller now passes `ServerEntry`). Keep `parsePort` only if needed elsewhere; if not, remove it too.

---

### `src/fetch.ts` (middleware, request-response) — MODIFIED

**Analog:** `src/fetch.ts` (self — caller update for Pitfall 1)

**Current caller at line 35:**
```typescript
// src/fetch.ts line 35 (BEFORE):
await ensureOpencodeRunning();
```

**Resolution strategy (Pitfall 1 from RESEARCH.md — Option 1):** Extract host+port from `request.url`, look up matching `ServerEntry` from registry, pass to `ensureOpencodeRunning()`. ECONNREFUSED is a rare path — the extra registry read is negligible.

**Updated `fetchWithAuth` body** (`src/fetch.ts` lines 27–40):
```typescript
// src/fetch.ts (AFTER):
import { authFetch } from './auth.js';
import { ensureOpencodeRunning } from './autostart.js';
import { readRegistry } from './registry.js';

export async function fetchWithAuth(request: Request): Promise<Response> {
  const retry = request.clone();
  try {
    return await authFetch(request);
  } catch (err) {
    if (isConnRefused(err)) {
      // Resolve which ServerEntry matches this request's URL (Pitfall 1 resolution)
      const requestUrl = new URL(request.url);
      const reg = readRegistry();
      const matchedServer = reg.servers.find(
        (s) => s.host === requestUrl.hostname && String(s.port) === requestUrl.port,
      );
      if (matchedServer) {
        await ensureOpencodeRunning(matchedServer);
      } else {
        // No registry entry — construct a minimal ServerEntry from the URL
        await ensureOpencodeRunning({
          name: requestUrl.hostname,
          host: requestUrl.hostname,
          port: parseInt(requestUrl.port || '4096', 10),
          model: '',
        });
      }
      return authFetch(retry);
    }
    throw err;
  }
}
```

`isConnRefused` (lines 7–16) is unchanged.

---

### `src/handlers.ts` (service, request-response) — MODIFIED

**Analog:** `src/handlers.ts` (self — `createSession` gets two new optional trailing params)

**Current signature** (`src/handlers.ts` lines 25–30):
```typescript
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
  parentID?: string,
): Promise<{ id: string; [key: string]: unknown }> {
```

**Updated signature** (add `serverUrl` and `serverName` as trailing optionals):
```typescript
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
  parentID?: string,
  serverUrl?: string,   // NEW — for sessions.json write (D-11)
  serverName?: string,  // NEW — store name alongside URL per D-08
): Promise<{ id: string; [key: string]: unknown }> {
```

**Body addition** — after the existing `if (!data)` check at line 39, add:
```typescript
  // Write to sessions.json so all subsequent tool calls route to the correct server (D-11)
  if (serverUrl && serverName) {
    addSession(data.id, { server: serverName, url: serverUrl });
  }
  return data;
```

**Required import addition at top of handlers.ts:**
```typescript
import { addSession } from './sessions.js';
```

The existing error pattern (`src/handlers.ts` lines 38–39) is unchanged:
```typescript
  if (error) throw new Error(JSON.stringify(error));
  if (!data) throw new Error('createSession: API returned no data and no error');
```

---

### `src/index.ts` (controller, request-response) — MODIFIED

**Analog:** `src/index.ts` (self — getClient helper, resolveServerUrl helper, 40 handler substitutions)

#### New imports to add (after existing imports):
```typescript
import { readRegistry } from './registry.js';
import { lookupSession, removeSession } from './sessions.js';
```

#### Replace global `const client` (line 23) with `getClient` cache:
```typescript
// BEFORE (line 23):
const client = createOpencodeClient({ baseUrl: BASE_URL, fetch: fetchWithAuth });

// AFTER — remove that line, add:
const clientCache = new Map<string, ReturnType<typeof createOpencodeClient>>();

function getClient(serverUrl: string): ReturnType<typeof createOpencodeClient> {
  let c = clientCache.get(serverUrl);
  if (!c) {
    c = createOpencodeClient({ baseUrl: serverUrl, fetch: fetchWithAuth });
    clientCache.set(serverUrl, c);
  }
  return c;
}
```

#### New `resolveServerUrl` helper (add after `getClient`):
```typescript
function resolveServerUrl(sessionId?: string, serverName?: string): string {
  // Step 1: sessionId lookup in sessions.json
  if (sessionId) {
    const entry = lookupSession(sessionId);
    if (entry) return entry.url;
  }
  // Step 2: named server param (entry points only)
  if (serverName) {
    const reg = readRegistry();
    const found = reg.servers.find((s) => s.name === serverName);
    if (!found) {
      throw new Error(
        `Server '${serverName}' not found in registry. Run 'prefect list-servers' to see registered servers.`,
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
  return BASE_URL;
}
```

**Keep `BASE_URL` constant** (lines 14–21) — it is the Step 4 fallback. Do not remove it.

#### New `isNotFound` helper (add after `resolveServerUrl`):
```typescript
function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const status = (error as Record<string, unknown>).status;
  return status === 404;
}
```

#### `server` param Zod schema for the 3 entry points:
Add to inputSchema of `prefect_create_session`, `prefect_delegate`, `prefect_dispatch`:
```typescript
server: z.string().min(1).optional().describe(
  "Named server from registry (prefect list-servers). Omit to use the first registered server or PREFECT_SERVER_URL."
),
```

#### Handler substitution pattern — entry point (`prefect_create_session`, lines 40–48):
```typescript
// BEFORE:
async ({ title, parentID, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const session = await createSession(client, title, dir, parentID);
    return { content: [{ type: 'text', text: JSON.stringify(session) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}

// AFTER:
async ({ title, parentID, directory, server: serverParam }) => {
  const dir = resolveDirectory(directory);
  try {
    const serverUrl = resolveServerUrl(undefined, serverParam);
    // Determine serverName for sessions.json write — look up registry to get canonical name
    const reg = readRegistry();
    const serverEntry = reg.servers.find((s) => `http://${s.host}:${s.port}` === serverUrl);
    const serverName = serverEntry?.name ?? serverParam ?? 'default';
    const session = await createSession(getClient(serverUrl), title, dir, parentID, serverUrl, serverName);
    return { content: [{ type: 'text', text: JSON.stringify(session) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

#### Handler substitution pattern — sessionId-taking tool (`prefect_abort`, lines 61–73):
```typescript
// BEFORE:
async ({ sessionId, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.session.abort({
      path: { id: sessionId },
      query: dir ? { directory: dir } : undefined,
    });
    if (error) throw new Error(JSON.stringify(error));
    return { content: [{ type: 'text', text: String(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}

// AFTER:
async ({ sessionId, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const serverUrl = resolveServerUrl(sessionId);
    const { data, error } = await getClient(serverUrl).session.abort({
      path: { id: sessionId },
      query: dir ? { directory: dir } : undefined,
    });
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
    return { content: [{ type: 'text', text: String(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

#### Handler substitution pattern — workspace tool (no sessionId):
```typescript
// AFTER (representative — e.g. prefect_session_list):
async ({ directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const serverUrl = resolveServerUrl();  // no sessionId, no server param (D-05)
    const { data, error } = await getClient(serverUrl).session.list({
      query: dir ? { directory: dir } : undefined,
    });
    if (error) throw new Error(JSON.stringify(error));
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

#### Handler substitution pattern — `prefect_run` (uses `runPrompt` helper from handlers.ts):
```typescript
// AFTER (line 140–163 region):
async ({ sessionId, prompt, directory, model, agent, system, tools, files, messageID, agentInput, subtaskInput }) => {
  const dir = resolveDirectory(directory);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const serverUrl = resolveServerUrl(sessionId);
    const result = await runPrompt(getClient(serverUrl), sessionId, prompt, { ... }, dir, controller.signal);
    clearTimeout(timer);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    clearTimeout(timer);
    // ... AbortError handling unchanged ...
  }
}
```

#### `prefect_delegate` and `prefect_dispatch` — additional requirement:
These composite tools call `createSession()` internally. After the refactor, they must:
1. Accept `server` param in their inputSchema (same schema addition as entry points)
2. Call `resolveServerUrl(undefined, serverParam)` before calling `createSession`
3. Pass `serverUrl` and `serverName` to `createSession()` — same as `prefect_create_session`

---

## Shared Patterns

### File I/O (read-at-call-time, no in-process cache)
**Source:** `src/registry.ts` lines 19–31
**Apply to:** `src/sessions.ts` — all read/write functions
```typescript
// Every read goes through readFileSync — no module-level cache
const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
```

### Write with mkdir guard
**Source:** `src/registry.ts` lines 33–36
**Apply to:** `src/sessions.ts` — `writeSessionMap`
```typescript
mkdirSync(dirname(registryPath), { recursive: true });
writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');
```

### Error throwing on API error (non-404 path)
**Source:** `src/handlers.ts` line 38 and `src/index.ts` passim
**Apply to:** All handlers in `src/index.ts` — non-404 error path
```typescript
if (error) throw new Error(JSON.stringify(error));
```

### Error throwing on stale session (404 path — NEW in Phase 14)
**Source:** CONTEXT.md D-12 (exact message format required)
**Apply to:** All 28 sessionId-taking tool handlers in `src/index.ts`
```typescript
if (isNotFound(error)) {
  const entry = lookupSession(sessionId);
  removeSession(sessionId);
  throw new Error(
    `Session ${sessionId} not found on server '${entry?.server ?? 'unknown'}' (${serverUrl}).\n` +
    `The session may have been deleted or the server restarted.\n` +
    `Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.`,
  );
}
```

### Tool handler shape
**Source:** `src/index.ts` lines 30–48 (prefect_create_session — representative)
**Apply to:** All 40 tool handlers
```typescript
server.registerTool(
  'prefect_<name>',
  { description: '...', inputSchema: z.object({ ... }) },
  async (args) => {
    try {
      // ... resolve server, call client, check error ...
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### Test isolation (temp dir per test)
**Source:** `src/registry.test.ts` lines 10–12, 24–34
**Apply to:** `src/sessions.test.ts` — all tests
```typescript
function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), 'prefect-sessions-'));
}

test('...', () => {
  const dir = freshTmp();
  try {
    // ...
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

---

## No Analog Found

All files have close analogs. No entries in this section.

---

## Metadata

**Analog search scope:** `src/` directory
**Files scanned:** `src/registry.ts`, `src/registry.test.ts`, `src/autostart.ts`, `src/autostart.test.ts`, `src/handlers.ts`, `src/fetch.ts`, `src/index.ts` (first 180 lines)
**Pattern extraction date:** 2026-05-01
