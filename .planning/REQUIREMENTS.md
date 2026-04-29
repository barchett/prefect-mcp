# Requirements — Prefect v4.0 API Completeness

## Run Enhancements

- [x] **RUN-05**: `prefect_run` accepts a `tools` array — overrides which tools are enabled for that single prompt (enable/disable per call)
- [x] **RUN-06**: `prefect_run` accepts a `files` array of `{ path: string, content?: string }` objects (FilePartInput) — attaches file context to the prompt
- [x] **RUN-07**: `prefect_run` accepts a `messageID` string — assigns that ID to the new user message (idempotency key: if the ID already exists, OpenCode returns the cached response); for conversation branching use `prefect_fork`
- [x] **RUN-08**: `prefect_run` accepts `agentInput` and `subtaskInput` fields (AgentPartInput / SubtaskPartInput) for structured multi-agent prompt shapes

## Session Lifecycle

- [x] **SESSION-10**: `prefect_create_session` accepts an optional `parentID` string param — creates a child session linked to the given parent for hierarchy tracking
- [ ] **SESSION-11**: `prefect_session_summarize` — wraps POST /session/:id/summarize; triggers OpenCode summary generation for a session
- [ ] **SESSION-12**: `prefect_session_todo` — wraps GET /session/:id/todo; returns the current todo list for a session
- [ ] **SESSION-13**: `prefect_session_init` — wraps POST /session/:id/init; generates an AGENTS.md file for the session's project
- [ ] **SESSION-14**: `prefect_session_shell` — wraps POST /session/:id/shell; executes a shell command within the session's context
- [ ] **SESSION-15**: `prefect_session_share` — wraps POST /session/:id/share; makes a session shareable
- [ ] **SESSION-16**: `prefect_session_unshare` — wraps DELETE /session/:id/share; removes sharing from a session

## Workspace API Wrappers

- [ ] **API-04**: `prefect_vcs_info` — wraps GET /vcs; returns structured VCS/git info for the workspace
- [ ] **API-05**: `prefect_file_status` — wraps GET /file/status; returns git-tracked file status for the workspace
- [ ] **API-06**: `prefect_list_mcp_servers` — wraps GET /mcp; returns list of MCP servers configured in the OpenCode instance
- [ ] **API-07**: `prefect_inject_mcp_server` — wraps POST /mcp; adds/configures an MCP server in OpenCode at runtime
- [ ] **API-08**: `prefect_list_tools` — wraps GET /experimental/tool/ids + GET /experimental/tool; returns available tools per model
- [ ] **API-09**: `prefect_find_file` — wraps GET /find/file; finds a file in the workspace by name or pattern, returns matching paths
- [ ] **API-10**: `prefect_get_file_content` — wraps GET /file/content; returns the content of a specific file in the workspace
- [ ] **API-11**: `prefect_get_config` — wraps GET /config; returns the current OpenCode configuration object
- [ ] **API-12**: `prefect_list_commands` — wraps GET /command; returns available slash commands, complementing prefect_session_command

## Future Requirements (v5.0)

- [ ] **PERM-01**: `prefect_session_set_permissions` — wraps PUT /session/{id}/permissions/{permissionID}; sets tool permissions on a session. Long-term replacement for the deprecated `tools` field in `prefect_run` (OpenCode v2 SDK marks `tools` deprecated in favor of session-level permissions)

- [ ] **MULTI-01**: `prefect add-server <name> <host> <port> <model>` CLI command — registers a named OpenCode server in `~/.config/prefect/servers.json`
- [ ] **MULTI-02**: `prefect remove-server <name>` CLI command — deregisters a named server
- [ ] **MULTI-03**: `prefect list-servers` CLI command — prints the registry with host, port, and model columns
- [ ] **MULTI-04**: Server registry persisted to `~/.config/prefect/servers.json`; read on every CLI invocation (no in-process cache)
- [ ] **MULTI-05**: All composite and session tools accept an optional `server: string` param — routes the call to the named server; defaults to first registered or `OPENCODE_URL` if registry is empty
- [ ] **MULTI-06**: `ensureOpencodeRunning()` is server-aware — auto-starts the correct OpenCode instance for the targeted named server using its host/port
- [ ] **MULTI-07**: CLAUDE.md server registry section documents available workers so Claude Code can make informed routing decisions without inspecting config files
- [ ] **MULTI-08**: `prefect init` prompts for first server registration during setup and writes the entry to `servers.json`

## Out of Scope

| Item | Reason |
|------|--------|
| SSE-based permission loop | Complexity without value; OpenCode auto-approves, git is the safety net |
| Multi-user / team concerns | Personal use only — no auth, no multi-tenant |
| OS keychain / keytar for credentials | Native dep; personal-use localhost service doesn't need keychain-level security |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| RUN-05 | Phase 10 | Complete |
| RUN-06 | Phase 10 | Complete |
| RUN-07 | Phase 10 | Complete |
| RUN-08 | Phase 10 | Complete |
| SESSION-10 | Phase 10 | Complete |
| SESSION-11 | Phase 11 | Pending |
| SESSION-12 | Phase 11 | Pending |
| SESSION-13 | Phase 11 | Pending |
| SESSION-14 | Phase 12 | Pending |
| SESSION-15 | Phase 11 | Pending |
| SESSION-16 | Phase 11 | Pending |
| API-04 | Phase 12 | Pending |
| API-05 | Phase 12 | Pending |
| API-06 | Phase 12 | Pending |
| API-07 | Phase 12 | Pending |
| API-08 | Phase 12 | Pending |
| API-09 | Phase 12 | Pending |
| API-10 | Phase 12 | Pending |
| API-11 | Phase 12 | Pending |
| API-12 | Phase 12 | Pending |
| PERM-01 | v5.0 | Backlog |
| MULTI-01 | v5.0 | Backlog |
| MULTI-02 | v5.0 | Backlog |
| MULTI-03 | v5.0 | Backlog |
| MULTI-04 | v5.0 | Backlog |
| MULTI-05 | v5.0 | Backlog |
| MULTI-06 | v5.0 | Backlog |
| MULTI-07 | v5.0 | Backlog |
| MULTI-08 | v5.0 | Backlog |
