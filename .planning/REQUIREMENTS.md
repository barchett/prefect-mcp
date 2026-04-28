# Requirements — Prefect v3.0 Daily Driver

## Infrastructure

- [x] **INFRA-01**: All 18 MCP tools accept an optional `directory` parameter that overrides the working directory for that call
- [x] **INFRA-02**: `resolveDirectory()` helper resolves directory in order: per-tool `directory` param → `OPENCODE_DEFAULT_PROJECT` env var → `process.cwd()`
- [x] **INFRA-03**: `OPENCODE_DEFAULT_PROJECT` env var is read at request time (not server startup) so changes take effect without restarting Claude Code
- [ ] **INFRA-04**: If `OPENCODE_SERVER_PASSWORD` is set in the shell environment, every HTTP request includes a `Authorization: Basic <token>` header
- [ ] **INFRA-05**: `OPENCODE_SERVER_USERNAME` env var sets the Basic Auth username (default: `opencode`)
- [ ] **INFRA-06**: Auth credentials are never stored in `.mcp.json` — README explicitly warns against putting `OPENCODE_SERVER_PASSWORD` in the `.mcp.json` env block
- [ ] **INFRA-07**: If the OpenCode server is unreachable at first tool call, Prefect spawns `opencode serve --port <port>` automatically (port parsed from `OPENCODE_URL`) and waits for it to become healthy before proceeding
- [ ] **INFRA-08**: Auto-start child process uses `stdio: ['ignore', 'ignore', 'inherit']` so opencode's stdout does not corrupt the MCP JSON-RPC pipe
- [ ] **INFRA-09**: Auto-start sets opencode's working directory to `OPENCODE_DEFAULT_PROJECT` if set, otherwise `process.cwd()`
- [ ] **INFRA-10**: Auto-start health polling uses the authenticated fetch client (same `OPENCODE_SERVER_PASSWORD` headers) so it does not loop on 401 when a password is configured

## Workflow Shortcuts

- [ ] **WORKFLOW-01**: `opencode_delegate` — blocking composite: creates session, runs prompt, returns `{ sessionId, result, diff }` in one call
- [ ] **WORKFLOW-02**: `opencode_delegate` aborts the created session and returns an error if the run exceeds `PREFECT_TIMEOUT_MS`
- [ ] **WORKFLOW-03**: `opencode_dispatch` — non-blocking composite: creates session, fires prompt async, returns `{ sessionId }` immediately
- [ ] **WORKFLOW-04**: `opencode_inspect` — returns compact snapshot `{ status, todos, changedFiles }` for a session without reading full messages
- [ ] **WORKFLOW-05**: `opencode_await` — polls a dispatched session until it reaches a terminal state, then returns `{ result, diff }`
- [ ] **WORKFLOW-06**: `opencode_await` accepts a `pollIntervalMs` param (default: 2000) and a `timeoutMs` param (default: `PREFECT_TIMEOUT_MS`)
- [ ] **WORKFLOW-07**: Composite tools are implemented by calling shared named handler functions (`createSession`, `runPrompt`, `getDiff`, etc.), not by duplicating HTTP calls

## Read-only API Wrappers

- [ ] **API-01**: `opencode_list_agents` — wraps `GET /agent`, returns list of available OpenCode agents with id, name, description
- [ ] **API-02**: `opencode_list_providers` — wraps `GET /provider`, returns list of configured providers and their available models
- [ ] **API-03**: `opencode_find_symbol` — wraps `GET /find/symbol`, accepts a `query` string, returns matching symbols with file path and location

## Distribution

- [ ] **DIST-01**: Package is published to npm as `prefect-mcp` (not `prefect` — name conflict with Python Prefect)
- [ ] **DIST-02**: `package.json` includes `"files": ["build/", "README.md"]` so `node_modules/` and `src/` are not published
- [ ] **DIST-03**: `package.json` includes `name`, `description`, `license`, `engines` (Node >=18), and `publishConfig` fields
- [ ] **DIST-04**: `npm pack --dry-run` is verified to include only `build/` and `README.md` before first publish
- [ ] **DIST-05**: `prefect init` detects global vs local install — global writes `"command": "prefect-mcp"` (PATH-relative bin); local writes `"command": "node", "args": ["/absolute/path/build/index.js"]` (current behavior)
- [ ] **DIST-06**: README documents both install pathways: local (existing) and global (`npm install -g prefect-mcp`)
- [ ] **DIST-07**: All tool names are renamed from `opencode_*` to `prefect_*` across all `*.ts` and `*.md` files
- [ ] **DIST-08**: `npm test` passes after the rename with zero errors
- [ ] **DIST-09**: CLAUDE.md tool reference table and canonical loop steps use `prefect_*` names throughout
- [ ] **DIST-10**: `examples/test-task.md` validation prompt uses `prefect_*` tool names
- [ ] **DIST-11**: CLAUDE.md canonical loop instructs callers to always pass an explicit `directory` arg on every `prefect_create_session`, `prefect_delegate`, and `prefect_dispatch` call — never rely on the server's default working directory
- [ ] **DIST-12**: All `OPENCODE_*` env vars are renamed to `PREFECT_*` across all `*.ts`, `*.md`, and test files — `OPENCODE_URL` → `PREFECT_SERVER_URL`, `OPENCODE_SERVER_PASSWORD` → `PREFECT_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME` → `PREFECT_SERVER_USERNAME`, `OPENCODE_DEFAULT_PROJECT` → `PREFECT_DEFAULT_PROJECT`; `PREFECT_TIMEOUT_MS` and `PREFECT_AUTOSTART_TIMEOUT_MS` are unchanged

