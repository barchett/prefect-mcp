# Prefect

## What This Is

A TypeScript MCP server that exposes OpenCode's headless HTTP API as Claude Code tools. Claude Code orchestrates at the task/spec level (decompose, review, correct) while delegating actual file edits to a local model (Qwen or similar) running in OpenCode. The result lands in git history; Claude Code sees diffs and runs tests independently.

## Current Milestone: v5.0 Multi-Server Registry

**Goal:** Route Claude Code tool calls across named OpenCode servers transparently — tracked per session, CLI registry, resilient stale-session handling.

**Target features:**
- CLI registry: `prefect add-server / remove-server / list-servers` → `~/.config/prefect/servers.json`
- `server` param on 3 entry points only: `prefect_create_session`, `prefect_delegate`, `prefect_dispatch`
- Session→server map persisted to `~/.config/prefect/sessions.json`; stale entries cleared on 404
- `prefect_delegate` + `prefect_dispatch` accept optional `sessionId` for session reuse
- `ensureOpencodeRunning()` server-aware auto-start
- CLAUDE.md server registry section
- `prefect init` first-server onboarding with conditional env var pre-population

## Previous Milestone: v4.0 API Completeness — COMPLETE

**Goal:** Expand Prefect's tool surface with run enhancements, session lifecycle tools, and workspace API wrappers — completing coverage of OpenCode's HTTP API. ✓ Achieved 2026-04-30 — 40 tools total.

## Core Value

Claude Code can delegate implementation to a local model and review/correct the results without leaving the Claude Code workflow.

## Requirements

### Validated (v1.0)

- ✓ MCP server with 7 OpenCode tools: opencode_create_session, opencode_run, opencode_get_diff, opencode_approve_permission, opencode_fork, opencode_revert, opencode_abort — v1.0
- ✓ All tools wrap OpenCode's HTTP API (OPENCODE_URL configurable, default http://localhost:4096) — v1.0
- ✓ opencode_run blocks via Promise.race with PREFECT_TIMEOUT_MS (120s default) — v1.0
- ✓ Project-scoped MCP registration via `.mcp.json` (type: stdio, command: node, args: build/index.js) — v1.0
- ✓ CLAUDE.md documents the canonical create→run→diff→test→correct loop with all 7 tools — v1.0
- ✓ README.md with full fresh-clone setup guide (install, build, configure OpenCode, serve, wire) — v1.0
- ✓ examples/test-task.md end-to-end validation prompt producing a real file diff — v1.0

### Validated (v2.0)

- ✓ session.list, session.get, session.status, session.messages, session.message — 5 read-only session inspection tools — v2.0
- ✓ session.delete, session.rename, session.children, session.unrevert — 4 mutating session tools — v2.0
- ✓ opencode_run model override (providerID + modelID pair, both required) — v2.0
- ✓ opencode_run agent selection and system prompt override — v2.0
- ✓ opencode_prompt_async — true fire-and-forget via POST /session/:id/prompt_async — v2.0
- ✓ opencode_get_diff surfaces `patch` as top-level string field — v2.0
- ✓ opencode_run returns structured `{ info, parts }` with Zod-validated 12-type PartSchema — v2.0
- ✓ AbortController timeout replacing Promise.race — cancels in-flight TCP on abort — v2.0
- ✓ prefect init CLI — writes .mcp.json with merge-not-overwrite semantics — v2.0
- ✓ opencode_session_command — POST /session/:id/command for slash command execution — v2.0


### Validated (v3.0)

- ✓ directory param on all 18 tools via `resolveDirectory()` + `PREFECT_DEFAULT_PROJECT` env var — Phase 5 complete — v3.0
- ✓ auto-start opencode serve if not running — Phase 6 complete — v3.0
- ✓ opencode_delegate — blocking create+run+diff in one call (WORKFLOW-01) — Phase 7 complete — v3.0
- ✓ opencode_dispatch — non-blocking fire-and-forget create+prompt_async (WORKFLOW-02) — Phase 7 complete — v3.0
- ✓ opencode_inspect — compact progress snapshot: status+todo+changed files (WORKFLOW-03) — Phase 7 complete — v3.0
- ✓ opencode_await — poll a dispatch session to completion, return full result (WORKFLOW-04) — Phase 7 complete — v3.0
- ✓ npm publish + `npm install -g @lbarchett/prefect-mcp` install pathway — Phase 9 complete — v3.0
- ✓ Tool names renamed: all 25 `opencode_*` → `prefect_*`; env vars `OPENCODE_*` → `PREFECT_*` with soft-migration fallback — Phase 9 complete — v3.0
- ✓ GET /agent — list available agents (`prefect_list_agents`) — Phase 8 complete — v3.0
- ✓ GET /provider — list configured providers and models (`prefect_list_providers`) — Phase 8 complete — v3.0
- ✓ GET /find/symbol — LSP-backed workspace symbol search (`prefect_find_symbol`) — Phase 8 complete — v3.0

