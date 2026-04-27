# Pitfalls Research — Prefect v3.0

**Domain:** TypeScript MCP server adding directory propagation, auto-start, auth, composite tools, new API wrappers, and npm distribution to an existing 1,221 LOC codebase.
**Researched:** 2026-04-27
**Confidence:** HIGH for stdio/spawn mechanics (verified from multiple GitHub issues and Node.js docs); HIGH for SDK auth (verified from type inspection); MEDIUM for composite tool timeout (OpenCode-side behavior is partly undocumented); HIGH for npm ESM publishing (verified from current docs).

---

## Critical Pitfalls

### PITFALL-V3-01: Spawned `opencode serve` child writes to inherited stdout, corrupting the MCP pipe

**Risk:** When the MCP server spawns `opencode serve` as a child process (auto-start feature), the child process's stdout must never be inherited. The MCP server's own stdout is the JSON-RPC pipe to Claude Code. If the child's stdout is set to `'inherit'` or piped to the parent's stdout, opencode's startup banner and log lines flow directly into the JSON-RPC stream and corrupt it. Claude Code gets a parse error (-32700) and silently disconnects.

**Warning sign:** Claude Code reports "MCP error -32700: Parse error" or the prefect server disappears from the tool list immediately after the auto-start path is hit. Running `node build/index.js` manually and watching stdout for non-JSON-RPC lines will confirm contamination.

**Prevention:** Spawn opencode with `stdio: ['ignore', 'ignore', 'pipe']` or `stdio: ['ignore', 'ignore', 'inherit']`. The child's stdout must be `'ignore'` — not `'inherit'`, not `'pipe'` unless you explicitly consume and discard every byte. The child's stderr can be `'pipe'` if you want to log opencode startup errors through `process.stderr` (safe), or `'inherit'` if you want them to appear in Claude Code's stderr stream. Never use `stdio: 'inherit'` shorthand — that maps all three handles to the parent's, which corrupts stdout.

**Phase:** The auto-start feature (INFRA phase). Must be the very first constraint encoded in the implementation task.

---

### PITFALL-V3-02: opencode child process is orphaned when Claude Code kills the MCP server

**Risk:** Claude Code spawns the MCP server as a stdio subprocess and kills it when the session ends. If the MCP server spawned `opencode serve` without `detached: true` + `subprocess.unref()`, the opencode process is tied to the MCP server's process group. When the MCP server is killed, opencode may or may not be killed depending on signal propagation — on Linux/WSL, a SIGKILL to the parent does not propagate to children by default. You can end up with orphaned opencode processes accumulating across Claude Code sessions, each holding port 4096. The next MCP server startup finds port 4096 busy and either fails to start or starts on a different port.

**Warning sign:** `ps aux | grep opencode` shows multiple `opencode serve` processes after several Claude Code sessions. The second session gets "EADDRINUSE" or "connection refused" because the port is taken.

**Prevention:** Two-part solution: (1) Use `detached: true` + `subprocess.unref()` if you want opencode to outlive the MCP server session (intentional daemon behavior). (2) Alternatively, register a `process.on('exit', ...)` handler in the MCP server that kills the opencode child with `subprocess.kill()`. Pick one model and document it. The daemon model is cleaner for daily use: spawn once at first tool call, `unref()` it, and let it run forever. The MCP server's shutdown no longer orphans it — it was always intended to be a persistent daemon. Include a PID file or lock file so the next MCP server startup can detect the existing instance without polling the port.

**Phase:** Auto-start INFRA phase. Must be decided before implementation starts — the two models have different health-check implications.

---

### PITFALL-V3-03: Health-check polling blocks the first tool call with no visible progress

**Risk:** After spawning `opencode serve`, the MCP server must poll `GET /global/health` before responding to the first tool call. opencode takes several seconds to initialize (LSP servers, SQLite, model loading). If the poll loop runs synchronously inside the tool handler, Claude Code's tool call sits pending with no output for 5-15 seconds. If the poll times out, the tool returns an error with no guidance, and Claude Code may retry the same tool call, spawning another opencode process.

