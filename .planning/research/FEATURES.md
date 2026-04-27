# Features Research — Prefect v3.0

**Domain:** TypeScript MCP server wrapping OpenCode HTTP API
**Researched:** 2026-04-27
**Confidence:** HIGH — all claims verified against @opencode-ai/sdk@1.14.25 type definitions and existing src/index.ts

---

## Feature Categories

### Infrastructure

**Sub-features:** directory param propagation, OPENCODE_DEFAULT_PROJECT env var, auto-start opencode serve, OpenCode server HTTP Basic Auth

---

#### directory param on all tools

**Table stakes:**
- Every tool that calls an OpenCode endpoint must accept an optional `directory` param and forward it as a query parameter.
- Resolution order: per-tool `directory` arg (wins) → `OPENCODE_DEFAULT_PROJECT` env var → `undefined` (OpenCode uses its own cwd).
- Tools already have `directory`: `opencode_create_session`, `opencode_session_list`, `opencode_session_get`, `opencode_session_status`, `opencode_session_messages`, `opencode_session_message`, `opencode_session_delete`, `opencode_session_rename`, `opencode_session_children`, `opencode_session_unrevert`.
- Tools currently MISSING `directory`: `opencode_run`, `opencode_abort`, `opencode_prompt_async`, `opencode_get_diff`, `opencode_approve_permission`, `opencode_fork`, `opencode_revert`, `opencode_session_command`.

**Differentiators:**
- `OPENCODE_DEFAULT_PROJECT` as a project-scoped default means no per-call directory arg is needed in `.mcp.json` env once set — ergonomic for single-project daily use.
- Centralizing resolution in a shared helper (e.g. `resolveDirectory(param?: string): string | undefined`) prevents drift across 18+ tools.
- Composite tools (`opencode_delegate`, `opencode_dispatch`) inherit directory and propagate it through their internal create+run sub-calls.

**Complexity:** Low to Medium.
- SDK: every endpoint already accepts `query?: { directory?: string }` (verified from types.gen.d.ts). No SDK changes needed.
- Risk: omission — easy to miss one of the 8 tools lacking directory. A shared helper reduces the surface.
- Composite tools must be spec'd to accept and forward `directory` explicitly.

**Dependencies:** OPENCODE_DEFAULT_PROJECT must be specified in the same plan so the resolution chain is implemented once and consistently.

---

#### OPENCODE_DEFAULT_PROJECT env var

**Table stakes:**
- At module init, read `process.env.OPENCODE_DEFAULT_PROJECT` as the fallback directory.
- Resolution chain: per-call `directory` arg (wins) → `OPENCODE_DEFAULT_PROJECT` (middle) → `undefined` (OpenCode uses its own cwd).
- Document in README env table alongside `OPENCODE_URL` and `PREFECT_TIMEOUT_MS`.
- The `prefect init` CLI should mention this var in the generated `.mcp.json` as a comment or in the env table.

**Differentiators:**
- Enables zero-arg daily use: set once in `.mcp.json` env, never pass `directory` per call.

**Complexity:** Low. One constant read at module top, one shared helper function called by all tools.

**Dependencies:** directory-param propagation (same implementation unit — spec and implement together).

---

#### auto-start opencode serve

**Table stakes:**
- On startup, health-check `GET /global/health` using raw `fetch()` (the health endpoint is in v2 SDK only, not current gen SDK).
- If the health check fails (connection refused / non-200), spawn `opencode serve --port <port>` via `child_process.spawn` with `detached: true` and `stdio: 'ignore'`.
- Port is extracted from `OPENCODE_URL`: `new URL(BASE_URL).port || '4096'`.
- Poll `/global/health` with retries (suggest 10 attempts x 500ms = 5s max) until `{ healthy: true }` or give up with a clear error to stderr.
- All startup output goes to stderr (stdout must stay clean — corrupts JSON-RPC stream).

**Differentiators:**
- First-time-use UX: no manual `opencode serve` step needed.
- Recovery from accidental server kill during a session.

