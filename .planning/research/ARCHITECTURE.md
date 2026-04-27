# Architecture Research — Prefect v3.0

**Researched:** 2026-04-27
**Confidence:** HIGH — all findings from direct code and SDK type inspection

---

## Integration Map

| Feature | Files Modified | Files New | Integration Point |
|---------|---------------|-----------|------------------|
| directory param on all tools | `src/index.ts` | — | 15 existing tool handlers need `directory` in Zod schema + query arg; 3 already have it (create_session, session_list, session_status) |
| OPENCODE_DEFAULT_PROJECT env var | `src/index.ts` | — | Resolution helper reads env at call time; feeds into directory param propagation |
| auto-start opencode serve | `src/index.ts` | — | `main()` startup path + first-tool-call fallback; child_process spawn; process exit cleanup |
| HTTP Basic Auth | `src/index.ts` | — | `client.interceptors.request.use(...)` after `createOpencodeClient()` |
| opencode_delegate | `src/index.ts` | — | Calls existing handler functions directly (see Composite Tools section) |
| opencode_dispatch | `src/index.ts` | — | Calls existing handler functions directly |
| opencode_inspect | `src/index.ts` | — | Calls existing handler functions directly |
| opencode_await | `src/index.ts` | — | Calls existing handler functions directly + Node `setInterval` poll loop |
| GET /agent | `src/index.ts` | — | `client.app.agents({ query: ... })` — already in SDK |
| GET /provider | `src/index.ts` | — | `client.provider.list({ query: ... })` — already in SDK |
| GET /find/symbol | `src/index.ts` | — | `client.find.symbols({ query: { query, directory? } })` — already in SDK |
| npm distribution | `package.json` | — | name, publishConfig, files, exports fields; cli.ts path resolution change |

**All v3.0 work is in `src/index.ts` and `package.json`. No new source files needed.**

The single-file architecture holds. At ~1,221 LOC going into v3.0, the additions (≈400–500 LOC estimated) will push it toward 1,700 LOC. That remains tractable as a single file because every tool follows the same structural pattern and there is no cross-tool shared logic to hide.

---

## Directory Param Propagation

### Current state (v2.0 baseline)

Of the 18 existing tools, 10 already have `directory?: string` in their Zod schema and pass it to the SDK. Three do not: `opencode_abort`, `opencode_run`, `opencode_prompt_async`, `opencode_get_diff`, `opencode_approve_permission`, `opencode_fork`, `opencode_revert`, and `opencode_session_command` — these operate on sessions identified by `sessionId` and the session already has a pinned directory set at creation time, so the `directory` query param is less meaningful for them. However, the SDK types confirm that some of these endpoints do accept a `directory` query param.

### Resolution order

Implement a single helper function at module scope (not at client-init time):

```typescript
function resolveDirectory(toolParam?: string): string | undefined {
  return toolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}
```

Reading `process.env.OPENCODE_DEFAULT_PROJECT` at call time (inside each handler, not at module startup) means the env var is hot-reloadable: if a user sets it after the MCP server starts, it takes effect on the next tool call without restarting the server. This is the correct approach; the current `BASE_URL` and `TIMEOUT_MS` are read at module startup (a pre-existing limitation, not a pattern to copy for the new feature).

### Which tools get the directory param

Every tool that has a `query` object in its SDK call should accept and forward `directory`. This covers all 18 tools — even session-scoped tools (abort, run, diff, etc.) accept `directory` in some SDK endpoints, and adding it as an optional param costs nothing while enabling future multi-project scenarios. The Zod schema addition is identical across all tools:

```typescript
directory: z.string().optional().describe(
  'Absolute project root. Falls back to OPENCODE_DEFAULT_PROJECT env var, then omitted.'
),
```

### How to avoid 18 repetitive changes

