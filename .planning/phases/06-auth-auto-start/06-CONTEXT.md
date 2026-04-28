# Phase 6: Auth + Auto-start - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add HTTP Basic Auth header injection to all outbound OpenCode requests (transparent, env-driven, no restart required) and automatic `opencode serve` spawn when the server is unreachable at first tool call.

Requirements in scope: INFRA-04, INFRA-05, INFRA-06, INFRA-07, INFRA-08, INFRA-09, INFRA-10

</domain>

<decisions>
## Implementation Decisions

### Auth Header Injection (INFRA-04, INFRA-05, INFRA-06)

- **D-01:** `OPENCODE_SERVER_PASSWORD` is read **at call time** (not module init) — consistent with the Phase 5 `resolveDirectory()` precedent for `OPENCODE_DEFAULT_PROJECT`. Auth headers are injected on every request by a custom `fetch` wrapper, so the user can set/change the env var without restarting the MCP server.
- **D-02:** Implementation: pass a `fetch` closure to `createOpencodeClient({ fetch: authFetch })` where `authFetch(request)` reads `process.env.OPENCODE_SERVER_PASSWORD` at call time, builds the `Authorization: Basic <token>` header (with `OPENCODE_SERVER_USERNAME` defaulting to `"opencode"`), and forwards to `globalThis.fetch`. If no password is set, forwards the request unchanged.
- **D-03:** The Basic Auth token is `Buffer.from('${username}:${password}').toString('base64')` (Node.js Buffer, not `btoa` — consistent with Node.js runtime).
- **D-04:** All auth logic lives in `src/auth.ts`. Exported: `authFetch` function (passed to createOpencodeClient), and a `buildAuthHeader()` helper (needed by the health poll in autostart — INFRA-10).
- **D-05:** INFRA-06 (README warning) is a docs task, not a code task. Planner should include a step to add the warning to README.md.

### Auto-start Scope (INFRA-07, INFRA-08, INFRA-09)

- **D-06:** Auto-start triggers **once per MCP server process lifetime**. A module-level `autoStartAttempted: boolean` flag prevents re-triggering. If OpenCode crashes mid-session, tool calls surface a connection error — that's honest behavior. The user restarts manually or restarts the MCP server. No crash-recovery cleverness.
- **D-07:** Auto-start triggers on the **first** tool call that gets a connection-refused error (ECONNREFUSED or equivalent network error), not on every subsequent failure.
- **D-08:** Child process stdio: `['ignore', 'ignore', 'inherit']` — stdout and stdin silenced to protect the MCP JSON-RPC pipe; stderr inherited so opencode startup errors surface in the terminal. (INFRA-08 requirement — locked spec.)
- **D-09:** Auto-start working directory: `resolveDirectory(undefined)` — uses `OPENCODE_DEFAULT_PROJECT` if set, otherwise `undefined` (OpenCode uses its own cwd). (INFRA-09 requirement — consistent with resolveDirectory design from Phase 5.)
- **D-10:** Port is parsed from `OPENCODE_URL` (e.g., `http://localhost:4096` → `4096`). Fallback to `4096` if parsing fails. Health check endpoint: `GET /global/health`.
- **D-11:** All auto-start logic lives in `src/autostart.ts`. Exported: `ensureOpencodeRunning()` — called at the start of any tool handler that detects connection-refused.

### Health Poll Limits (INFRA-10)

- **D-12:** Poll interval: **500ms** (hardcoded constant — fast enough for local startup, low overhead).
- **D-13:** Max wait time: `PREFECT_AUTOSTART_TIMEOUT_MS` env var, default **30000ms (30 seconds)**. Consistent naming with `PREFECT_TIMEOUT_MS` precedent. 30 seconds is generous for a local process; if OpenCode isn't healthy in 30s, something is wrong and the error should surface.
- **D-14:** Health poll uses the authenticated fetch client (`authFetch`) so a password-protected server is detected as healthy (200) rather than looping on 401. (INFRA-10 requirement.)
- **D-15:** If health poll times out, `ensureOpencodeRunning()` throws with a clear error: `"OpenCode did not become healthy within ${AUTOSTART_TIMEOUT_MS}ms. Check that 'opencode serve' can start in your environment."`.

### Code Organization