**Complexity:** Medium-High. This is the riskiest v3.0 feature.
- Health endpoint: `GET /global/health` returns `{ healthy: true }` (verified from v2 SDK at `dist/v2/gen/sdk.gen.js`). Use raw `fetch()` since current gen SDK does not expose it.
- Process lifetime: the spawned child must not die when Claude Code kills the MCP server subprocess. Use `detached: true` + `child.unref()`.
- Race condition: if two tool calls fire simultaneously before startup completes, both may attempt spawn. Need a module-level init promise or semaphore.
- PATH availability: `opencode` binary may not be on PATH in the MCP server's env (Claude Code spawns it with a restricted env). Must handle "opencode not found" gracefully and surface a clear error.
- WSL/Windows: this project runs in WSL2. Path and process behavior between WSL and Windows may complicate detection. Medium risk.
- Blocking MCP server startup: if auto-start is attempted synchronously during server init, it delays the MCP handshake. Implement as lazy init triggered on the first tool call instead.

**Dependencies:** None within v3.0. Standalone feature. Can be deferred to v3.1 without blocking anything else.

---

#### OpenCode server HTTP Basic Auth

**Table stakes:**
- If `OPENCODE_SERVER_PASSWORD` is set, inject `Authorization: Basic <base64(username:password)>` on every outbound HTTP request.
- `OPENCODE_SERVER_USERNAME` defaults to `"opencode"` if not set (OpenCode's own default convention).
- Injection via SDK request interceptor: `client.interceptors.request.use(...)`. The `Client` type exposes `interceptors: Middleware<Request, Response, unknown, ResolvedRequestOptions>` (verified from `dist/gen/client/types.gen.d.ts`). The interceptor receives the raw `Request` object; add the header there.
- The SDK `Auth` type has `scheme: "basic" | "bearer"` (verified from `dist/gen/core/auth.gen.d.ts`) — Basic auth is a recognized auth scheme.

**Differentiators:**
- Enables Prefect to work against OpenCode instances with `OPENCODE_SERVER_PASSWORD` configured (e.g. remote or shared machines).

**Complexity:** Low-Medium.
- SDK interceptors are available and typed.
- Only activates when env var is set — zero impact on default single-developer use.
- Must document in README and `.mcp.json` env table.
- `createOpencodeClient` does not expose credentials directly; interceptor is the correct path.

**Dependencies:** None. Completely standalone.

---

### Workflow Shortcuts

**Sub-features:** opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await

---

#### opencode_delegate

**Table stakes:**
- Single blocking call: create session + run prompt + get diff, all in sequence.
- Returns `{ sessionId, result, diff }` where:
  - `sessionId`: the created session ID (string).
  - `result`: the `{ info: AssistantMessage, parts: Part[] }` shape from the prompt response — same as opencode_run output.
  - `diff`: `Array<FileDiff & { patch: string }>` — same as opencode_get_diff output (with computed unified diff).
- Input surface: `prompt` (required), plus optional `title`, `model`, `agent`, `system`, `directory`.
- Applies TIMEOUT_MS to the blocking prompt step using the same AbortController pattern as opencode_run.
- On error in any step, return `isError: true` with the step identified (create failed / run failed / diff failed).
- `sessionId` is included in the return so follow-up corrections via `opencode_run(sessionId, ...)` remain possible.

**Differentiators:**
- Eliminates the mandatory 3-step preamble (create session → run prompt → get diff) for the common delegation pattern described in CLAUDE.md.
- Returning diff alongside result in one response means Claude Code assesses changes without a second tool call.

**Complexity:** Low. Pure composition of three existing SDK calls with no new HTTP endpoints or timeout patterns. The diff patch computation (createPatch from 'diff') is already in opencode_get_diff — extract to a shared helper or duplicate the 3-line pattern.

**Dependencies:** Internally uses `client.session.create()`, `client.session.prompt()`, `client.session.diff()`. Reuses PartSchema validation from parts.ts. The unified diff patch computation should be extracted from opencode_get_diff into a shared utility.

---

#### opencode_dispatch

**Table stakes:**
- Single non-blocking call: create session + fire prompt_async, return immediately.
- Returns `{ sessionId }` only — result and diff are not yet available.
- Input surface: `prompt` (required), plus optional `title`, `model`, `agent`, `system`, `directory`.
- No timeout needed — `promptAsync` returns 204 void immediately (verified: `SessionPromptAsyncResponses: { 204: void }`).

**Differentiators:**
- Enables parallel delegation: fire multiple tasks and await them concurrently.
- The returned `sessionId` is the handle for `opencode_inspect` and `opencode_await`.

**Complexity:** Low. Simpler than opencode_delegate — no blocking wait, no diff fetch.

**Dependencies:** `client.session.create()` + `client.session.promptAsync()`. No new patterns.

---

#### opencode_inspect

**Table stakes:**
- Non-blocking snapshot of a running (or completed) session: status + todo list + changed files.
- Returns compact `{ status, todos, changedFiles }` where:
  - `status`: the `SessionStatus` value for this specific session — one of `{ type: "idle" }`, `{ type: "busy" }`, `{ type: "retry", attempt, message, next }`. The global status endpoint returns a map of ALL sessions; extract the target session's entry. If the session ID is absent from the map, status is idle (sessions not actively running are absent).
  - `todos`: `Array<Todo>` from `GET /session/{id}/todo`. Each item: `{ id, content, status, priority }`. Verified: `SessionTodoData` and `Todo` type exist in current SDK gen — `client.session.todo()` is available.
  - `changedFiles`: array of file path strings only (just `d.file`) from `GET /session/{id}/diff` — NOT full diffs. Compact format; full diff is still available via opencode_get_diff.
- Accepts `sessionId` (required) and optional `directory`.

**Differentiators:**
- Three parallel HTTP calls collapsed to one tool call — progress polling without context window bloat.
- `changedFiles` as a path-only list is the right default for progress checks; saves tokens vs full diff.
- Session status + todos together give a clear "what's done, what's pending" snapshot.

**Complexity:** Medium.
- Three HTTP calls can be fired in parallel (`Promise.all`).
- Status extraction: must look up `sessionId` in the global status map and default to idle if absent.
- `session.todo()` is a new SDK method not yet used in Prefect — verify SDK method name is `client.session.todo({ path: { id }, query: { directory? } })`.

**Dependencies:**
- `client.session.status()` (global endpoint, already in opencode_session_status)
- `client.session.todo()` (SDK method confirmed — `SessionTodoData`, `SessionTodoResponses: { 200: Array<Todo> }`)
- `client.session.diff()` (already in opencode_get_diff)

---

#### opencode_await

**Table stakes:**
- Polls a dispatched session to completion, then returns full result and diff.
- Polling: call `session.status()`, check if target sessionId is `{ type: "idle" }` or absent (both mean idle). If busy or retry, sleep and repeat.
- Poll interval: 2 seconds default; expose optional `pollIntervalMs` input param for caller control.
- Timeout: respects PREFECT_TIMEOUT_MS via AbortController (same pattern as opencode_run). Timeout error message must distinguish "session timed out" from "prompt timed out".
- Returns `{ result, diff }` where:
  - `result`: `{ info: AssistantMessage, parts: Part[] }` — retrieved via `session.messages({ path: { id }, query: { limit: 1 } })` to get the most recent message. Note: `limit` returns the most recent N messages (not first N).
  - `diff`: `Array<FileDiff & { patch: string }>` — same as opencode_get_diff.
- Accepts `sessionId` (required) and optional `directory`.
- If the completed session's last message has an error in `info.error`, propagate it as `isError: true` with the error content.

**Differentiators:**
- Completes the dispatch/await pattern — dispatch without await is incomplete for retrieving results.
- Timeout is especially meaningful here: prevents infinite polling on a stuck or errored session.

**Complexity:** Medium-High. Most complex of the four workflow shortcuts.
- Polling loop with sleep: `await new Promise(r => setTimeout(r, interval))` inside a while loop. The sleep must be aborted on AbortController signal — check `controller.signal.aborted` before each iteration.
- Result retrieval: `session.messages({ path: { id }, query: { limit: 1 } })` returns the most recent message. This is the last assistant message only if no user message was added after the prompt — safe assumption for dispatched sessions.
- Error propagation: `AssistantMessage.error` is a discriminated union of `ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError`. Must serialize and surface this in the error response.
- Parts validation: run PartSchema array validation on retrieved parts (same as opencode_run) to catch unexpected shapes.

**Dependencies:** `client.session.status()`, `client.session.messages()`, `client.session.diff()`. PartSchema validation from parts.ts. Zod validation required for parts.

---

### Read-only Endpoints

**Sub-features:** opencode_list_agents (GET /agent), opencode_list_providers (GET /provider), opencode_find_symbol (GET /find/symbol)

---

#### opencode_list_agents (GET /agent)

**Table stakes:**
- Exposes `GET /agent` via `client.app.agents()`.
- Returns `Array<Agent>` where each Agent has: `{ name, description?, mode ("subagent"|"primary"|"all"), builtIn, model?: { modelID, providerID }, prompt?, tools: { [id]: boolean }, permission: { edit, bash, webfetch?, doom_loop? }, maxSteps? }`.
- No required inputs. Optional `directory` param.
- Return the raw array as JSON — no transformation.

**Differentiators:**
- Claude Code can inspect available agents before choosing an `agent` override in opencode_run or opencode_delegate.
- `builtIn` flag distinguishes user-configured agents from OpenCode built-ins.
- `description` field (when present) tells Claude Code when to use each agent without guessing.

**Complexity:** Low. Single SDK call, no transformation.

**Dependencies:** `client.app.agents()` — confirmed SDK method (`AppAgentsData`, `AppAgentsResponses: { 200: Array<Agent> }`). SDK class: `App.agents()`.

---

#### opencode_list_providers (GET /provider)

**Table stakes:**
- Exposes `GET /provider` via `client.provider.list()`.
- Returns `{ all: Array<{id, name, env, models: { [modelId]: { id, name, capabilities... } }}>, default: { [key: string]: string }, connected: Array<string> }` (verified from `ProviderListResponses`).
- `connected` array lists provider IDs that are authenticated and ready — the key field for model selection.
- No required inputs. Optional `directory` param.
- Return verbatim (not summarized) — Claude Code can filter.

**Differentiators:**
- `connected` array immediately tells Claude Code which providers can be used for model overrides without trial-and-error.
- Full model capability data (`reasoning`, `toolcall`, `attachment`, `limit.context`) enables intelligent model selection in opencode_delegate.

**Complexity:** Low. Single SDK call. Response is verbose (all models for all providers with full capability structs), but verbatim is correct — summary loses fidelity.

**Dependencies:** `client.provider.list()` — confirmed (`ProviderListData`, `ProviderListResponses`).

---

#### opencode_find_symbol (GET /find/symbol)

**Table stakes:**
- Exposes `GET /find/symbol?query=...&directory=...` via `client.find.symbols()`.
- Required input: `query` (string) — the workspace symbol search query passed to the LSP.
- Optional: `directory`.
- Returns `Array<Symbol>` where each Symbol has `{ name, kind, location: { uri, range: { start: { line, character }, end: { line, character } } } }` (verified from `Symbol` type in types.gen.d.ts). `uri` is a file path string.
- `kind` is an LSP SymbolKind integer — include a mapping in the tool description: 5=Class, 6=Method, 12=Function, 13=Variable, 23=Namespace, 25=EnumMember.

**Differentiators:**
- LSP-backed: searches parsed symbols, not grep — finds renamed symbols, overloaded methods, all class members accurately.
- `range` gives exact line/column — enables file + line targeting without grep scanning.
- Combined with `directory` param, scopes symbol search to a specific project when OpenCode serves multiple.

**Complexity:** Low-Medium.
- SDK call is simple. External dependency: LSP must be initialized for the target language. If no LSP is configured in OpenCode, the endpoint may return an empty array.
- Document in tool description that results depend on LSP availability for the target language.
- `kind` as raw integer is cryptic without a mapping — include common values in the tool description.

**Dependencies:** `client.find.symbols()` — confirmed (`FindSymbolsData: { query: { query: string, directory?: string } }`, `FindSymbolsResponses: { 200: Array<Symbol> }`). OpenCode must have an LSP configured for the target language — external dependency outside Prefect's control.

---

### Distribution

**Sub-feature:** npm publish as `prefect-mcp` with `npm install -g` pathway

**Table stakes:**
- Rename package from `"prefect"` to `"prefect-mcp"` in package.json. (The name "prefect" is registered on npm by the Prefect Python workflow orchestrator — HIGH collision risk.)
- `bin` field: keep `"prefect": "./build/cli.js"` for the command name (the CLI command can stay `prefect`), but the npm package name becomes `prefect-mcp`.
- Add `"files"` field: `["build/", "README.md"]` — excludes `src/`, `.planning/`, test files, tsconfig.json, .mcp.json from the published package.
- Add `"prepublishOnly": "npm run build"` script so published package always contains fresh build output.
- No `.npmignore` needed if `files` field is used — the two approaches are alternatives.
- After global install (`npm install -g prefect-mcp`), the `prefect` command must be available.
- `prefect init` must be updated to write `.mcp.json` with `"command": "prefect-mcp"` (relying on PATH resolution) instead of an absolute path, so the config works on any machine after global install.

**Differentiators:**
- `prefect init` already exists — the global install pathway unlocks it for fresh-machine setup without cloning the repo.
- A published package enables sharing the tool without sharing repository access.

**Complexity:** Medium.
- Package name conflict: "prefect" is taken. "prefect-mcp" is available (verify before publishing). The rename affects package.json, README install instructions, and any documentation referencing the package name.
- `prefect init` local-vs-global behavior: currently writes an absolute path to `build/index.js`. Must detect whether running from a global install (check if `__filename` is under an npm global prefix) or local checkout. Alternatively, always write `"command": "prefect-mcp"` and document that local dev requires `npm link` instead.
- `build/` test files: `build/parts.test.js`, `build/cli.test.js`, etc. are compiled test artifacts. Use the `files` field to whitelist only `build/index.js` and `build/cli.js` (and `build/parts.js`) — or restructure the build to output tests to a separate directory (out of scope).
- Version bump: package.json version must be bumped before each `npm publish`. No automated versioning exists currently.

**Dependencies:** `prefect init` CLI behavior must be updated. This affects `src/cli.ts` implementation.

---

## Feature Dependency Map

```
directory-param propagation ──────────────┐
OPENCODE_DEFAULT_PROJECT ─────────────────┤
                                          └──► opencode_delegate  (must accept + propagate directory)
                                               opencode_dispatch  (must accept + propagate directory)
                                               opencode_inspect   (must accept + propagate directory)
                                               opencode_await     (must accept + propagate directory)

opencode_dispatch ────────────────────────────► opencode_inspect  (natural pair — poll a dispatched session)
opencode_dispatch ────────────────────────────► opencode_await    (natural pair — collect a dispatched session)

opencode_session_status (exists) ────────────► opencode_inspect  (status extraction)
session.todo() SDK method ───────────────────► opencode_inspect  (todo extraction)
opencode_get_diff diff logic (exists) ───────► opencode_inspect  (changed files extraction)

opencode_run result shape (exists) ──────────► opencode_delegate (returns same shape)
opencode_get_diff diff logic (exists) ───────► opencode_delegate (returns same shape)
opencode_get_diff diff logic (exists) ───────► opencode_await    (returns same shape)
PartSchema validation (exists in parts.ts) ──► opencode_await    (validates fetched parts)
PartSchema validation (exists in parts.ts) ──► opencode_delegate (validates run parts)

prefect init CLI (exists in src/cli.ts) ─────► npm distribution  (must update for global install mode)
```

---

## MVP Recommendation

Implement in this order based on dependency and leverage:

1. **directory param + OPENCODE_DEFAULT_PROJECT** — one implementation unit (shared helper), unblocks composite tools.
2. **opencode_delegate** — highest daily-use leverage, replaces mandatory 3-step preamble.
3. **opencode_dispatch + opencode_inspect + opencode_await** — natural group; dispatch without await/inspect is incomplete.
4. **opencode_list_agents + opencode_list_providers + opencode_find_symbol** — read-only endpoints, low effort, high informational value.
5. **npm distribution** — enables fresh-machine setup without repo clone.
6. **OpenCode server auth** — only relevant when `OPENCODE_SERVER_PASSWORD` is set; zero impact otherwise.
7. **auto-start opencode serve** — useful ergonomic improvement but highest implementation risk; can defer to v3.1.

**Defer without consequence:** auto-start and server auth are fully independent of all other features. Neither blocks daily use.

---

## Sources

- `@opencode-ai/sdk@1.14.25` type definitions (HIGH confidence): `dist/gen/types.gen.d.ts`, `dist/gen/sdk.gen.d.ts`, `dist/gen/client/types.gen.d.ts`, `dist/gen/core/auth.gen.d.ts`
- `dist/v2/gen/sdk.gen.js` — `/global/health` endpoint and response shape (MEDIUM confidence — v2 SDK, not current gen)
- `src/index.ts` — confirmed which tools already have directory param (HIGH confidence)
- `.planning/PROJECT.md` — v3.0 feature list, constraints, prior decisions (HIGH confidence)
- `.planning/phases/01-mcp-server/01-RESEARCH.md` — prior research on health endpoint URL, OPENCODE_SERVER_PASSWORD, opencode serve port behavior (HIGH confidence)