Do not write a schema factory. The duplication is exactly 1 line of Zod per tool and is preferable to a clever abstraction that obscures what each tool accepts. The change is mechanical and safe; it is the kind of change that should be done in a single commit touching all 18 tools at once so reviewers can verify the pattern is consistent.

---

## Auth Injection

### SDK capability (HIGH confidence — verified from source)

The `@opencode-ai/sdk` `createClient()` returns a `Client` object with an `interceptors` property. The `OpencodeClient` wrapper exposes this via `client._client.interceptors` (the underlying `_client` is `protected` in `_HeyApiClient`, but `createOpencodeClient` returns an `OpencodeClient` which inherits it — verify at compile time whether the property is accessible).

The cleaner path: `createOpencodeClient` wraps `createClient` and calls `client.interceptors.request.use(fn)` before returning. The returned `OpencodeClient`'s internal client has the interceptor installed. Since `src/index.ts` calls `createOpencodeClient(...)`, the correct injection site is immediately after that call, using the same pattern the SDK itself uses internally for the directory rewrite:

```typescript
const client = createOpencodeClient({ baseUrl: BASE_URL });

// Auth injection — reads env at request time so hot-changes work
client._client.interceptors.request.use((request: Request) => {
  const user = process.env.OPENCODE_AUTH_USER;
  const pass = process.env.OPENCODE_AUTH_PASS;
  if (user && pass) {
    const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
    const headers = new Headers(request.headers);
    headers.set('Authorization', `Basic ${encoded}`);
    return new Request(request, { headers });
  }
  return request;
});
```

**Why `_client` not per-request:** The SDK's `security` field on each `RequestOptions` is the per-request mechanism, but it requires every call site to pass `security: [...]`. That means touching all 18 handlers. The interceptor approach is a single registration point that fires for every request automatically.

**Why not at `createOpencodeClient` config time:** The `Config.headers` option is set at client init time. Reading auth credentials at init time means changes to `OPENCODE_AUTH_USER`/`OPENCODE_AUTH_PASS` env vars do not take effect without restarting the MCP server. The interceptor approach reads env vars at request time, consistent with the `OPENCODE_DEFAULT_PROJECT` hot-reload design.

**Risk:** `_client` is typed `protected`. Check at compile time. If inaccessible, wrap it:

```typescript
// Alternative: pass a custom fetch to createOpencodeClient
const authFetch = (req: Request): Promise<Response> => {
  const user = process.env.OPENCODE_AUTH_USER;
  const pass = process.env.OPENCODE_AUTH_PASS;
  if (user && pass) {
    const encoded = Buffer.from(`${user}:${pass}`).toString('base64');
    const headers = new Headers(req.headers);
    headers.set('Authorization', `Basic ${encoded}`);
    return fetch(new Request(req, { headers }));
  }
  return fetch(req);
};
const client = createOpencodeClient({ baseUrl: BASE_URL, fetch: authFetch });
```

The `fetch` override is in the public `Config` interface (verified: `Config.fetch?: (request: Request) => ReturnType<typeof fetch>`). This is the safer integration point and should be the primary approach.

**New env vars:** `OPENCODE_AUTH_USER` and `OPENCODE_AUTH_PASS`. Both optional; auth is skipped when absent. Document in `.mcp.json` env table and README.

---

## Auto-start

### When to check

Check on `main()` startup, before `server.connect(transport)`. A startup check is preferable to a per-tool-call check because:
1. It gives immediate feedback if OpenCode is not running.
2. Avoids per-call overhead (health check adds latency to every tool).
3. The MCP server lifecycle is tied to Claude Code's session; if it starts, it should immediately know whether OpenCode is available.

If the startup check fails and spawn is attempted, the server should still connect the transport and surface the error through normal tool responses rather than crashing — Claude Code needs the server to be alive to receive error messages.

### Spawn mechanics

