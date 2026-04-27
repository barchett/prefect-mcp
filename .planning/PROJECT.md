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

### Active (v2.0 targets)

- [ ] Session management: list, get, messages, message, delete
- [ ] opencode_run model override (providerID + modelID per prompt)
- [ ] opencode_run agent selection (build, research, etc.)
- [ ] opencode_run noReply mode (fire-and-forget async)
- [ ] opencode_run system prompt override
- [ ] Timeout fix: AbortController on fetch calls replacing Promise.race
- [ ] Install script: curl | bash zero-friction setup
- [ ] prefect init CLI: writes .mcp.json into current project

### Active (v3.0 targets)

- [ ] opencode_run tools override (enable/disable per prompt)
- [ ] opencode_run FilePartInput (file attachments as context)
- [ ] opencode_run messageID (resume from specific message)
- [ ] opencode_run AgentPartInput / SubtaskPartInput
- [ ] opencode_create_session parentID (session hierarchies)
- [ ] Workspace inspection: /find/symbol, /vcs, /file/status, /mcp, /experimental/tool*, /agent, /provider, /session/:id/todo, /session/:id/summarize

### Out of Scope

- npm packaging / shareable library — personal use tool for now
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
*Last updated: 2026-04-26 after v1.0 milestone close*
