# Prefect

## What This Is

A TypeScript MCP server that exposes OpenCode's headless HTTP API as Claude Code tools. Claude Code orchestrates at the task/spec level (decompose, review, correct) while delegating actual file edits to a local model (Qwen or similar) running in OpenCode. The result lands in git history; Claude Code sees diffs and runs tests independently.

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

## Current Milestone: v2.0 session-management

**Goal:** Expand Prefect's toolset with session management operations, richer `opencode_run` options, a more reliable timeout mechanism, and zero-friction setup tooling.

**Target features:**
- Session management: list, get, status, messages (paginated), message, delete, rename, children, unrevert (9 new tools)
- `opencode_run` enhancements: model/providerID+modelID override, agent selection, system prompt override
- `prompt_async` — POST /session/:id/prompt_async (true fire-and-forget, replaces noReply concept)
- Document `patch` field on `opencode_get_diff` and `parts` response shape on `opencode_run`
- Timeout fix: AbortController on fetch calls replacing `Promise.race`
- Install script: `curl | bash` zero-friction setup
- `prefect init` CLI: writes `.mcp.json` into current project

**API research gate:** Before any plan is written, fully document each endpoint being added or modified — all query params, body fields, response shape variants. For modified tools (`opencode_run`), audit current implementation against spec and produce explicit implemented / intentionally-deferred decisions for every option.

### Active (v2.0 targets)

- [x] session.list — GET /session — Validated Phase 3 (2026-04-27)
- [x] session.get — GET /session/:id — Validated Phase 3 (2026-04-27)
- [x] session.status — GET /session/status — Validated Phase 3 (2026-04-27)
- [x] session.messages — GET /session/:id/message (with limit/pagination) — Validated Phase 3 (2026-04-27)
- [x] session.message — GET /session/:id/message/:id — Validated Phase 3 (2026-04-27)
- [x] session.delete — DELETE /session/:id — Validated Phase 3 (2026-04-27)
- [x] session.rename — PATCH /session/:id — Validated Phase 3 (2026-04-27)
- [x] session.children — GET /session/:id/children — Validated Phase 3 (2026-04-27)
- [x] session.unrevert — POST /session/:id/unrevert — Validated Phase 3 (2026-04-27)
- [x] opencode_run model override (providerID + modelID per prompt) — Validated Phase 4 (2026-04-27)
- [x] opencode_run agent selection — Validated Phase 4 (2026-04-27)
- [x] prompt_async — POST /session/:id/prompt_async (fire-and-forget) — Validated Phase 4 (2026-04-27)
- [x] opencode_run system prompt override — Validated Phase 4 (2026-04-27)
- [x] Document patch field on opencode_get_diff response — Validated Phase 4 (2026-04-27)
- [x] Document parts response shape on opencode_run via PartSchema (12 Part types) — Validated Phase 4 (2026-04-27)
- [x] Timeout fix: AbortController replacing Promise.race — Validated Phase 4 (2026-04-27)
- [ ] Install script: curl | bash zero-friction setup
- [x] prefect init CLI: writes .mcp.json into current project — Validated Phase 4 (2026-04-27)
- [x] session.command — POST /session/:id/command (run slash commands) — Validated Phase 4 (2026-04-27)

### Active (v3.0 targets)

- [ ] opencode_run tools override (enable/disable per prompt)
- [ ] opencode_run FilePartInput (file attachments as context)
- [ ] opencode_run messageID (resume from specific message)
- [ ] opencode_run AgentPartInput / SubtaskPartInput
- [ ] opencode_create_session parentID (session hierarchies)
- [ ] session.summarize — POST /session/:id/summarize
- [ ] session.todo — GET /session/:id/todo
- [ ] session.init — POST /session/:id/init (generate AGENTS.md)
- [ ] session.shell — POST /session/:id/shell
- [ ] session.share / session.unshare — POST+DELETE /session/:id/share
- [ ] GET /find/symbol — LSP-backed workspace symbol search
- [ ] GET /vcs — structured VCS info
- [ ] GET /file/status — structured git-tracked file status
- [ ] GET /mcp + POST /mcp — inspect and inject MCP servers
- [ ] GET /experimental/tool/ids + GET /experimental/tool — inspect available tools per model
- [ ] GET /agent — list available agents
- [ ] GET /provider — list configured providers and models
- [ ] directory param on all tools (currently only on opencode_create_session)
- [ ] auto-start opencode serve if not running (currently a manual prerequisite)
- [ ] npm publish + npm install -g prefect-mcp install pathway
- [ ] opencode_delegate — blocking create+run+diff in one call (WORKFLOW-01)
- [ ] opencode_dispatch — non-blocking fire-and-forget create+prompt_async (WORKFLOW-02)
- [ ] opencode_inspect — compact progress snapshot: status+todo+changed files (WORKFLOW-03)
- [ ] opencode_await — poll a dispatch session to completion, return full result (WORKFLOW-04)

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

## Constraints

- **Language**: TypeScript — MCP SDK is idiomatic TS, already have a ~200-line reference implementation
- **Runtime**: Node.js — MCP server runs as a stdio subprocess spawned by Claude Code
- **Scope**: Personal use only — no auth, no multi-tenant concerns, no npm publish pipeline
- **OpenCode API**: HTTP only — SSE-based permission loop deliberately out of scope

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auto-approve OpenCode permissions | Git is the safety net; permission loop (SSE + blocking HTTP on same session) adds complexity without proportional value | Validated v1.0 |
| OPENCODE_URL env var, default http://localhost:4096 | Easy to override without touching code; personal use means one config | Validated v1.0 |
| opencode_run blocks via Promise.race with PREFECT_TIMEOUT_MS | OpenCode /message endpoint is long-lived blocking HTTP; racing against configurable timeout (default 120s) is simpler than AbortController | Validated v1.0; AbortController upgrade planned for v2.0 |
| StdioServerTransport + .mcp.json project-scope | Claude Code spawns MCP servers as subprocesses via stdio; .mcp.json ensures all clones get it without manual claude mcp add | Validated v1.0 |
| Permission response enum: once/always/reject | REQUIREMENTS.md originally said allow/deny/allow_always — confirmed from @opencode-ai/sdk types that actual API enum is once/always/reject | Validated v1.0 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

---
*Last updated: 2026-04-27 — Phase 4 complete (v2.0 milestone done: run options, PartSchema, AbortController, prefect init CLI, session.command)*