```typescript
import { spawn, ChildProcess } from 'node:child_process';

let opencodeProcess: ChildProcess | null = null;

async function ensureOpenCode(): Promise<void> {
  try {
    const res = await fetch(`${BASE_URL}/global/health`, { signal: AbortSignal.timeout(2000) });
    if (res.ok) return;
  } catch {
    // not running — fall through to spawn
  }
  opencodeProcess = spawn('opencode', ['serve', '--port', String(new URL(BASE_URL).port || '4096')], {
    detached: false,          // die with parent
    stdio: 'ignore',          // don't corrupt MCP stdio stream
  });
  opencodeProcess.on('error', (err) => {
    console.error(`[prefect] failed to start opencode: ${err.message}`);
  });
  opencodeProcess.on('exit', (code) => {
    console.error(`[prefect] opencode exited with code ${code}`);
    opencodeProcess = null;
  });
  // Wait for OpenCode to be ready (poll with backoff, max 10s)
  await waitForHealth(BASE_URL, 10_000);
}
```

### Process tracking and cleanup

```typescript
process.on('exit', () => {
  if (opencodeProcess && !opencodeProcess.killed) {
    opencodeProcess.kill();
  }
});
process.on('SIGINT', () => process.exit(0));
process.on('SIGTERM', () => process.exit(0));
```

**Important:** `stdio: 'ignore'` is mandatory. The MCP server communicates with Claude Code via stdout (JSON-RPC). If OpenCode's server writes anything to its stdout and it is inherited, the MCP stream is corrupted. Set `stdio: ['ignore', 'ignore', 'pipe']` if you want OpenCode's stderr for debugging; pipe it to `console.error`.

### Health wait implementation

```typescript
async function waitForHealth(baseUrl: string, maxMs: number): Promise<void> {
  const deadline = Date.now() + maxMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${baseUrl}/global/health`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return;
    } catch { /* not ready yet */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`OpenCode did not become healthy within ${maxMs}ms`);
}
```

### Configuration

Add `OPENCODE_AUTO_START` env var (default `true`). Users who want to manage OpenCode's lifecycle manually can set `OPENCODE_AUTO_START=false`. The `opencode` binary must be on `PATH` — document this requirement.

---

## Composite Tools

### Decision: call shared handler functions, not duplicate HTTP

The four workflow tools (`opencode_delegate`, `opencode_dispatch`, `opencode_inspect`, `opencode_await`) compose existing tool behaviour. The correct implementation is to extract the inner logic of existing tool handlers into named async functions, then call those functions from both the original tool handler and the composite tool handlers.

### Refactor pattern

Before composite tools can be added, the existing handlers that they compose must be refactored from inline anonymous functions to named module-scope functions:

```typescript
// Extract from opencode_create_session handler:
async function createSession(args: { title?: string; directory?: string }) {
  const dir = resolveDirectory(args.directory);
  const { data, error } = await client.session.create({
    body: { title: args.title },
    query: dir ? { directory: dir } : undefined,
  });
  if (error) throw new Error(JSON.stringify(error));
  return data!;
}

// Extract from opencode_run handler:
async function runPrompt(args: { sessionId: string; prompt: string; model?: ...; agent?: string; system?: string }) {
  // AbortController logic + client.session.prompt call
  // Returns { info, parts }
}

// Extract from opencode_get_diff handler:
async function getDiff(args: { sessionId: string; messageID?: string }) {
  // Returns FileDiff[] with patch
}

// Extract from opencode_session_status handler:
async function getStatus(args: { directory?: string }) {
  // Returns status map
}