### Validated (v4.0)

- ✓ `prefect_run` tools override (enable/disable per prompt) — Phase 10 complete — v4.0
- ✓ `prefect_run` FilePartInput (file attachments as context) — Phase 10 complete — v4.0
- ✓ `prefect_run` messageID (resume from specific message) — Phase 10 complete — v4.0
- ✓ `prefect_run` AgentPartInput / SubtaskPartInput — Phase 10 complete — v4.0
- ✓ `prefect_create_session` parentID (session hierarchies) — Phase 10 complete — v4.0
- ✓ session.summarize — POST /session/:id/summarize — Phase 11 complete — v4.0
- ✓ session.todo — GET /session/:id/todo — Phase 11 complete — v4.0
- ✓ session.init — POST /session/:id/init (generate AGENTS.md) — Phase 11 complete — v4.0
- ✓ session.share / session.unshare — POST+DELETE /session/:id/share — Phase 11 complete — v4.0
- ✓ `prefect_session_shell` — POST /session/:id/shell (SESSION-14) — Phase 12 complete — v4.0
- ✓ `prefect_vcs_info` — GET /vcs structured VCS info (API-04) — Phase 12 complete — v4.0
- ✓ `prefect_file_status` — GET /file/status git-tracked file status (API-05) — Phase 12 complete — v4.0
- ✓ `prefect_list_mcp_servers` — GET /mcp inspect MCP servers (API-06) — Phase 12 complete — v4.0
- ✓ `prefect_inject_mcp_server` — POST /mcp inject MCP servers (API-07) — Phase 12 complete — v4.0
- ✓ `prefect_list_tools` — dual-endpoint tool discovery (API-08) — Phase 12 complete — v4.0
- ✓ `prefect_find_file` — GET /find/file workspace file search (API-09) — Phase 12 complete — v4.0
- ✓ `prefect_get_file_content` — GET /file/content file reader (API-10) — Phase 12 complete — v4.0
- ✓ `prefect_get_config` — GET /config full config object (API-11) — Phase 12 complete — v4.0
- ✓ `prefect_list_commands` — GET /command slash commands (API-12) — Phase 12 complete — v4.0

### Validated (v5.0 — Phase 13)

- ✓ MULTI-01: `prefect add-server <name> <host> <port> <model>` CLI command — Phase 13 complete — v5.0
- ✓ MULTI-02: `prefect remove-server <name>` CLI command — Phase 13 complete — v5.0
- ✓ MULTI-03: `prefect list-servers` CLI command — Phase 13 complete — v5.0
- ✓ MULTI-04: Server registry persisted to `~/.config/prefect/servers.json` via `src/registry.ts` — Phase 13 complete — v5.0

### Future (v5.0 targets — Multi-server Routing)

- [ ] MULTI-05: All composite + session tools accept optional `server:` param for routing
- [ ] MULTI-06: `ensureOpencodeRunning()` server-aware auto-start
- [ ] MULTI-07: CLAUDE.md server registry section for Claude Code routing decisions
- [ ] MULTI-08: `prefect init` prompts for first server registration

### Out of Scope

- Multi-user or team npm registry — npm publish is in scope but scoped to single-developer install
- Permission loop (SSE + concurrent HTTP) — OpenCode auto-approves trusted ops; git is the safety net
- Multi-user or team config — single machine, single developer

## Context

