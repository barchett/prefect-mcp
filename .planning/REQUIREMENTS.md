# Requirements — Prefect v3.0 Daily Driver

## Infrastructure

- [ ] **INFRA-01**: All 18 MCP tools accept an optional `directory` parameter that overrides the working directory for that call
- [ ] **INFRA-02**: `resolveDirectory()` helper resolves directory in order: per-tool `directory` param → `OPENCODE_DEFAULT_PROJECT` env var → `process.cwd()`
- [ ] **INFRA-03**: `OPENCODE_DEFAULT_PROJECT` env var is read at request time (not server startup) so changes take effect without restarting Claude Code
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

## Future Requirements (v4.0)

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

_Filled by roadmapper after roadmap creation._