// Extract from opencode_session_messages handler:
async function getMessages(args: { sessionId: string; limit?: number }) {
  // Returns messages array
}
```

The original `server.registerTool()` handlers become thin wrappers that call these functions and format the result:

```typescript
server.registerTool('opencode_create_session', { ... }, async (args) => {
  try {
    const data = await createSession(args);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
});
```

### Composite tool implementations

**opencode_delegate** — blocking create+run+diff:
```typescript
async (args: { prompt: string; title?: string; directory?: string; ... }) => {
  const session = await createSession({ title: args.title, directory: args.directory });
  const result = await runPrompt({ sessionId: session.id, prompt: args.prompt, ... });
  const diffs = await getDiff({ sessionId: session.id });
  return { content: [{ type: 'text', text: JSON.stringify({ session, result, diffs }) }] };
}
```

**opencode_dispatch** — non-blocking create+prompt_async:
```typescript
async (args: { prompt: string; title?: string; directory?: string }) => {
  const session = await createSession({ title: args.title, directory: args.directory });
  await client.session.promptAsync({ path: { id: session.id }, body: { parts: [{ type: 'text', text: args.prompt }] } });
  return { content: [{ type: 'text', text: JSON.stringify({ sessionId: session.id, accepted: true }) }] };
}
```

**opencode_inspect** — compact snapshot: status + todo + changed files:
```typescript
async (args: { sessionId: string }) => {
  const [statusMap, diffs] = await Promise.all([
    getStatus({}),
    getDiff({ sessionId: args.sessionId }),
  ]);
  const status = statusMap[args.sessionId];
  const changedFiles = diffs.map(d => d.file);
  return { content: [{ type: 'text', text: JSON.stringify({ status, changedFiles, diffCount: diffs.length }) }] };
}
```

**opencode_await** — poll dispatch session to completion:
```typescript
async (args: { sessionId: string; pollIntervalMs?: number; timeoutMs?: number }) => {
  const interval = args.pollIntervalMs ?? 2000;
  const timeout = args.timeoutMs ?? TIMEOUT_MS;
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const statusMap = await getStatus({});
    const status = statusMap[args.sessionId];
    if (!status || status.type === 'idle') {
      const result = await getMessages({ sessionId: args.sessionId, limit: 1 });
      const diffs = await getDiff({ sessionId: args.sessionId });
      return { content: [{ type: 'text', text: JSON.stringify({ status, result, diffs }) }] };
    }
    await new Promise(r => setTimeout(r, interval));
  }
  return { content: [{ type: 'text', text: `opencode_await timed out after ${timeout}ms` }], isError: true };
}
```

### Why not duplicate HTTP calls

Duplicating the SDK calls in each composite tool would create divergence: if the underlying tools are modified (e.g. directory param propagation, auth injection), the composite tools would need to be updated separately. Shared functions means a single change site.

The refactor to named functions adds ~30-50 LOC of structural overhead but eliminates the maintenance risk. The refactor is mechanical — no logic changes, just extraction.

---

## New Simple GET Wrappers (Agent, Provider, Symbol)

These three tools are purely additive. They follow the existing `directory`-optional tool pattern and require no new architecture. SDK methods are already present:

- `client.app.agents({ query: { directory? } })` → GET /agent
- `client.provider.list({ query: { directory? } })` → GET /provider
- `client.find.symbols({ query: { query: string, directory? } })` → GET /find/symbol

Each becomes one `server.registerTool()` call. The `find.symbols` tool needs a required `query` string param (the symbol search string) in addition to the optional `directory`. This is the only one of the three that has a required input param beyond `directory`.

The `/find/symbol` endpoint maps to `client.find.symbols()` in the SDK (note: the method is `symbols`, plural — verified from `sdk.gen.d.ts` line 238).

---

## npm Distribution

### package.json changes

```json
{
  "name": "prefect-mcp",
  "version": "3.0.0",
  "publishConfig": {
    "access": "public"
  },
  "files": [
    "build/",
    "README.md"
  ],
  "exports": {
    ".": "./build/index.js"
  },
  "bin": {
    "prefect": "./build/cli.js"
  }
}
```

The `bin` entry currently points to `build/cli.js` for the `prefect` binary. That is correct for distribution — users run `prefect init` to wire up `.mcp.json`.

### CLI path resolution for global installs

The critical issue: `src/cli.ts` currently resolves the MCP server path as:

```typescript
const mcpServerPath = resolve(__dirname, 'index.js');
```

Where `__dirname` is derived from `import.meta.url`. When installed globally (`npm install -g prefect-mcp`), `build/cli.js` and `build/index.js` are both in the same npm-installed package directory (e.g. `/usr/lib/node_modules/prefect-mcp/build/`). This resolution still works correctly — `resolve(__dirname, 'index.js')` will point to the installed `build/index.js`.

**No CLI path resolution change is needed for global installs.** The current resolution logic is already correct.

### What .mcp.json looks like after global install

Currently the CLI writes an absolute path to `build/index.js` in `args`. For a global install this would be something like `/usr/local/lib/node_modules/prefect-mcp/build/index.js`. That is correct behaviour. However, Claude Code would invoke the server as `node /usr/.../index.js`, which works fine.

An alternative for global installs is to write `command: "prefect-server"` and add a second bin entry:
```json
"bin": {
  "prefect": "./build/cli.js",
  "prefect-server": "./build/index.js"
}
```
Then the `.mcp.json` entry becomes `{ command: "prefect-server", args: [] }` — cleaner and path-independent. This requires the CLI to detect whether it is being run from a global install and emit the appropriate format. Detection: check if `process.env.npm_config_global` was set or compare the resolved path against npm's global prefix.

**Recommendation:** Keep the current absolute-path approach for now (it works for both local and global installs) and revisit the `prefect-server` bin approach as a polish step.

### `src/index.ts` shebang and chmod

The build script already does `chmod 755 build/index.js build/cli.js`. The `#!/usr/bin/env node` shebang is required on `build/index.js` if it is invoked directly (without `node`). Currently `.mcp.json` uses `command: "node", args: ["build/index.js"]` so the shebang is not strictly needed for local use, but it is good practice for a published package.

