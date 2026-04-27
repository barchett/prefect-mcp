# Stack Research — Prefect v3.0

**Project:** Prefect v3.0 (stack additions to existing TypeScript MCP server)
**Researched:** 2026-04-27
**Confidence:** HIGH — all findings verified directly from installed SDK types (node_modules) and Node.js 20.x built-in availability

---

## New Dependencies Needed

| Package | Version | Purpose | Why not built-in? |
|---------|---------|---------|-------------------|
| _none_ | — | — | Every v3.0 feature is covered by the existing stack or Node.js built-ins (see below) |

**Verdict: Zero new runtime dependencies required for v3.0.**

---

## Built-in Node.js Modules Sufficient For

**auto-start opencode serve**
- `node:child_process` (`spawn`) — launch `opencode serve --port N` as a detached subprocess
- `node:net` (`net.createConnection`) — TCP probe loop to wait until the port accepts connections; no HTTP needed for the readiness check
- `node:timers` (`setTimeout`, `setInterval`) — polling backoff; already used throughout codebase
- These are available on Node.js 20 (the runtime confirmed at `v20.20.0`), no install needed.

**OPENCODE_DEFAULT_PROJECT env var fallback**
- `process.env` — read `OPENCODE_DEFAULT_PROJECT` at startup; pure JavaScript, no package.
- `process.cwd()` — final fallback; built-in.
- Resolution order: per-tool `directory` param → `process.env.OPENCODE_DEFAULT_PROJECT` → `process.cwd()`.

**directory param propagation to all 18 tools**
- No new package. All 18 existing SDK calls already accept a `query: { directory? }` parameter — verified in `types.gen.d.ts` for every data type (`SessionListData`, `SessionGetData`, `AppAgentsData`, `FindSymbolsData`, `ProviderListData`, etc.). Only `opencode_create_session` currently passes it; the others need the same wiring added.

**Workflow composite tools (opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await)**
- Pure composition of existing `client.session.*` SDK calls plus the existing `createPatch` from the `diff` package already in `dependencies`. No new package.
- `opencode_await` poll loop uses `setTimeout` (built-in) with the existing `AbortController` timeout pattern.

**GET /agent, GET /provider, GET /find/symbol wrappers**
- All three are already in the installed `@opencode-ai/sdk@1.14.25`:
  - `client.app.agents(options?)` → `GET /agent` → `Array<Agent>` (verified: `sdk.gen.d.ts` line 263, `AppAgentsData` url `/agent`)
  - `client.provider.list(options?)` → `GET /provider` → `{ all: Array<Provider> }` (verified: `ProviderListData` url `/provider`)
  - `client.find.symbols({ query: { query, directory? } })` → `GET /find/symbol` → `Array<Symbol>` (verified: `FindSymbolsData` url `/find/symbol`)
- Zero new packages; just new `registerTool` calls.

**OpenCode server auth (OPENCODE_SERVER_PASSWORD + OPENCODE_SERVER_USERNAME)**
- The SDK `Config` interface (in `gen/core/types.gen.d.ts`) has a top-level `headers` field typed as `RequestInit["headers"] | Record<string, string | ...>`.
- `createOpencodeClient(config)` passes `config` straight through to `createClient(config)`, which forwards headers on every request.
- HTTP Basic Auth pattern: construct `Authorization: Basic <base64(user:pass)>` using Node.js `Buffer.from('user:pass').toString('base64')` (built-in `Buffer`, no `btoa` polyfill needed on Node 20).
- Inject once at client creation time: `createOpencodeClient({ baseUrl: BASE_URL, headers: { Authorization: \`Basic \${token}\` } })`.
- The SDK also exposes an `auth` config field with `scheme: "basic"` support (`auth.gen.d.ts` confirmed), but the raw `headers` approach is simpler and avoids the SDK-level auth callback indirection for this use case.
- `NEVER` put credentials in `.mcp.json` — pass via shell environment only. Document in README.

**npm distribution (npm publish + npm install -g)**
- No new packages needed for the publish workflow itself.
- `package.json` needs these fields added (currently missing — confirmed by inspection):
  - `"files": ["build/"]` — restrict what gets published to the `build/` directory only (excludes `src/`, tests, `.planning/`, etc.)
  - `"description"` — required for npm registry display
  - `"license"` — conventionally required; use `"MIT"` or `"UNLICENSED"`
  - `"engines": { "node": ">=20" }` — documents the runtime requirement
  - `"main"` or `"exports"` — needed if the package exposes any programmatic API; for a CLI-only package with `"bin"`, these are optional but good practice
- The existing `"bin": { "prefect": "./build/cli.js" }` is correct for `npm install -g` (global installs symlink the bin entry).
- `npm publish` is a CLI operation (`npm publish --access public`), not a code dependency.

---

## Do NOT Add

**`wait-on` / `wait-port` / similar port-readiness packages**
- `node:net` TCP probe loop is 10–15 lines and has no transitive dependencies. Adding `wait-on` (which pulls in `axios`, `joi`, and others) for a one-shot readiness check is disproportionate.

**`commander` / `yargs` / `meow`**
- The CLI (`src/cli.ts`) deliberately uses raw `process.argv` (a key decision validated in v2.0). No new subcommands are planned for v3.0 that would change this calculus.

**`node-fetch` / `axios` / `got`**
- Node.js 20 ships `fetch` globally. The SDK already uses it via its custom fetch wrapper. No HTTP polyfill needed.

