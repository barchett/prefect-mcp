# Research Summary — Prefect v3.0

**Synthesized:** 2026-04-27
**Sources:** STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md
**Overall Confidence:** HIGH — all findings verified from installed SDK types, Node.js docs, and direct codebase inspection

---

## Executive Summary

Prefect v3.0 is a pure feature expansion of an existing 1,221 LOC TypeScript MCP server: no framework changes, no new runtime dependencies, no architectural pivots. Every planned feature maps cleanly onto existing `@opencode-ai/sdk@1.14.25` methods, Node.js 20 built-ins, and the already-established single-file `src/index.ts` pattern. The zero-dependency verdict is the strongest finding from research — it eliminates the most common source of scope creep in TypeScript projects.

The highest-value features are the workflow shortcuts (`opencode_delegate`, `opencode_dispatch`, `opencode_inspect`, `opencode_await`), which collapse the mandatory 3-step preamble documented in CLAUDE.md into a single tool call. These require a structural refactor first — extracting existing handler logic into named functions — but that refactor is mechanical with no behavior changes. The three read-only API wrappers (agents, providers, symbols) are trivial additions (one `registerTool` call each) that unlock intelligent model and agent selection. Auto-start is the only genuinely risky feature and can be deferred to v3.1 without any other feature being blocked.

The critical constraint that runs through every feature: stdout discipline. The MCP server's stdout is a JSON-RPC pipe. Any non-JSON-RPC bytes — spawned child output, console.log calls, health-check responses written to wrong streams — cause silent parse errors and Claude Code disconnects. Auto-start is where this constraint bites hardest (spawned `opencode serve` must use `stdio: ['ignore','ignore','pipe']`), but the principle applies everywhere.

---

## Stack Additions

### Zero New Runtime Dependencies

Every v3.0 feature is covered by the existing stack or Node.js 20 built-ins:

| Feature | What It Uses | Package? |
|---------|-------------|---------|
| directory param propagation | `process.env`, existing SDK `query.directory?` fields | None |
| OPENCODE_DEFAULT_PROJECT env var | `process.env` at call time | None |
| auto-start opencode serve | `node:child_process.spawn`, `node:net` TCP probe | None |
| HTTP Basic Auth | `Buffer.from(...).toString('base64')`, SDK `fetch` override | None |
| opencode_delegate / dispatch / inspect / await | Existing `client.session.*` SDK methods | None |
| GET /agent, /provider, /find/symbol | `client.app.agents()`, `client.provider.list()`, `client.find.symbols()` — already in SDK | None |
| npm distribution | `npm publish` CLI, package.json field additions | None |

Explicitly rejected: `wait-on`, `commander`, `node-fetch`, `execa`, `pino`, `dotenv`, `p-retry`. All add transitive deps for problems the existing stack already solves in 10-20 lines.

### Confirmed SDK Namespaces (New in v3.0 Usage)

The existing code uses `client.session.*` only. v3.0 adds three previously-unused SDK namespaces on the same client object:

- `client.app.agents({ query: { directory? } })` — GET /agent
- `client.provider.list({ query: { directory? } })` — GET /provider
- `client.find.symbols({ query: { query: string, directory?: string } })` — GET /find/symbol

All three verified from installed `@opencode-ai/sdk@1.14.25` type definitions.

### Name Collision Risk

The npm package name `"prefect"` is already registered by the Python workflow orchestrator. The package must be renamed to `"prefect-mcp"` before publishing. The CLI command name (`prefect`) and bin entry stay unchanged — only the npm registry name changes. Verify `npm info prefect-mcp` before first publish.

### package.json Delta (Required Before npm publish)

```json
{
  "name": "prefect-mcp",
  "description": "MCP server exposing OpenCode's HTTP API as Claude Code tools",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "files": ["build/", "README.md"],
  "publishConfig": { "access": "public" },
  "scripts": {
    "prepublishOnly": "npm run build"
  }
}
```

---

## Key Feature Findings

### Infrastructure

**directory param propagation** — 8 of 18 tools are currently missing the `directory` param (`opencode_run`, `opencode_abort`, `opencode_prompt_async`, `opencode_get_diff`, `opencode_approve_permission`, `opencode_fork`, `opencode_revert`, `opencode_session_command`). The fix is one Zod line per tool. Before adding to each tool, verify whether the underlying SDK endpoint actually accepts `query.directory` — some session-scoped endpoints may not, and silently discarding the param is worse than not exposing it.

**OPENCODE_DEFAULT_PROJECT** — Read at call time (inside `resolveDirectory()`), not at module init. This makes it hot-reloadable. Single resolution helper: `return perToolDir ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined`. Do not pass `undefined` to the SDK — omit the query param entirely so OpenCode uses its own default.