---

## Suggested Build Order

### Phase 1: Infrastructure (do first — everything else depends on clean base)

Features: **directory param propagation + OPENCODE_DEFAULT_PROJECT**

Why first:
- Mechanical change touching all 18 tool handlers — safest to do before adding new tools so there are no new tools to miss.
- The `resolveDirectory()` helper function is the foundation composite tools rely on.
- Completing this first means the test surface is small (18 existing tools, one helper function) and the change can be verified with existing test patterns before any new complexity is introduced.

Integration points: `src/index.ts` only. Add `resolveDirectory()` helper, add `directory` param to all tools that lack it, update query construction.

### Phase 2: Auth injection (before distribution, after infrastructure)

Features: **HTTP Basic Auth via custom fetch**

Why second:
- Auth must be in place before distribution — users should not publish a version without auth support and then have to re-install.
- Depends on Phase 1 being done so the auth fetch wrapper does not accidentally bypass directory resolution (they are independent, but reviewing them together confirms no interaction).
- Simple change: one `authFetch` wrapper function, one `createOpencodeClient` config change. Low risk, isolated to startup code.

Integration points: top-level constants block in `src/index.ts`.

### Phase 3: Auto-start (infrastructure complete, before composite tools)

Features: **auto-start opencode serve**

Why third:
- Composite tools (Phase 4) depend on being able to assume OpenCode is running. Auto-start gives them that guarantee.
- The `waitForHealth` helper written here is also useful to call from composite tools if they want to ensure the server is up before beginning a long workflow.
- Auto-start modifies `main()` and adds process lifecycle handlers — changes to startup, not to tool handlers — so it is safe to introduce after tool changes are stable.

Integration points: `main()` function and module-level process handlers in `src/index.ts`.

### Phase 4: Handler extraction + composite tools (depends on Phases 1-3)

Features: **opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await**

Why fourth:
- Requires the named function extraction refactor first — do the extraction as the opening step of this phase.
- The extraction is a pure structural refactor with no behaviour change; verify it builds and tests pass before adding the composite tools.
- Composite tools are the highest-risk feature (new polling logic, multi-call orchestration) and should be introduced when the foundation is stable.