**`execa` / `cross-spawn`**
- `child_process.spawn` from Node.js handles the `opencode serve` subprocess. `execa` adds Promise ergonomics but the auto-start path is a fire-and-forget background spawn — the ergonomics difference is minimal for this use case.

**`pino` / `winston` / any logging library**
- All Prefect logging uses `console.error` to stderr (deliberately — stdout is reserved for the JSON-RPC MCP stream). A structured logger adds configuration surface area and transitive deps for no gain in a single-process personal tool.

**`dotenv`**
- Credentials (`OPENCODE_SERVER_PASSWORD`, etc.) must come from the shell environment, not `.env` files. Adding dotenv would encourage anti-patterns (putting secrets in `.env` files that could land in git). Document in README that variables must be set in the shell, not in `.mcp.json`.

**`p-retry` / `p-timeout` / similar async utility packages**
- `opencode_await` polling loop is straightforward with `setTimeout` + `AbortController`. The retry logic is ~20 lines of code; a library is not justified.

**`zod` (upgrade)**
- Current `zod@4.3.6` is already installed. No upgrade needed for v3.0 features — the new tool schemas use the same `.string()`, `.object()`, `.optional()` patterns already in use.

---

## Integration Notes

**@opencode-ai/sdk — three new top-level namespaces**
The existing code uses `client.session.*` exclusively. v3.0 adds three new namespaces on the same `client` object:
- `client.app.agents(options?)` — no path param, optional `directory` query
- `client.provider.list(options?)` — no path param, optional `directory` query
- `client.find.symbols({ query: { query: string, directory?: string } })` — `query` is required (the search term), `directory` is optional

All follow the identical `{ data, error }` destructuring pattern. No client reconfiguration needed.

**Auth injection — one change to client initialization**
Current code: `const client = createOpencodeClient({ baseUrl: BASE_URL });`
v3.0 change: inject Basic Auth header when env vars are present:
```typescript
const authHeader = (() => {
  const user = process.env.OPENCODE_SERVER_USERNAME;
  const pass = process.env.OPENCODE_SERVER_PASSWORD;
  if (!user && !pass) return undefined;
  const token = Buffer.from(`${user ?? ''}:${pass ?? ''}`).toString('base64');
  return { Authorization: `Basic ${token}` };
})();

const client = createOpencodeClient({
  baseUrl: BASE_URL,
  ...(authHeader ? { headers: authHeader } : {}),
});
```
The `headers` field on `Config` is typed as `RequestInit["headers"] | Record<string, string | ...>` (verified from `gen/core/types.gen.d.ts`). The SDK merges these headers into every request.

**directory fallback — one new helper, consumed by all 18 tools**
Rather than duplicating the three-level fallback in every tool handler, extract a module-level helper:
```typescript
const DEFAULT_DIR = process.env.OPENCODE_DEFAULT_PROJECT;

function resolveDir(toolDir?: string): string | undefined {
  return toolDir ?? DEFAULT_DIR ?? undefined;
  // undefined → omit query param → OpenCode uses its own process.cwd()
}
```
Each tool then calls `query: resolveDir(directory) ? { directory: resolveDir(directory) } : undefined`. No new package.

**auto-start — isolation from MCP startup**
The auto-start logic (health check → spawn → wait for port) must complete before `server.connect(transport)` returns (or at least before tools are registered). The `main()` function should `await ensureOpencodeRunning()` before connecting the MCP transport. This keeps the MCP stdio channel clean — no partial startup noise on stdout. Implementation uses `node:child_process.spawn` + a `node:net` TCP probe loop, all within the existing `main()` async context.

**Workflow composite tools — no new SDK surface**
`opencode_delegate` = `client.session.create` + `client.session.prompt` + `client.session.diff` (all existing methods).
`opencode_dispatch` = `client.session.create` + `client.session.promptAsync` (already used for `opencode_prompt_async`).
`opencode_inspect` = `client.session.status` + `client.session.messages` (both existing).
`opencode_await` = poll `client.session.status` until idle, then `client.session.diff`.
All use the existing `createPatch` from the `diff` package for any patch output.

**npm publish — package.json delta**
Minimum additions to make `npm publish` and `npm install -g prefect-mcp` work correctly:
```json
{
  "name": "prefect-mcp",
  "description": "MCP server exposing OpenCode's HTTP API as Claude Code tools",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "files": ["build/"],
  "bin": {
    "prefect": "./build/index.js",
    "prefect-init": "./build/cli.js"
  }
}
```
Note: the `name` field may need to change from `"prefect"` to `"prefect-mcp"` to avoid collision with the existing `prefect` package on npm (the Python workflow orchestrator published as `prefect` on npm as well). Verify availability with `npm info prefect-mcp` before publishing.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| SDK namespaces (app, provider, find) | HIGH | Verified directly in `sdk.gen.d.ts` and `types.gen.d.ts` of installed package |
| SDK headers/auth injection | HIGH | `Config` interface in `gen/core/types.gen.d.ts` confirmed; `createOpencodeClient` source examined |
| Node.js built-ins sufficiency | HIGH | Node.js v20.20.0 confirmed on this machine; `net`, `child_process`, `Buffer` all verified |
| Zero new runtime deps | HIGH | Every feature mapped to existing SDK methods or built-ins |
| npm name collision risk | MEDIUM | `prefect` is a known Python package with npm presence; `prefect-mcp` not verified available |
| auto-start reliability | MEDIUM | TCP probe pattern is standard; OpenCode startup time may vary by machine; timeout tuning needed |
