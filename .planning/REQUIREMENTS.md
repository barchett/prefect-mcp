# Requirements — Prefect v4.0 API Completeness

## Run Enhancements

- [ ] **RUN-05**: `prefect_run` accepts a `tools` array — overrides which tools are enabled for that single prompt (enable/disable per call)
- [ ] **RUN-06**: `prefect_run` accepts a `files` array of `{ path: string, content?: string }` objects (FilePartInput) — attaches file context to the prompt
- [ ] **RUN-07**: `prefect_run` accepts a `messageID` string — resumes the session from that specific message rather than appending to the end
- [ ] **RUN-08**: `prefect_run` accepts `agentInput` and `subtaskInput` fields (AgentPartInput / SubtaskPartInput) for structured multi-agent prompt shapes

## Session Lifecycle

- [ ] **SESSION-10**: `prefect_create_session` accepts an optional `parentID` string param — creates a child session linked to the given parent for hierarchy tracking
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

## Future Requirements (v5.0 — Multi-server Registry)

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
| RUN-05 | Phase 10 | Pending |
| RUN-06 | Phase 10 | Pending |
| RUN-07 | Phase 10 | Pending |
| RUN-08 | Phase 10 | Pending |
| SESSION-10 | Phase 10 | Pending |
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
| MULTI-01 | v5.0 | Backlog |
| MULTI-02 | v5.0 | Backlog |
| MULTI-03 | v5.0 | Backlog |
| MULTI-04 | v5.0 | Backlog |
| MULTI-05 | v5.0 | Backlog |
| MULTI-06 | v5.0 | Backlog |
| MULTI-07 | v5.0 | Backlog |
| MULTI-08 | v5.0 | Backlog |