- **D-16:** Extract to two new modules — `src/auth.ts` (auth header injection) and `src/autostart.ts` (auto-start + health poll). `src/index.ts` is already 608 lines and these are genuinely separate subsystems.
- **D-17:** `src/index.ts` imports `{ authFetch }` from `./auth.js` and passes it to `createOpencodeClient`. Imports `{ ensureOpencodeRunning }` from `./autostart.js` for the first-call connection-error handling.
- **D-18:** `tsconfig.json` currently compiles all `src/*.ts` (or will after Phase 4's CLI addition) — no tsconfig changes needed for the new modules.

### Claude's Discretion

- Exact error type/code to detect as "connection refused" (ECONNREFUSED string match, HTTP fetch TypeError, or Node.js error code) — planner verifies against Node.js fetch behavior.
- Whether `ensureOpencodeRunning()` is called as a pre-flight wrapper in every handler (DRY) or only in the first tool call that fails (per-spec) — planner decides the least-invasive approach given the once-per-lifetime semantics.
- Whether `autoStartAttempted` flag lives in `src/autostart.ts` module scope or gets passed as a parameter — planner chooses.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SDK Client Options (for auth injection approach)
- `node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts` — `Config` interface with `fetch?: (request: Request) => ReturnType<typeof fetch>` — the hook for per-request auth injection
- `node_modules/@opencode-ai/sdk/dist/client.d.ts` — `createOpencodeClient(config?: Config & { directory?: string })` signature — confirms `Config.fetch` is accepted

### Requirements
- `.planning/REQUIREMENTS.md` — INFRA-04 through INFRA-10. All 7 requirements are in scope for Phase 6. Planner must verify INFRA-08 stdio spec and INFRA-10 auth-in-health-poll requirement are both implemented.

### Existing Implementation
- `src/index.ts` — `resolveDirectory()` (Phase 5 precedent for call-time env reads), `createOpencodeClient({ baseUrl: BASE_URL })` (the client creation to be updated with `authFetch`), `BASE_URL` (source of port for health check endpoint)
- `src/parts.ts` — example of a successfully extracted module (Phase 4) — same pattern for `src/auth.ts` + `src/autostart.ts`

### Project Decisions
- `.planning/PROJECT.md` — Key Decisions table and Constraints section (personal use only — no multi-user concerns)
- `.planning/STATE.md` — Accumulated decisions section: resolveDirectory precedent, "auto-start reliability in WSL2 is MEDIUM confidence — live testing required during Phase 6" blocker note

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveDirectory(perToolParam)` in `src/index.ts` — direct precedent for reading env at call time; `authFetch` follows the same pattern for credentials
- `TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '', 10) || 120_000` in `src/index.ts` — exact pattern to replicate for `AUTOSTART_TIMEOUT_MS = parseInt(process.env.PREFECT_AUTOSTART_TIMEOUT_MS ?? '', 10) || 30_000`
- `src/parts.ts` — successfully extracted module from Phase 4; proves the tsconfig compiles all `src/*.ts` without extra config

### Established Patterns
- `console.error` only — never `console.log` (stdout is the JSON-RPC pipe); auto-start startup logs go to `console.error`
- `const { data, error } = await client.method(...)` — SDK call pattern; auth injection happens transparently via the `fetch` wrapper without changing any handler code
- Error handling: `if (error) throw new Error(JSON.stringify(error))` then catch wraps to `{ isError: true }` — auto-start failures surface the same way

### Integration Points
- `createOpencodeClient({ baseUrl: BASE_URL })` → becomes `createOpencodeClient({ baseUrl: BASE_URL, fetch: authFetch })` — minimal one-line change in `src/index.ts`
- First tool call failure detection: needs to wrap the initial fetch or intercept the connection error before it propagates to the MCP caller
- `package.json` — no changes needed for the new modules (TypeScript compilation handles them automatically)

</code_context>

<specifics>
## Specific Ideas

- `authFetch` function signature: `async function authFetch(request: Request): Promise<Response>` — matches the `Config.fetch` type exactly
- `buildAuthHeader()` utility in `src/auth.ts`: reads `OPENCODE_SERVER_PASSWORD` and `OPENCODE_SERVER_USERNAME` at call time, returns `{ Authorization: 'Basic <token>' }` or `{}` (empty if no password set)
- Health check: `await authFetch(new Request('${BASE_URL}/global/health'))` — uses the same authenticated fetch so INFRA-10 is satisfied automatically
- `ensureOpencodeRunning()` call site: most natural is a shared `callWithAutoStart()` wrapper or a pre-flight check in a single "gateway" function — planner decides minimal surface
- WSL2 note from STATE.md: live testing required — planner should include a manual verification step in the plan

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-auth-auto-start*
*Context gathered: 2026-04-28*