Integration points: `src/index.ts` — extract 5 inner functions, add 4 new `server.registerTool()` calls.

### Phase 5: New simple GET tools (can be done any time after Phase 1)

Features: **opencode_agents (GET /agent), opencode_providers (GET /provider), opencode_find_symbol (GET /find/symbol)**

Why fifth:
- Purely additive, no dependencies. Could be done in Phase 1 as well.
- Placed here to keep Phase 1 focused on the mechanical directory-param propagation pass.
- Three `server.registerTool()` calls, each ~10 lines. Total addition ~35 LOC.

Integration points: `src/index.ts` — three new tool registrations.

### Phase 6: npm distribution (do last)

Features: **package.json changes, publishConfig, files, exports**

Why last:
- Distribution is a packaging concern, not a code concern. All features should be implemented and tested before touching the publish configuration.
- Doing it last means `npm publish` is a clean release of a finished set of features.
- The `prefect init` CLI path resolution requires no changes for global installs (current logic already correct), but this should be verified with a dry-run test of the global install path before publishing.

Integration points: `package.json` only.

---

## Refactoring Risks

### Handler extraction (Phase 4 prerequisite)

**Risk:** The extraction of inner handler logic into named functions is mechanical but touches every line of the most-used tools (`createSession`, `runPrompt`, `getDiff`, `getStatus`). A mis-extracted function that silently drops error handling would break existing tool behaviour.

**Mitigation:** Extract one function at a time, rebuild and test after each extraction. The existing test files (`build/parts.test.js`, `build/diff-patch.test.js`, `build/session-command.test.js`) provide some coverage; add a smoke test for each extracted function path.

### file size at 1,700+ LOC

At the estimated end-of-v3.0 size, `src/index.ts` approaches the threshold where navigation friction becomes real. The named-function extraction from Phase 4 actually helps here — named functions are easier to jump to than nested anonymous handlers. Consider adding a section comment structure:

```
// ─── CORE ────────────────────────────────────────────────────────────
// ─── SESSION ──────────────────────────────────────────────────────────
// ─── COMPOSITE ────────────────────────────────────────────────────────
// ─── DISCOVERY ────────────────────────────────────────────────────────
// ─── STARTUP ──────────────────────────────────────────────────────────
```

Do not split into multiple files unless the named-function extraction reveals genuine shared logic that would justify the navigation overhead of multiple imports.

### Auto-start process management

**Risk:** If `opencode` is already running on a different port and the auto-spawn tries to start a second instance on the configured port, the second instance may fail silently or conflict. The health check before spawn prevents duplicate spawns in the common case, but a race condition (two MCP server instances starting simultaneously) could cause both to attempt spawn.

**Mitigation:** For a personal-use tool, this is an acceptable risk. Document that auto-start is designed for single-instance use. The `OPENCODE_AUTO_START=false` opt-out covers users who manage their own OpenCode lifecycle.

---

## Sources

- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/src/index.ts` — v2.0 implementation (1,221 LOC, 18 tools)
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/src/cli.ts` — prefect init CLI
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/src/parts.ts` — Zod discriminated union for 12 Part types
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/package.json` — current package config
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/client.js` — `createOpencodeClient` implementation showing interceptor registration and `fetch` override pattern
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `OpencodeClient` class with `app.agents`, `provider.list`, `find.symbols` methods confirmed
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `AppAgentsData` (url: "/agent"), `ProviderListData` (url: "/provider"), `FindSymbolsData` (url: "/find/symbol") type shapes confirmed
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts` — `Config.fetch` override interface confirmed
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/client/utils.gen.d.ts` — `Middleware` / interceptor interface confirmed
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/core/auth.gen.js` — Basic Auth token assembly (`Basic ${btoa(token)}`)
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/.planning/PROJECT.md` — v3.0 feature scope and key decisions