## Future Requirements (v4.0)

### Multi-server Registry

- [ ] **MULTI-01**: `prefect add-server <name> <host> <port> <model>` CLI command — registers a named OpenCode server in `~/.config/prefect/servers.json`
- [ ] **MULTI-02**: `prefect remove-server <name>` CLI command — deregisters a named server
- [ ] **MULTI-03**: `prefect list-servers` CLI command — prints the registry with host, port, and model columns
- [ ] **MULTI-04**: Server registry persisted to `~/.config/prefect/servers.json`; reads on every CLI invocation (no in-process cache)
- [ ] **MULTI-05**: All composite and session tools accept an optional `server: string` param — routes the call to the named server; defaults to first registered server or `OPENCODE_URL` if registry is empty
- [ ] **MULTI-06**: `ensureOpencodeRunning()` is server-aware — auto-starts the correct OpenCode instance for the targeted named server using its host/port
- [ ] **MULTI-07**: CLAUDE.md server registry section documents available workers so Claude Code can make informed routing decisions without inspecting the config file
- [ ] **MULTI-08**: `prefect init` prompts for first server registration during setup and writes the entry to `servers.json`

### Existing v4 Backlog

- `opencode_run` tools override, FilePartInput, messageID resume, AgentPartInput/SubtaskPartInput
- `opencode_create_session` parentID (session hierarchies)
- session.summarize, session.todo (standalone tool), session.init, session.shell, session.share/unshare
- GET /vcs, GET /file/status, GET /mcp (inspect + inject), GET /experimental/tool

## Out of Scope

| Item | Reason |
|------|--------|
| OS keychain / keytar for credentials | Native dep; personal-use localhost service doesn't need keychain-level security |
| Credentials file (~/.config/prefect/credentials.json) | Unnecessary complexity; shell env is sufficient for single-user personal tool |
| SSE-based permission loop | Complexity without value; OpenCode auto-approves, git is the safety net |
| Multi-user / team concerns | Personal use only — no auth, no multi-tenant |
| `OPENCODE_AUTO_START=false` env var to disable auto-start | Default is auto-start on; if someone needs manual control they can kill the process |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| INFRA-01 | Phase 5 | Complete |
| INFRA-02 | Phase 5 | Complete |
| INFRA-03 | Phase 5 | Complete |
| INFRA-04 | Phase 6 | Pending |
| INFRA-05 | Phase 6 | Pending |
| INFRA-06 | Phase 6 | Pending |
| INFRA-07 | Phase 6 | Pending |
| INFRA-08 | Phase 6 | Pending |
| INFRA-09 | Phase 6 | Pending |
| INFRA-10 | Phase 6 | Pending |
| WORKFLOW-01 | Phase 7 | Pending |
| WORKFLOW-02 | Phase 7 | Pending |
| WORKFLOW-03 | Phase 7 | Pending |
| WORKFLOW-04 | Phase 7 | Pending |
| WORKFLOW-05 | Phase 7 | Pending |
| WORKFLOW-06 | Phase 7 | Pending |
| WORKFLOW-07 | Phase 7 | Pending |
| API-01 | Phase 8 | Pending |
| API-02 | Phase 8 | Pending |
| API-03 | Phase 8 | Pending |
| DIST-01 | Phase 9 | Pending |
| DIST-02 | Phase 9 | Pending |
| DIST-03 | Phase 9 | Pending |
| DIST-04 | Phase 9 | Pending |
| DIST-05 | Phase 9 | Pending |
| DIST-06 | Phase 9 | Pending |
| DIST-07 | Phase 9 | Pending |
| DIST-08 | Phase 9 | Pending |
| DIST-09 | Phase 9 | Pending |
| DIST-10 | Phase 9 | Pending |
| DIST-11 | Phase 9 | Pending |
| DIST-12 | Phase 9 | Pending |
| MULTI-01 | v4.0 | Backlog |
| MULTI-02 | v4.0 | Backlog |
| MULTI-03 | v4.0 | Backlog |
| MULTI-04 | v4.0 | Backlog |
| MULTI-05 | v4.0 | Backlog |
| MULTI-06 | v4.0 | Backlog |
| MULTI-07 | v4.0 | Backlog |
| MULTI-08 | v4.0 | Backlog |
