# Requirements — Prefect v5.0 Multi-Server Registry

## Multi-Server Registry

- [ ] **MULTI-01**: `prefect add-server <name> <host> <port> <model>` CLI command — registers a named OpenCode server in `~/.config/prefect/servers.json`
- [ ] **MULTI-02**: `prefect remove-server <name>` CLI command — deregisters a named server from the registry
- [ ] **MULTI-03**: `prefect list-servers` CLI command — prints the server registry in tabular form (name, host, port, model)
- [ ] **MULTI-04**: Server registry persisted to `~/.config/prefect/servers.json`; read at every CLI invocation (no in-process cache)
- [ ] **MULTI-05**: `server` param added to exactly 3 entry points — `prefect_create_session`, `prefect_delegate`, `prefect_dispatch`; all other tools route transparently via the session→server map; defaults to first registered server or `PREFECT_SERVER_URL` if registry is empty
- [ ] **MULTI-06**: Session→server map persisted to `~/.config/prefect/sessions.json`; composite tools (`prefect_delegate`, `prefect_dispatch`) register the sessionId→server mapping immediately on internal session creation; stale sessionIDs (OpenCode returns 404 after restart) are removed from the map and surfaced as actionable errors
- [ ] **MULTI-07**: `ensureOpencodeRunning()` is server-aware — auto-starts the correct OpenCode instance for the targeted named server using that server's host and port
- [ ] **MULTI-08**: CLAUDE.md server registry section documents available worker servers so Claude Code can make informed routing decisions without inspecting config files
- [ ] **MULTI-09**: `prefect init` prompts for first server registration during setup; if an existing env var provides model information, pre-populates the model field
- [ ] **MULTI-10**: `prefect_delegate` and `prefect_dispatch` accept an optional `sessionId` param — if provided, reuses that existing session on its already-registered server (`server` param ignored); if omitted, creates a new session on the named server (`server` required)

## Previous Milestone Requirements (v4.0 — Complete)

### Run Enhancements

- [x] **RUN-05**: `prefect_run` accepts a `tools` array — overrides which tools are enabled for that single prompt (enable/disable per call)
- [x] **RUN-06**: `prefect_run` accepts a `files` array of `{ path: string, content?: string }` objects (FilePartInput) — attaches file context to the prompt
- [x] **RUN-07**: `prefect_run` accepts a `messageID` string — assigns that ID to the new user message (idempotency key: if the ID already exists, OpenCode returns the cached response); for conversation branching use `prefect_fork`
- [x] **RUN-08**: `prefect_run` accepts `agentInput` and `subtaskInput` fields (AgentPartInput / SubtaskPartInput) for structured multi-agent prompt shapes

### Session Lifecycle

- [x] **SESSION-10**: `prefect_create_session` accepts an optional `parentID` string param — creates a child session linked to the given parent for hierarchy tracking
- [x] **SESSION-11**: `prefect_session_summarize` — wraps POST /session/:id/summarize; triggers OpenCode summary generation for a session
- [x] **SESSION-12**: `prefect_session_todo` — wraps GET /session/:id/todo; returns the current todo list for a session
- [x] **SESSION-13**: `prefect_session_init` — wraps POST /session/:id/init; generates an AGENTS.md file for the session's project
- [x] **SESSION-14**: `prefect_session_shell` — wraps POST /session/:id/shell; executes a shell command within the session's context
- [x] **SESSION-15**: `prefect_session_share` — wraps POST /session/:id/share; makes a session shareable
- [x] **SESSION-16**: `prefect_session_unshare` — wraps DELETE /session/:id/share; removes sharing from a session

### Workspace API Wrappers

- [x] **API-04**: `prefect_vcs_info` — wraps GET /vcs; returns structured VCS/git info for the workspace
- [x] **API-05**: `prefect_file_status` — wraps GET /file/status; returns git-tracked file status for the workspace
- [x] **API-06**: `prefect_list_mcp_servers` — wraps GET /mcp; returns list of MCP servers configured in the OpenCode instance
- [x] **API-07**: `prefect_inject_mcp_server` — wraps POST /mcp; adds/configures an MCP server in OpenCode at runtime
- [x] **API-08**: `prefect_list_tools` — wraps GET /experimental/tool/ids + GET /experimental/tool; returns available tools per model
- [x] **API-09**: `prefect_find_file` — wraps GET /find/file; finds a file in the workspace by name or pattern, returns matching paths
- [x] **API-10**: `prefect_get_file_content` — wraps GET /file/content; returns the content of a specific file in the workspace
- [x] **API-11**: `prefect_get_config` — wraps GET /config; returns the current OpenCode configuration object
- [x] **API-12**: `prefect_list_commands` — wraps GET /command; returns available slash commands, complementing prefect_session_command

## Out of Scope

| Item | Reason |
|------|--------|
| SSE-based permission loop | Complexity without value; OpenCode auto-approves, git is the safety net |
| Multi-user / team concerns | Personal use only — no auth, no multi-tenant |
| OS keychain / keytar for credentials | Native dep; personal-use localhost service doesn't need keychain-level security |
| PERM-01 `prefect_session_set_permissions` | SDK replacement for deprecated `tools` field not settled — `PermissionRuleset` exists on SessionCreate/Update but the endpoint semantics are unclear; deferred to future milestone |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-05 | Phase 10 | Complete |
| RUN-06 | Phase 10 | Complete |
| RUN-07 | Phase 10 | Complete |
| RUN-08 | Phase 10 | Complete |
| SESSION-10 | Phase 10 | Complete |
| SESSION-11 | Phase 11 | Complete |
| SESSION-12 | Phase 11 | Complete |
| SESSION-13 | Phase 11 | Complete |
| SESSION-14 | Phase 12 | Complete |
| SESSION-15 | Phase 11 | Complete |
| SESSION-16 | Phase 11 | Complete |
| API-04 | Phase 12 | Complete |
| API-05 | Phase 12 | Complete |
| API-06 | Phase 12 | Complete |
| API-07 | Phase 12 | Complete |
| API-08 | Phase 12 | Complete |
| API-09 | Phase 12 | Complete |
| API-10 | Phase 12 | Complete |
| API-11 | Phase 12 | Complete |
| API-12 | Phase 12 | Complete |
| MULTI-01 | Phase 13 | Pending |
| MULTI-02 | Phase 13 | Pending |
| MULTI-03 | Phase 13 | Pending |
| MULTI-04 | Phase 13 | Pending |
| MULTI-05 | Phase 14 | Pending |
| MULTI-06 | Phase 14 | Pending |
| MULTI-07 | Phase 14 | Pending |
| MULTI-08 | Phase 15 | Pending |
| MULTI-09 | Phase 15 | Pending |
| MULTI-10 | Phase 15 | Pending |
