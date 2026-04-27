---
phase: 02-wiring-validation
plan: "01"
subsystem: mcp
tags: [mcp, configuration, stdio, opencode, examples]

# Dependency graph
requires:
  - phase: 01-mcp-server
    provides: "build/index.js MCP server binary with 7 prefect tools via StdioServerTransport"
provides:
  - ".mcp.json project-scoped Claude Code MCP registration for prefect server"
  - "examples/test-task.md end-to-end validation loop (create->run->diff->commit)"
affects: [02-wiring-validation, README, future operators running UAT]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "stdio MCP registration via .mcp.json at project root (project scope, not local)"
    - "End-to-end validation documented as markdown loop script"

key-files:
  created:
    - examples/test-task.md
  modified:
    - .mcp.json

key-decisions:
  - "env: {} in .mcp.json is intentional — src/index.ts defaults OPENCODE_URL and PREFECT_TIMEOUT_MS; no secrets in committed config"
  - "Relative path build/index.js in .mcp.json — Claude Code CWD is project root at session start"
  - "Verbatim prompt in test-task.md — Phase 1 UAT proved PONG-style prompts return empty diffs; file-write prompts required"

patterns-established:
  - "Pattern 1: MCP registration via .mcp.json with type:stdio, relative args path, empty env"
  - "Pattern 2: Validation loops documented as numbered steps with explicit success assertions and failure-mode table"

requirements-completed: [WIRE-01, WIRE-04]

# Metrics
duration: 2min
completed: "2026-04-27"
---

# Phase 2 Plan 01: MCP Registration & Validation Example Summary

**Project-scoped MCP stdio registration (.mcp.json) and deterministic end-to-end validation loop (examples/test-task.md) wiring prefect's 7 OpenCode tools into Claude Code**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-27T00:00:44Z
- **Completed:** 2026-04-27T00:02:37Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- Replaced the empty `{"mcpServers":{}}` stub in `.mcp.json` with a verified 4-key project-scoped stdio registration pointing to `node build/index.js`
- Created `examples/test-task.md` with the exact prompt, 6-step validation loop, success assertions, and failure-mode table — all informed by Phase 1 UAT learnings
- Both files pass all plan acceptance criteria (JSON.parse, grep checks, tool name verification)

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace .mcp.json with verified project-scoped registration (WIRE-01)** - `566e83b` (feat)
2. **Task 2: Write examples/test-task.md with the full validation loop (WIRE-04)** - `5bc62a1` (feat)

**Plan metadata:** (see final commit in this series)

## Files Created/Modified
- `.mcp.json` - Project-scoped Claude Code MCP registration: type=stdio, command=node, args=[build/index.js], env={}
- `examples/test-task.md` - 6-step end-to-end validation loop with verbatim OpenCode prompt, success assertions, failure-mode table, and prerequisites

## Decisions Made
- `env: {}` committed intentionally — `src/index.ts` already supplies defaults for `OPENCODE_URL` (http://localhost:4096) and `PREFECT_TIMEOUT_MS` (120000). Per threat model T-02-01-03, no secrets belong in the committed file.
- Relative path `build/index.js` used in `.mcp.json` — Claude Code spawns the server with CWD=project root; absolute paths would break portability.
- Verbatim prompt specified in `test-task.md` — Phase 1 UAT test 3 confirmed that text-only reply prompts produce empty diffs from OpenCode; the prompt must explicitly instruct file creation.

## Deviations from Plan

None - plan executed exactly as written. Both files use verbatim verified content from RESEARCH.md with no modifications.

## Issues Encountered

None. Both tasks completed without error on first attempt. All acceptance criteria passed.

## Threat Surface Scan

No new security surface beyond what the plan's threat model already covers. `.mcp.json` introduces the `command: node` subprocess spawn (T-02-01-01, T-02-01-02 — accepted for personal-use tool). `env: {}` keeps secrets out of the committed file (T-02-01-03 — mitigated). The test-task.md prompt is bounded to writing `examples/hello.ts` (T-02-01-04 — accepted).

## Known Stubs

None. `examples/hello.ts` is not created by this plan — it is created at runtime by OpenCode during the validation loop. `test-task.md` documents this explicitly.

## Next Phase Readiness
- WIRE-01 and WIRE-04 complete — `.mcp.json` ready for Claude Code to pick up on next session open
- Plan 02-02 (README + AGENTS.md) runs in parallel in the same wave and is independent of these files
- After both wave-1 plans complete: human operator runs the `examples/test-task.md` loop to confirm end-to-end wiring

---
*Phase: 02-wiring-validation*
*Completed: 2026-04-27*
