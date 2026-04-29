# Prefect

## What This Is

A TypeScript MCP server that exposes OpenCode's headless HTTP API as Claude Code tools. Claude Code orchestrates at the task/spec level (decompose, review, correct) while delegating actual file edits to a local model (Qwen or similar) running in OpenCode. The result lands in git history; Claude Code sees diffs and runs tests independently.

## Current Milestone: v4.0 API Completeness

**Goal:** Expand Prefect's tool surface with run enhancements, session lifecycle tools, and workspace API wrappers — completing coverage of OpenCode's HTTP API.

**Target features:**
- `prefect_run` enhancements: tools override, FilePartInput (file attachments), messageID (resume), AgentPartInput/SubtaskPartInput
- Session lifecycle: `parentID` (hierarchies), summarize, todo, init (AGENTS.md), shell, share/unshare
- Workspace API wrappers: VCS info, file/status, MCP inspect+inject, experimental/tool

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

### Active (v4.0 targets)

- [ ] `prefect_run` tools override (enable/disable per prompt)
- [ ] `prefect_run` FilePartInput (file attachments as context)
- [ ] `prefect_run` messageID (resume from specific message)
- [ ] `prefect_run` AgentPartInput / SubtaskPartInput
- [ ] `prefect_create_session` parentID (session hierarchies)
- [ ] session.summarize — POST /session/:id/summarize
- [ ] session.todo — GET /session/:id/todo
- [ ] session.init — POST /session/:id/init (generate AGENTS.md)
- [ ] session.shell — POST /session/:id/shell
- [ ] session.share / session.unshare — POST+DELETE /session/:id/share
- [ ] GET /vcs — structured VCS info
- [ ] GET /file/status — structured git-tracked file status
- [ ] GET /mcp + POST /mcp — inspect and inject MCP servers
- [ ] GET /experimental/tool/ids + GET /experimental/tool — inspect available tools per model

### Future (v5.0 targets — Multi-server Registry)

- [ ] MULTI-01: `prefect add-server <name> <host> <port> <model>` CLI command
- [ ] MULTI-02: `prefect remove-server <name>` CLI command
- [ ] MULTI-03: `prefect list-servers` CLI command
- [ ] MULTI-04: Server registry persisted to `~/.config/prefect/servers.json`
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
*Last updated: 2026-04-29 — v4.0 milestone started; v3.0 fully validated; v5.0 multi-server registry scoped*
