# Roadmap: Prefect

## Overview

Build a TypeScript MCP server that wraps OpenCode's HTTP API as Claude Code tools, then wire it into the Claude Code workflow with documentation and an end-to-end validation task. Phase 1 delivers the working server; Phase 2 makes it usable day-to-day.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: MCP Server** - Implement all 7 OpenCode tools as a working MCP stdio server
- [ ] **Phase 2: Wiring & Validation** - Wire Claude Code config, document the review/correct loop, and validate end-to-end

## Phase Details

### Phase 1: MCP Server
**Goal**: Claude Code can invoke all OpenCode tools via the MCP server
**Depends on**: Nothing (first phase)
**Requirements**: CORE-01, CORE-02, CORE-03, CORE-04, CORE-05, CORE-06, CORE-07, CORE-08
**Success Criteria** (what must be TRUE):
  1. Running the MCP server and calling `opencode_create_session` returns a session ID from OpenCode
  2. Calling `opencode_run` with a prompt blocks until OpenCode finishes and returns the result
  3. Calling `opencode_get_diff` returns the file diff for a completed session
  4. Calling `opencode_approve_permission`, `opencode_fork`, `opencode_revert`, and `opencode_abort` all reach the correct OpenCode endpoints without error
  5. Changing `OPENCODE_URL` env var redirects all tool calls to the new base URL
**Plans**: 3 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold project (package.json, tsconfig.json, .gitignore, npm install) and confirm SDK method names
- [x] 01-02-PLAN.md — Server skeleton + opencode_create_session (CORE-01) + opencode_abort (CORE-07); verify CORE-08 OPENCODE_URL works
- [x] 01-03-PLAN.md — Add remaining 5 tools: opencode_run (CORE-02), opencode_get_diff (CORE-03), opencode_approve_permission (CORE-04), opencode_fork (CORE-05), opencode_revert (CORE-06)

### Phase 2: Wiring & Validation
**Goal**: The full review/correct loop runs end-to-end inside Claude Code without manual setup steps
**Depends on**: Phase 1
**Requirements**: WIRE-01, WIRE-02, WIRE-03, WIRE-04
**Success Criteria** (what must be TRUE):
  1. Opening a fresh Claude Code session, the MCP tools appear in the tool list without any manual configuration step
  2. Following README instructions from scratch produces a working setup (opencode headless + MCP server + Claude Code wired)
  3. CLAUDE.md describes the create → run → diff → test → correct loop and Claude Code can follow it without additional prompting
  4. Running the example task in `examples/test-task.md` completes the full loop and lands a diff in git history
**Plans**: 2 plans
Plans:
- [ ] 02-01-PLAN.md — Write `.mcp.json` (WIRE-01) and `examples/test-task.md` (WIRE-04) — small mechanical config + validation prompt
- [ ] 02-02-PLAN.md — Write `CLAUDE.md` (WIRE-02) and `README.md` (WIRE-03) — loop documentation + fresh-clone setup guide

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. MCP Server | 3/3 | Complete | 2026-04-26 |
| 2. Wiring & Validation | 0/2 | Not started | - |