- OpenCode runs headless: `opencode serve --port 4096`
- OpenCode config sets model to local Qwen (Ollama/llama.cpp) and auto-approves file write/delete
- Claude Code acts as orchestrator: it reads specs, decomposes phases, sends prompts to opencode_run, reviews diffs, runs tests via bash, and sends corrections if needed
- If a session gets corrupted, opencode_fork at the last good message provides an escape hatch
- The MCP SDK is `@modelcontextprotocol/sdk`; transport is StdioServerTransport (Claude Code spawns the server as a subprocess)
- Shipped v1.0 with 201 LOC TypeScript, 46 commits
- Shipped v2.0 with 1,221 LOC TypeScript, 69 commits — 18 tools total (up from 7)
- Phase 6 complete (2026-04-28): HTTP Basic Auth injection + auto-start of opencode serve — unified via src/fetch.ts SDK hook covering all 18 tools
- Phase 7 complete (2026-04-28): Four composite tools (opencode_delegate, opencode_dispatch, opencode_inspect, opencode_await) + handler extraction refactor (src/handlers.ts) — 22 tools total
- Phase 8 complete (2026-04-28): Three read-only API wrappers (prefect_list_agents, prefect_list_providers, prefect_find_symbol) — 25 tools total
- Phase 9 complete (2026-04-29): All 25 tool names renamed opencode_* → prefect_*; env vars OPENCODE_* → PREFECT_* with soft-migration fallback; npm publishing manifest added (prefect-mcp); global install detection in cli.ts; package ready for `npm publish --access public`
- Phase 10 complete (2026-04-29): prefect_run enhancements — tools override, FilePartInput, messageID, AgentPartInput/SubtaskPartInput, parentID on prefect_create_session — 30 tools total
- Phase 11 complete (2026-04-30): Session lifecycle tools — prefect_session_summarize, prefect_session_todo, prefect_session_init, prefect_session_share, prefect_session_unshare — 30 tools total (lifecycle tools added to existing session handlers)
- Phase 12 complete (2026-04-30): Shell + workspace API wrappers — 10 new tools covering GET /vcs, GET /file/status, GET+POST /mcp, dual-endpoint /experimental/tool, GET /find/file, GET /file/content, GET /config, GET /command, POST /session/:id/shell — **40 tools total; v4.0 milestone complete**
- Phase 13 complete (2026-05-01): Server registry CLI — `prefect add-server/remove-server/list-servers` subcommands + `src/registry.ts` persistence module + 17 new tests (56 total) — MULTI-01..04 satisfied; v5.0 Phase 1/3 complete

## Constraints

- **Language**: TypeScript — MCP SDK is idiomatic TS, already have a ~200-line reference implementation
- **Runtime**: Node.js — MCP server runs as a stdio subprocess spawned by Claude Code
- **Scope**: Personal use only — no auth, no multi-tenant concerns
- **OpenCode API**: HTTP only — SSE-based permission loop deliberately out of scope

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auto-approve OpenCode permissions | Git is the safety net; permission loop (SSE + blocking HTTP on same session) adds complexity without proportional value | ✓ Validated v1.0 |
| OPENCODE_URL env var, default http://localhost:4096 | Easy to override without touching code; personal use means one config | ✓ Validated v1.0 |
| opencode_run blocks via Promise.race with PREFECT_TIMEOUT_MS | Simpler than AbortController for v1; upgraded to AbortController in v2.0 | ✓ Validated v1.0; superseded v2.0 |
| StdioServerTransport + .mcp.json project-scope | Claude Code spawns MCP servers as subprocesses via stdio; .mcp.json ensures all clones get it without manual claude mcp add | ✓ Validated v1.0 |
| Permission response enum: once/always/reject | REQUIREMENTS.md originally said allow/deny/allow_always — confirmed from @opencode-ai/sdk types | ✓ Validated v1.0 |
| AbortController replaces Promise.race for opencode_run timeout | Cancels in-flight TCP connection on abort; Promise.race orphaned the HTTP request | ✓ Validated v2.0 |
| opencode_prompt_async is a separate endpoint, not noReply | POST /session/:id/prompt_async returns 204 void; noReply on the sync prompt endpoint is a different concept | ✓ Validated v2.0 |
| SURF-02 discriminators verified from SDK types before writing Zod schemas | Getting Part type literals wrong is the same bug class as the v1.0 permission enum error | ✓ Validated v2.0 |
| CLI in separate src/cli.ts compiling to build/cli.js | Avoids coupling MCP server stdio startup with CLI argument parsing | ✓ Validated v2.0 |
| Manual process.argv parsing over Commander.js | One subcommand, one flag — zero additional deps justified | ✓ Validated v2.0 |
| model field on opencode_session_command is z.string(), not z.object() | session.command endpoint takes a single string, not a providerID+modelID object | ✓ Validated v2.0 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-05-01 — Phase 13 complete (MULTI-01..04); v5.0 Phase 14 (session-server routing) is next*
