# Prefect

## What This Is

A TypeScript MCP server that exposes OpenCode's headless HTTP API as Claude Code tools. Claude Code orchestrates at the task/spec level (decompose, review, correct) while delegating actual file edits to a local model (Qwen or similar) running in OpenCode. The result lands in git history; Claude Code sees diffs and runs tests independently.

## Core Value

Claude Code can delegate implementation to a local model and review/correct the results without leaving the Claude Code workflow.

## Requirements

### Validated

- [x] MCP server with 7 OpenCode tools: opencode_create_session, opencode_run, opencode_get_diff, opencode_approve_permission, opencode_fork, opencode_revert, opencode_abort — Validated in Phase 1
- [x] All tools wrap OpenCode's HTTP API (OPENCODE_URL configurable, default http://localhost:4096) — Validated in Phase 1
- [x] opencode_run blocks via Promise.race with PREFECT_TIMEOUT_MS (120s default) — Validated in Phase 1 (WR-04 fix)
- [x] Project-scoped MCP registration via `.mcp.json` (type: stdio, command: node, args: build/index.js) — Validated in Phase 2 (WIRE-01)
- [x] CLAUDE.md documents the canonical create→run→diff→test→correct loop with all 7 tools — Validated in Phase 2 (WIRE-02)
- [x] README.md with full fresh-clone setup guide (install, build, configure OpenCode, serve, wire) — Validated in Phase 2 (WIRE-03)
- [x] examples/test-task.md end-to-end validation prompt producing a real file diff — Validated in Phase 2 (WIRE-04)

### Active

(None — milestone v1.0 complete)

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

## Constraints

- **Language**: TypeScript — MCP SDK is idiomatic TS, already have a ~250-line reference implementation
- **Runtime**: Node.js — MCP server runs as a stdio subprocess spawned by Claude Code
- **Scope**: Personal use only — no auth, no multi-tenant concerns, no npm publish pipeline
- **OpenCode API**: HTTP only — SSE-based permission loop deliberately out of scope for v1

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Auto-approve OpenCode permissions | Git is the safety net; permission loop (SSE + blocking HTTP on same session) adds complexity without proportional value | Validated Phase 1 |
| OPENCODE_URL env var, default http://localhost:4096 | Easy to override without touching code; personal use means one config | Validated Phase 1 |
| opencode_run blocks via Promise.race with PREFECT_TIMEOUT_MS | OpenCode /message endpoint streams; blocking achieved by racing SSE completion against configurable timeout (default 120s) | Validated Phase 1 (WR-04 fix) |
| StdioServerTransport + .mcp.json project-scope | Claude Code spawns MCP servers as subprocesses via stdio; .mcp.json ensures all clones get it without manual claude mcp add | Validated Phase 2 |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-27 — Phase 2 complete, milestone v1.0 complete*
