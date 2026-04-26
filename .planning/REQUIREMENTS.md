# Requirements — Supervisor

## v1 Requirements

### MCP Server Core

- [ ] **CORE-01**: User can create a new OpenCode session via `opencode_create_session` (wraps POST /session)
- [ ] **CORE-02**: User can send a prompt and receive a result via `opencode_run` (wraps POST /session/{id}/message; blocks until run completes — blocking behavior marked TODO pending live API verification)
- [ ] **CORE-03**: User can retrieve the file diff for a session via `opencode_get_diff` (wraps GET /session/{id}/diff, optional messageID param)
- [ ] **CORE-04**: User can respond to an OpenCode permission request via `opencode_approve_permission` (wraps POST /session/{id}/permissions/{permId}, supports allow/deny/allow_always)
- [ ] **CORE-05**: User can fork a session at a given message via `opencode_fork` (wraps POST /session/{id}/fork — escape hatch for corrupted sessions)
- [ ] **CORE-06**: User can revert a session to a prior message via `opencode_revert` (wraps POST /session/{id}/revert)
- [ ] **CORE-07**: User can abort a running session via `opencode_abort` (wraps POST /session/{id}/abort)
- [ ] **CORE-08**: OpenCode base URL is read from `OPENCODE_URL` env var, defaulting to `http://localhost:4096`

### Wiring & Workflow

- [ ] **WIRE-01**: `.claude/settings.json` registers the MCP server as a Node.js stdio subprocess so Claude Code discovers the tools automatically
- [ ] **WIRE-02**: `CLAUDE.md` documents the review/correct loop pattern — create session → run prompt → get diff → run tests → correct or advance
- [ ] **WIRE-03**: `README.md` covers full setup: install deps, configure and run `opencode serve --port 4096` headless, point Claude Code at the MCP server
- [ ] **WIRE-04**: An example test task file (e.g. `examples/test-task.md`) provides a scoped real prompt to validate the full loop end-to-end

## v2 (Deferred)

- npm packaging / shareable library — personal use for now
- OpenCode config template (`~/.config/opencode/config.json`) with Qwen endpoint wired — useful reference but not blocking v1
- Permission loop via SSE — auto-approve is sufficient; SSE + blocking HTTP on the same session is complex

## Out of Scope

- SSE-based permission loop — auto-approve in OpenCode config eliminates the need; git is the safety net
- npm publish pipeline — personal tool, not a package
- Multi-user or team configuration — single machine, single developer

## Traceability

| REQ-ID | Phase | Status |
|--------|-------|--------|
| CORE-01 | Phase 1 | Pending |
| CORE-02 | Phase 1 | Pending |
| CORE-03 | Phase 1 | Pending |
| CORE-04 | Phase 1 | Pending |
| CORE-05 | Phase 1 | Pending |
| CORE-06 | Phase 1 | Pending |
| CORE-07 | Phase 1 | Pending |
| CORE-08 | Phase 1 | Pending |
| WIRE-01 | Phase 2 | Pending |
| WIRE-02 | Phase 2 | Pending |
| WIRE-03 | Phase 2 | Pending |
| WIRE-04 | Phase 2 | Pending |