Additionally: when `OPENCODE_SERVER_PASSWORD` is set, the `/global/health` endpoint returns 401, not 200 (confirmed from GitHub issue #12805 — health check is not exempt from auth). If health polling uses an unauthenticated fetch, it will never see a 200 and will time out even though the server is healthy.

**Warning sign:** `opencode_create_session` times out with "connection refused" after 120s despite opencode actually being up. Or, with auth enabled, the health poll loops until timeout despite returning 401.

**Prevention:** (a) Spawn on MCP server startup (`main()`) rather than on first tool call — this moves the wait out of user-visible tool latency. (b) Health poll loop must use the same authenticated fetch (with the Basic Auth `Authorization` header) as all other SDK calls. (c) Set a hard cap of ~15 seconds on the health poll; if opencode isn't up by then, log to stderr and continue — the tool call itself will fail with a network error, which is more actionable than a silent hang.

**Phase:** Auto-start INFRA phase.

---

### PITFALL-V3-04: Auth header injection via custom fetch — wrong pattern causes silent 401s

**Risk:** `createOpencodeClient` accepts a `fetch` option typed as `(request: Request) => ReturnType<typeof fetch>`. This is the only sanctioned way to inject an `Authorization: Basic ...` header for `OPENCODE_SERVER_PASSWORD`. If the `Authorization` header is set on the `Request` object that arrives in the custom fetch wrapper, it must not be overridden by the SDK. However, using `Headers.set()` on an already-constructed Request that has immutable headers will throw. The wrong implementation silently passes requests without auth and every call returns 401, which the SDK surfaces as `error: { ... }` objects, not thrown exceptions (since `throwOnError` defaults to false).

**Warning sign:** Every tool call returns `isError: true` with "401" in the message body. The SDK does not throw — it returns `{ data: undefined, error: {...} }` — so the bug presents as tool errors, not server crashes.

**Prevention:** Use the `Request` constructor pattern to clone the request with merged headers:

```typescript
function makeAuthFetch(username: string, password: string) {
  const encoded = Buffer.from(`${username}:${password}`).toString('base64');
  return (request: Request): ReturnType<typeof fetch> => {
    const authed = new Request(request, {
      headers: { ...Object.fromEntries(request.headers), Authorization: `Basic ${encoded}` },
    });
    return fetch(authed);
  };
}
```

Compute `encoded` once at startup, not per-request. Only inject auth if `OPENCODE_SERVER_PASSWORD` is set — keep the existing unauthenticated path when the env var is absent so zero-config installs continue working.

**Phase:** Auth INFRA phase.

---

### PITFALL-V3-05: opencode_delegate timeout is the sum of all three operations, breaching Claude Code's MCP timeout

**Risk:** `opencode_delegate` = `create_session` + `run` (blocking, up to PREFECT_TIMEOUT_MS) + `get_diff`. The Claude Code MCP tool call timeout is approximately 60 seconds by default (hardcoded in the MCP TypeScript SDK; configurable via `MCP_SERVER_REQUEST_TIMEOUT` env var on some clients). A delegate call where the model takes 55 seconds will cause Claude Code to cancel the tool call mid-flight. The SDK request is still running — the TCP connection to opencode is open — which can leave the session in a "busy" state that blocks subsequent calls.

**Warning sign:** `opencode_delegate` returns "MCP error -32001: Request timeout" while opencode continues processing. The session shows `status: { type: "busy" }` on the next `opencode_session_status` call. The user must manually call `opencode_abort` to unblock.

**Prevention:** (a) `opencode_delegate` must use an `AbortController` tied to a timeout that is safely shorter than Claude Code's MCP timeout — use `PREFECT_TIMEOUT_MS` (already established, defaults to 120s but users set it higher in `.mcp.json`). (b) Document clearly in the tool description: "for tasks expected to take over 60 seconds, use `opencode_dispatch` + `opencode_await` instead." (c) If the AbortController fires, call `opencode_abort` on the created session before returning the error, so the session is not left busy.

**Phase:** WORKFLOW composite tools phase.

---

### PITFALL-V3-06: npm publish ships `src/` TypeScript and `node_modules/` without a `files` field

**Risk:** `package.json` has no `files` field. `npm publish` includes everything not in `.npmignore` or `.gitignore`. This ships ~30 MB of `node_modules/`, all of `src/`, and `tsconfig.json` to the registry. The package will install slowly and present a confusing structure to consumers.

**Warning sign:** `npm pack --dry-run` output shows `node_modules/`, `src/*.ts`, `tsconfig.json` in the tarball listing.

**Prevention:** Add a `files` field before running `npm publish`:

```json
"files": ["build/", "README.md"]
```

Also add `"prepublishOnly": "npm run build"` to the scripts so the build is always fresh before publish. Verify with `npm pack --dry-run` that only `build/` and `README.md` are included. The `bin` field already points to `./build/cli.js` — this stays correct.

**Phase:** npm distribution phase. Do this before the first `npm publish` run.

---

### PITFALL-V3-07: `build/cli.js` missing executable bit after global install

**Risk:** `npm run build` already runs `chmod 755 build/index.js build/cli.js` — this sets the bit locally. However, if `npm publish` is run and the file permissions are not preserved in the tarball, globally-installed users will get a `cli.js` that is not executable. The `prefect` bin symlink will be created by npm but `node` will refuse to run the file directly without the shebang being honored by the shell.

**Warning sign:** After `npm install -g prefect-mcp`, running `prefect init` gives "Permission denied" on Linux/macOS. The shebang line `#!/usr/bin/env node` exists in the file but the execute bit is absent.

**Prevention:** The `files` field and `npm pack` preserve Unix permissions if set before packaging. Verify with `npm pack` and `tar tvf prefect-mcp-*.tgz | grep cli.js` that the mode shows `755`. Add `chmod 755 build/cli.js build/index.js` to `prepublishOnly` as a safety net.

**Phase:** npm distribution phase.

---

### PITFALL-V3-08: Zod v4 / MCP SDK incompatibility when adding schemas to existing tools

**Risk:** This codebase already uses Zod v4.3.6 and MCP SDK 1.29.0. GitHub issue modelcontextprotocol/typescript-sdk#925 documents that MCP SDK ≤1.17.5 is incompatible with Zod v4 (`w._parse is not a function`). Version 1.29.0 should be compatible, but adding 18 new `z.string().optional()` fields across all tool schemas is a large Zod surface expansion. If the MCP SDK version is bumped as part of v3.0 work, verify Zod compatibility before adding schema changes.

**Warning sign:** After any dependency upgrade, tools fail at registration time with `TypeError: w._parse is not a function` or `.describe()` chains stop propagating to the JSON Schema the client sees.

**Prevention:** Pin both `@modelcontextprotocol/sdk` and `zod` versions before adding the directory param. Run `npm test` after every dependency change. Do not upgrade either package during feature development unless there is a specific bug fix required.

**Phase:** Directory param propagation phase (first phase to touch all 18 tool schemas).

---

## Integration-Specific Risks

### RISK-01: `directory` param on tools that don't actually forward it to the SDK

**What goes wrong:** The v3.0 plan adds `directory: z.string().optional()` to all 18 tool schemas. Fourteen of those tools already have a `directory` query param in the SDK client call (verified in `src/index.ts`). The remaining tools (primarily `opencode_run`, `opencode_abort`, `opencode_fork`, `opencode_revert`, `opencode_approve_permission`) call endpoints that do not have a `directory` query param in the SDK. Adding `directory` to the Zod schema for those tools creates a silent discard: the user passes it, the tool accepts it, and silently ignores it.

**Prevention:** Before adding `directory` to a tool's schema, verify the corresponding SDK method accepts a `query.directory` param by checking the types in `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts`. For tools where the SDK does not accept `directory`, omit the param from the schema or document explicitly that it has no effect on that endpoint.

---

### RISK-02: `OPENCODE_DEFAULT_PROJECT` fallback must not override an explicitly passed `directory`

**What goes wrong:** The resolution order is: `per-tool directory param` → `OPENCODE_DEFAULT_PROJECT` → `process.cwd()`. If the implementation reads `OPENCODE_DEFAULT_PROJECT` unconditionally and passes it to all SDK calls, it overrides the per-tool `directory` param when both are set. This is backwards from the documented intent.

**Prevention:** Implement a single resolution helper:

```typescript
function resolveDirectory(perToolDir?: string): string | undefined {
  return perToolDir ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
  // process.cwd() fallback is OpenCode's own default — don't explicitly pass it
}
```

Do not pass the resolved value to the SDK if it is `undefined` — let OpenCode use its own default. This avoids sending an empty string as `directory`, which some endpoints may treat differently than omission.

---

### RISK-03: `opencode_await` polling loop blocks indefinitely if opencode session is stuck in `retry` status

**What goes wrong:** `opencode_await` polls `opencode_session_status` until the target session transitions from `busy` to `idle`. The status schema includes a third state: `{ type: "retry", attempt: number, message: string, next: number }`. If the model hits a rate limit and enters retry mode with a long `next` interval, the await loop runs for minutes. Claude Code's tool call timeout fires before the session finishes, leaving the session still running.

**Prevention:** `opencode_await` must have a maximum wall-clock timeout (use `PREFECT_TIMEOUT_MS`). On timeout, return the current status to the caller so they know the session is still in retry, rather than returning a generic error. Also surface the `retry.message` and `retry.next` fields in the timeout message so the caller can decide to call `opencode_await` again or `opencode_abort`.

---

### RISK-04: `client.app.agents()` and `client.config.providers()` — verify SDK method names before implementing

**What goes wrong:** The PROJECT.md targets `GET /agent` and `GET /provider`. The actual SDK methods (confirmed from docs) are `client.app.agents()` and `client.config.providers()` — not `client.agent.list()` or `client.provider.list()`. Writing the tool handler against a non-existent SDK method name compiles fine in TypeScript if the return type is inferred, but throws at runtime with "client.agent is not a function" or similar.

**Prevention:** Before implementing these tools, run `console.error(Object.keys(client))` from a scratch script against the installed SDK to confirm the namespace. Check `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` for the exact method signatures. `find.symbols()` (for the symbol search tool) follows the same pattern — verify it exists as `client.find.symbols`, not `client.find.symbol`.

---

### RISK-05: `prefect init` writes an absolute path to `build/index.js` that breaks after global install

**What goes wrong:** `src/cli.ts` resolves the MCP server path as `resolve(__dirname, 'index.js')`, which produces an absolute path like `/home/user/.nvm/versions/node/v22.0.0/lib/node_modules/prefect-mcp/build/index.js`. This works for global installs on the machine that ran `npm install -g`. But if `.mcp.json` is checked into git and shared, the absolute path breaks on any other machine where the global install path differs.

**Prevention:** Document this limitation prominently in README. For single-developer personal use (the stated scope), this is acceptable. If the path does break, users re-run `prefect init` on the new machine. Do not attempt to make the path relative — Claude Code spawns the MCP server from project root and relative paths in `.mcp.json` are resolved from there, not from the package location.

---

### RISK-06: Composite tools create sessions without explicit cleanup, accumulating orphan sessions

**What goes wrong:** `opencode_delegate` calls `create_session`, then `run`, then `get_diff`. If `run` fails or times out, the created session is never cleaned up. Over time, the opencode session list fills with failed delegate sessions. This is cosmetic but degrades `opencode_session_list` output and may affect performance if opencode has a session cap.

**Prevention:** On any error path inside `opencode_delegate`, attempt to delete the created session before returning the error. Use a try/finally pattern:

```typescript
const session = await client.session.create(...);
try {
  const result = await client.session.prompt(...);
  // ... get_diff ...
  return result;
} catch (err) {
  await client.session.abort({ path: { id: session.data!.id } }).catch(() => {});
  throw err;
}
```

The abort is best-effort — don't let a failed cleanup mask the original error.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Directory param on all 18 tools | Silently discarding `directory` on tools where SDK doesn't support it (RISK-01) | Check SDK types per tool before adding |
| `OPENCODE_DEFAULT_PROJECT` env var | Resolution order inversion — env overrides per-tool param (RISK-02) | Implement single `resolveDirectory()` helper |
| Auto-start `opencode serve` | stdout inheritance corrupts MCP pipe (PITFALL-V3-01) | Spawn with `stdio: ['ignore','ignore','pipe']` |
| Auto-start process lifecycle | Orphaned opencode processes on port 4096 (PITFALL-V3-02) | Decide daemon vs. owned-child model upfront |
| Health-check polling with auth | 401 from health endpoint treated as "not ready" (PITFALL-V3-03) | Auth headers required in health poll fetch |
| Auth via `OPENCODE_SERVER_PASSWORD` | Silent 401s from wrong header injection pattern (PITFALL-V3-04) | Custom fetch using Request cloning pattern |
| `opencode_delegate` blocking | Exceeds Claude Code's ~60s MCP tool timeout (PITFALL-V3-05) | Use `PREFECT_TIMEOUT_MS`, abort session on timeout |
| `opencode_await` polling | Infinite loop on `retry` status (RISK-03) | Hard wall-clock timeout with status surfacing |
| `GET /agent`, `/provider`, `/find/symbol` | Wrong SDK namespace — runtime "not a function" (RISK-04) | Verify against SDK types before implementing |
| npm publish | Ships `node_modules/` and `src/` without `files` field (PITFALL-V3-06) | Add `"files": ["build/", "README.md"]` first |
| npm global install | Missing executable bit on `build/cli.js` (PITFALL-V3-07) | Verify with `npm pack` + `tar tvf` before publish |
| `prefect init` after global install | Absolute path in `.mcp.json` breaks on different machines (RISK-05) | Document limitation; acceptable for stated scope |
| Composite tools session cleanup | Orphaned failed-delegate sessions (RISK-06) | try/finally abort pattern in delegate tools |

## Sources

- Node.js `child_process` docs — stdio option behavior: https://nodejs.org/api/child_process.html
- MCP stdio stdout corruption (GitHub issue, claude-flow #835): https://github.com/ruvnet/claude-flow/issues/835
- `detached: true` + `stdio: 'inherit'` incompatibility (nodejs/node #5549): https://github.com/nodejs/node/issues/5549
- OpenCode health check behind auth (anomalyco/opencode #12805): https://github.com/anomalyco/opencode/issues/12805
- OpenCode plugin client missing auth header (anomalyco/opencode #9706): https://github.com/anomalyco/opencode/issues/9706
- MCP tool timeout ~60s hardcoded (anthropics/claude-code #22542): https://github.com/anthropics/claude-code/issues/22542
- MCP SDK Zod v4 incompatibility (modelcontextprotocol/typescript-sdk #925): https://github.com/modelcontextprotocol/typescript-sdk/issues/925
- OpenCode port conflict freeze (anomalyco/opencode #19272): https://github.com/anomalyco/opencode/issues/19272
- OpenCode `OPENCODE_SERVER_PASSWORD` TUI conflict (anomalyco/opencode #8173): https://github.com/anomalyco/opencode/issues/8173
- TypeScript ESM npm publishing pitfalls (2025): https://lirantal.com/blog/typescript-in-2025-with-esm-and-cjs-npm-publishing
- `@opencode-ai/sdk` type inspection: `node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts` (verified `fetch` option signature)
- OpenCode SDK docs (client namespaces): https://opencode.ai/docs/sdk/
- OpenCode server auth docs: https://opencode.ai/docs/server/