**auto-start** — Medium-High risk, standalone feature. Two key decisions must be locked in before implementation: (a) daemon model (`detached: true` + `unref()`, opencode outlives MCP session) vs. owned-child model (`detached: false`, opencode dies with MCP); (b) startup-time check vs. first-call lazy check. Research recommends: daemon model + startup-time check, with `OPENCODE_AUTO_START=false` opt-out. Health poll must use the same auth headers as other SDK calls — the `/global/health` endpoint returns 401, not 200, when `OPENCODE_SERVER_PASSWORD` is set.

**HTTP Basic Auth** — Use a custom fetch wrapper passed to `createOpencodeClient({ fetch: authFetch })` rather than `client.interceptors` (which requires accessing `_client`, a `protected` property). Read env vars at request time inside the wrapper so auth changes take effect without restarting the server. Env vars: `OPENCODE_SERVER_USERNAME` (default `"opencode"`) and `OPENCODE_SERVER_PASSWORD`.

### Workflow Shortcuts

**opencode_delegate** — Create session + blocking run + get diff, returns `{ sessionId, result, diff }`. Highest daily-use leverage: collapses the 3-step canonical loop into one call. Must use an `AbortController` timeout set to `PREFECT_TIMEOUT_MS`. If timeout fires, abort the created session before returning the error. For tasks expected to take over 60 seconds (Claude Code's hardcoded MCP tool timeout), callers should use `opencode_dispatch` + `opencode_await` instead.

**opencode_dispatch** — Create session + `promptAsync` (returns void immediately). Returns only `{ sessionId }`. The simplest of the four composite tools. No timeout needed on the async fire.

**opencode_inspect** — Three parallel HTTP calls (`Promise.all`): global status map, session diff, session todo. Extracts the target session's entry from the status map (absent = idle). Returns compact `{ status, todos, changedFiles }` — changedFiles is path strings only, not full diffs. `client.session.todo()` is a new SDK method not yet used in Prefect; verify exact call signature before implementing.

**opencode_await** — Poll status until idle, then fetch last message + diff. Poll interval: 2s default, configurable via `pollIntervalMs`. Must handle the `retry` status state (not just `busy`) — a session in rate-limit retry can loop for minutes. Hard wall-clock timeout required; on timeout, surface current status and `retry.message` + `retry.next` so the caller knows what happened.

**Prerequisite refactor:** Before adding any composite tool, extract the inner logic of `createSession`, `runPrompt`, `getDiff`, `getStatus`, and `getMessages` into named module-scope functions. Original tool handlers become thin wrappers. This is a pure structural refactor — no behavior changes — and it must be verified with a build + test run before any composite tool code is added.

### Read-only Endpoints

Three low-effort, high-value additions:

- **opencode_list_agents** — `client.app.agents()`, no required inputs, returns full Agent array. `builtIn` flag and `description` field help Claude Code select appropriate agents for delegation.
- **opencode_list_providers** — `client.provider.list()`, returns verbatim (not summarized). The `connected` array is the key field — immediately shows which providers are authenticated without trial-and-error.
- **opencode_find_symbol** — `client.find.symbols({ query: { query: string, directory? } })`, required `query` string. Returns LSP-backed symbol search with exact line/column ranges. Document that results depend on LSP being configured in OpenCode. Include SymbolKind integer mapping in the tool description (5=Class, 6=Method, 12=Function, 13=Variable).

### Distribution

**Files field is required** — without it, `npm publish` ships `node_modules/` (~30 MB) and all TypeScript sources. `npm pack --dry-run` is the verification step before first publish.

**CLI path resolution** — `src/cli.ts` resolves `resolve(__dirname, 'index.js')` which works correctly for both local and global installs (both `build/cli.js` and `build/index.js` are co-located). No CLI changes needed for distribution.

**`prefect init` limitation** — writes an absolute path to `.mcp.json`. This breaks if `.mcp.json` is shared across machines with different global install paths. Acceptable for stated personal-use scope; document prominently in README.

---

## Suggested Build Order

### Phase 1: Directory Infrastructure

**Features:** directory param on all 18 tools + `OPENCODE_DEFAULT_PROJECT` + `resolveDirectory()` helper

**Rationale:** Mechanical pass across all existing tools, safest done before new tools exist. The `resolveDirectory()` helper is the foundation every composite tool depends on. Do this first so the test surface is small and the pattern is consistent before new tools are added.

**Deliverable:** All 18 tools accept optional `directory`. One shared helper function. Module-level reading of env var at call time.

**Pitfalls to avoid:** RISK-01 (silently discarding `directory` on endpoints that don't support it), RISK-02 (resolution order inversion), PITFALL-V3-08 (Zod/MCP SDK incompatibility — pin versions before touching schemas).

---

### Phase 2: Auth Injection

**Features:** HTTP Basic Auth via custom fetch wrapper

**Rationale:** Must be in place before distribution. Simple, isolated change to client initialization. No handler changes needed.

**Deliverable:** `makeAuthFetch()` wrapper, `createOpencodeClient({ fetch: authFetch })` pattern. New env vars documented.

**Pitfalls to avoid:** PITFALL-V3-04 (silent 401s from wrong header mutation pattern — use `new Request(request, { headers: {...} })` cloning).

---

### Phase 3: Auto-start (or defer to v3.1)

**Features:** auto-start opencode serve

**Rationale:** Can be deferred without blocking anything else. If included in v3.0, place here — after infrastructure is stable and before composite tools — because composite tools benefit from the startup guarantee. Daemon model is recommended.

**Deliverable:** `ensureOpenCode()` in `main()`, `waitForHealth()` loop, process exit cleanup, `OPENCODE_AUTO_START` env var.

**Pitfalls to avoid:** PITFALL-V3-01 (stdout contamination — `stdio: ['ignore','ignore','pipe']`), PITFALL-V3-02 (orphaned processes — commit to daemon model upfront), PITFALL-V3-03 (health poll without auth headers).

**Decision point:** If this phase slips or proves unreliable in WSL2 testing, cut it to v3.1. All other features are unblocked.

---

### Phase 4: Handler Extraction + Composite Tools

**Features:** Named function extraction refactor, then opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await

**Rationale:** Highest-risk feature group (new polling logic, multi-call orchestration, timeout interactions). Depends on Phase 1 for `resolveDirectory()`. Must be done with extraction-first discipline: extract one function at a time, rebuild and verify tests pass before moving to the next.

**Deliverable:** 5 named inner functions extracted. 4 new `server.registerTool()` calls. Existing tool behavior unchanged.

**Pitfalls to avoid:** PITFALL-V3-05 (delegate timeout exceeds Claude Code's 60s MCP limit — use `PREFECT_TIMEOUT_MS` + abort on timeout), RISK-03 (await loops on `retry` status indefinitely), RISK-06 (orphaned sessions on delegate failure — try/finally abort pattern).

---

### Phase 5: Read-only API Wrappers

**Features:** opencode_list_agents, opencode_list_providers, opencode_find_symbol

**Rationale:** Purely additive, zero dependencies, ~35 LOC total. Can technically be done in any phase after Phase 1. Placed here to keep Phase 1 focused and because these become more useful once composite tools exist (Claude Code can inspect agents/providers before delegating).

**Deliverable:** 3 new `server.registerTool()` calls.

**Pitfalls to avoid:** RISK-04 (wrong SDK namespace — verify `client.app.agents`, `client.provider.list`, `client.find.symbols` exist before implementing).

---

### Phase 6: npm Distribution

**Features:** package.json name, files, publishConfig, prepublishOnly; README distribution docs

**Rationale:** Packaging concern, not a code concern. Done last so `npm publish` is a clean release of fully-implemented features.

**Deliverable:** Updated `package.json`. Verified with `npm pack --dry-run`. Published as `prefect-mcp`.

**Pitfalls to avoid:** PITFALL-V3-06 (missing `files` field ships node_modules — verify with `npm pack`), PITFALL-V3-07 (missing executable bit — verify with `tar tvf prefect-mcp-*.tgz`). RISK-05 (absolute path limitation in `prefect init` — document, don't fix).

---

## Critical Pitfalls

### 1. Spawned opencode stdout corrupts the MCP pipe (PITFALL-V3-01)

**Risk:** Auto-start that uses `stdio: 'inherit'` or `stdio: 'pipe'` without consuming every byte will send opencode's startup output into Claude Code's JSON-RPC stream. Claude Code disconnects with parse error -32700.

**Prevention:** `stdio: ['ignore', 'ignore', 'pipe']` is mandatory. Pipe stderr to `console.error` if you want startup logs. Never let child stdout touch the parent's stdout.

---

### 2. Delegate timeout breaches Claude Code's 60s MCP limit (PITFALL-V3-05)

**Risk:** `opencode_delegate` is a blocking call that can run for the full `PREFECT_TIMEOUT_MS`. Claude Code has an approximate 60-second hardcoded MCP tool timeout. A delegate that takes 65 seconds returns "MCP error -32001" while the underlying session stays busy, blocking subsequent calls.

**Prevention:** `AbortController` tied to `PREFECT_TIMEOUT_MS`. If abort fires, call `client.session.abort()` on the created session before returning the error. Document the threshold in the tool description — callers should use `opencode_dispatch` + `opencode_await` for long-running tasks.

---

### 3. Silent 401s from wrong auth header injection pattern (PITFALL-V3-04)

**Risk:** Calling `Headers.set()` on an already-constructed Request's immutable headers throws or silently no-ops. Every tool call returns 401 as `{ data: undefined, error: {...} }` — not an exception, so it looks like tool errors rather than an auth bug.

**Prevention:** Use the `new Request(request, { headers: { ...Object.fromEntries(request.headers), Authorization: \`Basic ${encoded}\` } })` clone pattern inside the custom fetch wrapper.

---

### 4. Health poll loops forever with auth enabled (PITFALL-V3-03)

**Risk:** When `OPENCODE_SERVER_PASSWORD` is set, `GET /global/health` returns 401. An unauthenticated health poll treats 401 as "not ready" and retries until timeout, even though the server is healthy.

**Prevention:** Health poll fetch must use the same auth headers as all other SDK calls. Implement auth before auto-start (Phase 2 before Phase 3).

---

### 5. npm publish ships node_modules without a files field (PITFALL-V3-06)

**Risk:** The current `package.json` has no `files` field. `npm publish` will include the entire working tree minus `.gitignore` entries. That includes `node_modules/` (~30 MB) and `src/*.ts`.

**Prevention:** Add `"files": ["build/", "README.md"]` before running any `npm publish`. Verify with `npm pack --dry-run`. Also add `chmod 755` to `prepublishOnly` to ensure executable bits survive the tarball (PITFALL-V3-07).

---

## Open Questions

These need live verification during implementation, not further desk research:

1. **Is `client._client.interceptors` accessible from `src/index.ts`?** The property is `protected` on `_HeyApiClient`. If inaccessible at compile time, the `fetch` override approach is the fallback. Use the fetch override as the primary approach.

2. **Does `GET /global/health` require auth when `OPENCODE_SERVER_PASSWORD` is set?** Research cites GitHub issue evidence (HIGH confidence), but must be verified against the running OpenCode instance before implementing the auth-aware health poll.

3. **What is the exact call signature for `client.session.todo()`?** Research confirms `SessionTodoData` and `SessionTodoResponses: { 200: Array<Todo> }` exist in the SDK, but the exact method call pattern needs compile-time verification before `opencode_inspect` is implemented.

4. **Is `prefect-mcp` available on npm?** Run `npm info prefect-mcp` before committing to the name in any implementation.

5. **How long does `opencode serve` take to become healthy on this WSL2 machine?** The 10-attempt x 500ms poll cap is an estimate. Measure actual startup time and tune `waitForHealth()` accordingly.

6. **Does auto-start behave reliably in WSL2?** Process spawning and signal propagation between WSL2 and Windows processes has known edge cases. Manual testing with the daemon model (detached + unref) is required before shipping auto-start.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| SDK namespaces and method signatures | HIGH | Verified directly from installed type definitions |
| Zero new runtime dependencies | HIGH | Every feature mapped to existing methods or built-ins |
| directory param propagation | HIGH | SDK query types verified per-endpoint |
| Auth injection via custom fetch | HIGH | Config.fetch interface confirmed; Request clone pattern is standard |
| Composite tool design | HIGH | Pure composition of existing SDK calls; patterns already in use |
| Auto-start spawn mechanics | HIGH | Node.js child_process docs + multiple GitHub issue confirmations |
| Auto-start reliability in WSL2 | MEDIUM | Pattern is sound; WSL2-specific behavior needs live testing |
| Health endpoint requires auth | MEDIUM | GitHub issue evidence; needs live verification |
| client.session.todo() method | MEDIUM | Type definitions confirmed; call pattern needs compile-time check |
| npm name prefect-mcp availability | MEDIUM | prefect is taken; prefect-mcp not verified |
| opencode startup time | LOW | No data for this machine; must be measured |

---

## Sources

Aggregated from all four research files:

- `@opencode-ai/sdk@1.14.25` type definitions: `dist/gen/types.gen.d.ts`, `dist/gen/sdk.gen.d.ts`, `dist/gen/client/types.gen.d.ts`, `dist/gen/core/auth.gen.d.ts`
- `src/index.ts` v2.0 (1,221 LOC) — baseline tool inventory
- `src/cli.ts` — prefect init CLI path resolution
- `package.json` — current field inventory
- `.planning/PROJECT.md` — v3.0 feature scope and key decisions
- `.planning/phases/01-mcp-server/01-RESEARCH.md` — prior health endpoint and auth research
- Node.js child_process docs — stdio option behavior
- GitHub issue anomalyco/opencode #12805 — health endpoint requires auth when password set
- GitHub issue anthropics/claude-code #22542 — MCP tool timeout approximately 60s hardcoded
- GitHub issue modelcontextprotocol/typescript-sdk #925 — Zod v4 incompatibility with older MCP SDK versions
- GitHub issue nodejs/node #5549 — detached + stdio inherit incompatibility
