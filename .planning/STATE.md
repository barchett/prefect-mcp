---
gsd_state_version: 1.0
milestone: v4.0
milestone_name: API Completeness
status: in_progress
stopped_at: Roadmap created — ready to plan Phase 10
last_updated: "2026-04-29T00:00:00.000Z"
last_activity: 2026-04-29 — v4.0 roadmap created (Phases 10–12)
progress:
  total_phases: 3
  completed_phases: 0
  total_plans: 0
  completed_plans: 0
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-29 for v4.0 milestone)

**Core value:** Claude Code can delegate implementation to a local model and review/correct the results without leaving the Claude Code workflow.
**Current focus:** v4.0 API Completeness — Phase 10 next (Run + Session Param Additions)

## Current Position

Phase: 10 (not started)
Plan: —
Status: Roadmap created, ready to plan Phase 10
Last activity: 2026-04-29

Progress: [__________] 0%

## Accumulated Context

### Decisions

See PROJECT.md Key Decisions for full log.
Recent decisions affecting current work:

- Auto-approve OpenCode permissions: git is the safety net; SSE permission loop is out of scope
- OPENCODE_URL env var defaults to http://localhost:4096 — easy override, no code changes needed
- AbortController replaces Promise.race for opencode_run timeout — cancels in-flight TCP connection
- StdioServerTransport + .mcp.json project-scope: Claude Code spawns MCP servers as stdio subprocesses
- noReply vs prompt_async: separate concerns — noReply keeps the session prompt endpoint; RUN-04 uses /session/:id/prompt_async (204 void, true fire-and-forget)
- CLI entry point: separate src/cli.ts compiles to build/cli.js — avoids coupling MCP server startup with CLI argument parsing
- Manual process.argv parsing over Commander.js for prefect init — minimal surface (one subcommand, one flag), zero additional deps
- opencode_run returns structured { info, parts } payload with PartSchema validation
- model: z.string().optional() for opencode_session_command (not z.object): deliberate API difference — session.command endpoint takes single string
- v3.0 phases 5-9: directory infrastructure first (foundation), then auth+autostart (group together — health poll needs auth), then composite tools (highest risk, depends on resolveDirectory), then API wrappers (purely additive), then distribution last (stable features before publish)
- Phase 5 design decision: uniform directory schema on all 18 tools, but only pass to SDK where the endpoint accepts it — document which tools honor it. Consistent tool surface beats inconsistent schema; silent discard is acceptable when clearly documented (same reasoning as v1.0 permission enum: user-facing contract matters more than internal implementation symmetry).
- Phase 5 design decision: resolveDirectory() ends at undefined (NOT process.cwd()). Only send directory to OpenCode when explicitly provided via per-tool param or OPENCODE_DEFAULT_PROJECT. Sending process.cwd() unconditionally would silently override OpenCode's own session-level directory tracking — hard to diagnose bug class.
- v4.0 phase structure: 3 phases (coarse granularity). Phase 10 = additive body/param fields on existing tools (low risk, same code area). Phase 11 = new session lifecycle tools excluding shell (medium risk, POST/GET endpoints). Phase 12 = shell + workspace API wrappers (higher risk: SESSION-14 shell execution + API-07 MCP injection are the two elevated-risk items, isolated to last phase).

### Pending Todos

None.

### Blockers/Concerns

- SESSION-14 shell: POST /session/:id/shell — need to verify exact request/response shape from @opencode-ai/sdk types before implementing
- API-07 inject_mcp_server: POST /mcp — need to verify request body schema from @opencode-ai/sdk types; modifies live OpenCode config
- API-08 list_tools: uses /experimental/ endpoints — verify these exist and are stable in the current SDK version before Phase 12
- RUN-05 tools override: verify the exact field name and type (string[] of tool IDs? object?) from SDK types before Phase 10

## Deferred Items

None for v4.0 at start. See MILESTONES.md for prior milestone deferred items.

## Session Continuity

Last session: 2026-04-29
Stopped at: v4.0 roadmap written (ROADMAP.md, REQUIREMENTS.md, STATE.md updated)
Resume file: --resume-file

**Planned Phase:** 10 (Run + Session Param Additions) — TBD plans
