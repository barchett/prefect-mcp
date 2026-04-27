---
phase: 02-wiring-validation
verified: 2026-04-26T00:00:00Z
status: human_needed
score: 4/4 must-haves verified
overrides_applied: 0
human_verification:
  - test: "Open a fresh Claude Code session in the project root and run /mcp"
    expected: "prefect listed as connected with all 7 tools visible, without any manual claude mcp add step"
    why_human: "Requires running Claude Code interactively; cannot verify MCP server auto-discovery programmatically"
  - test: "Execute examples/test-task.md steps 1-6 with OpenCode running on port 4096"
    expected: "opencode_get_diff returns a non-empty FileDiff array referencing examples/hello.ts; git log shows the commit"
    why_human: "Requires a live OpenCode session and actual model inference; cannot simulate the create->run->diff loop without the full stack running"
---

# Phase 2: Wiring & Validation Verification Report

**Phase Goal:** Make the prefect MCP server usable — wire Claude Code to the MCP server at project scope, document the review/correct loop, provide a setup guide for fresh clones, and include an end-to-end validation prompt.
**Verified:** 2026-04-26
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | `.mcp.json` at project root registers the prefect server as a stdio Node.js subprocess | VERIFIED | File exists; `JSON.parse` passes; type=stdio, command=node, args=["build/index.js"], env={}; no absolute paths; only "prefect" key present |
| 2 | Opening a fresh Claude Code session surfaces the 7 prefect tools without manual `claude mcp add` | NEEDS HUMAN | .mcp.json is structurally correct and uses project scope, but actual tool discovery requires running Claude Code interactively |
| 3 | `examples/test-task.md` describes a complete create -> run -> diff -> commit loop with a verbatim prompt that produces a non-empty diff | VERIFIED | File exists; contains opencode_create_session, opencode_run, opencode_get_diff, examples/hello.ts, greet, console.log, Success Assertions section, Failure Modes table, git commit, 120s timeout reference |
| 4 | CLAUDE.md is read at session start and defines the canonical 7-step loop with all tool names, permission handling, and git contract | VERIFIED | File exists; all 7 tool names present; "Canonical Loop" section with numbered steps 1-7; emergency-only note for opencode_approve_permission; once/always/reject enum documented; git checkout -- . present; OPENCODE_URL and PREFECT_TIMEOUT_MS referenced; cross-reference to examples/test-task.md |
| 5 | README.md provides a fresh-clone setup path ending with `/mcp` showing prefect connected | VERIFIED | File exists; npm install and npm run build present; "build/ is gitignored" explanation; opencode serve --port 4096 with port warning; --scope project warning; global/health check; cross-references to CLAUDE.md and examples/test-task.md; Prerequisites and Troubleshooting sections; 12 lines matching tool name grep (exceeds requirement of >= 7) |
| 6 | Following examples/test-task.md results in examples/hello.ts being created and visible in opencode_get_diff | NEEDS HUMAN | The document correctly specifies the loop; actual execution requires live OpenCode + model inference |

**Score:** 4/4 automated truths verified (2 additional truths require human testing)

### Deferred Items

None.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `.mcp.json` | Project-scoped MCP registration for prefect server | VERIFIED | Valid JSON; type=stdio; command=node; args=["build/index.js"]; env={}; single key "prefect"; no absolute paths |
| `examples/test-task.md` | End-to-end validation prompt and loop instructions | VERIFIED | All 13 acceptance criteria pass: create_session, run, get_diff, hello.ts reference, greet, console.log, port 4096, npm run build, global/health, git commit, 120s timeout, Success Assertions, Failure Modes |
| `CLAUDE.md` | Canonical loop instructions for Claude Code | VERIFIED | All 16 acceptance criteria pass: all 7 tools, Canonical Loop section, once/always/reject, emergency-only, git checkout, OPENCODE_URL, PREFECT_TIMEOUT_MS, examples/test-task.md cross-ref |
| `README.md` | Human setup guide for fresh clone | VERIFIED | All 13 acceptance criteria pass: npm install, npm run build, gitignored explanation, opencode serve --port 4096, global/health, .mcp.json, --scope project, CLAUDE.md and examples/test-task.md refs, OPENCODE_URL, PREFECT_TIMEOUT_MS, Prerequisites section, Troubleshooting section, >= 7 tool name lines (actual: 12) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `.mcp.json` | `build/index.js` | stdio command/args | WIRED | `"args": ["build/index.js"]` present; pattern match confirmed |
| `examples/test-task.md` | `examples/hello.ts` | prompt instruction | WIRED | Multiple references to examples/hello.ts in prompt text, step 3, step 4, success assertions |
| `examples/test-task.md` | `opencode_get_diff` | loop step 3 | WIRED | Step 3 explicitly calls opencode_get_diff with SESSION_ID |
| `CLAUDE.md` | 7 prefect tools in src/index.ts | tool reference table | WIRED | All 7 tool names appear in both the Canonical Loop section and the Tool Reference table |
| `README.md` | `.mcp.json` | setup step 2 | WIRED | Multiple references including `cat .mcp.json`, recreation command with --scope project |
| `README.md` | `examples/test-task.md` | step 6 + troubleshooting | WIRED | Step 6 directs user to follow examples/test-task.md; troubleshooting row references it |
| `README.md` | OpenCode health endpoint | health-check verification | WIRED | `curl http://localhost:4096/global/health` present in step 4 and troubleshooting table |

### Data-Flow Trace (Level 4)

Not applicable. All phase 2 deliverables are configuration files and documentation — no components rendering dynamic data from a data source.

### Behavioral Spot-Checks

Step 7b: Partially applicable — can verify structural correctness of config and docs, but cannot verify the MCP tool discovery or OpenCode loop without running services.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| .mcp.json is valid JSON with correct structure | `node -e "JSON.parse(...)"` + field checks | ok | PASS |
| .mcp.json contains no absolute paths | `grep -E '"/(home\|mnt\|usr\|opt)' .mcp.json` | exit 1 (no matches) | PASS |
| .mcp.json has only one server key ("prefect") | `node -e "Object.keys(j.mcpServers)"` | 1 key: "prefect" | PASS |
| examples/test-task.md acceptance criteria | 13 grep checks | all pass | PASS |
| CLAUDE.md acceptance criteria | 16 grep checks | all pass | PASS |
| README.md acceptance criteria | 13 grep checks | all pass | PASS |
| Commits for all 4 deliverables exist in git history | `git log --oneline` | 566e83b (.mcp.json), 5bc62a1 (test-task.md), 12be02d (CLAUDE.md), 3cdf656 (README.md) | PASS |
| Fresh Claude Code session shows prefect in /mcp | requires interactive session | — | SKIP (human needed) |
| Full create->run->diff->commit loop completes | requires live OpenCode + model | — | SKIP (human needed) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| WIRE-01 | 02-01-PLAN.md | Project-scoped Claude Code MCP registration | SATISFIED | `.mcp.json` contains valid stdio registration; RESEARCH.md explicitly documents that `.mcp.json` is the correct mechanism (not `.claude/settings.json` as written in REQUIREMENTS.md — that text predated research); implementation verified live per RESEARCH.md |
| WIRE-02 | 02-02-PLAN.md | CLAUDE.md documents the review/correct loop | SATISFIED | CLAUDE.md exists with 7-step canonical loop, all 7 tool names, permission handling, git contract |
| WIRE-03 | 02-02-PLAN.md | README.md covers full setup | SATISFIED | README.md exists with 6-step setup, all 3 pitfall warnings (--scope project, npm run build/gitignored, --port 4096), env var table, troubleshooting |
| WIRE-04 | 02-01-PLAN.md | examples/test-task.md validation task | SATISFIED | examples/test-task.md exists with verbatim prompt, 6-step loop, success assertions, failure-mode table |

**Note on WIRE-01 file path:** REQUIREMENTS.md text says `.claude/settings.json`; implementation uses `.mcp.json`. The RESEARCH.md document (committed at afc4b2f) explicitly establishes that `.mcp.json` is the correct Claude Code project-scope registration file, superseding the requirements text. The intent — "registers the MCP server as a Node.js stdio subprocess so Claude Code discovers the tools automatically" — is fully satisfied by `.mcp.json`. The REQUIREMENTS.md traceability table still shows all WIRE-* as "Pending" (status column was never updated after phase completion — documentation gap only, not a functional gap).

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `CLAUDE.md` | 42 | Contains `allow_always` and `allow/deny` | Info | FALSE POSITIVE — these appear in a negative example: "NOT `allow`/`deny`/`allow_always` — those are wrong despite some old docs". This is correct documentation of what NOT to use. |
| `README.md` | 90 | "placeholder is required" | Info | FALSE POSITIVE — describes an OpenCode auth file placeholder (`{"vllm": "dummy"}`), not a code stub. This is setup documentation for a local model that doesn't need real credentials. |

No blockers found. No implementation stubs. No hardcoded empty values in rendered paths.

**Known issue from code review (02-REVIEW.md):**
- WR-01: README.md line 93-94: `mkdir -p ~/.config/opencode` then writes to `~/.local/share/opencode/auth.json` — mismatched parent directories; `mkdir` creates the wrong directory. This is a Warning from the code review, not a blocker for phase goal achievement (it affects optional auth file setup for local models, not the core MCP wiring).
- WR-02: CLAUDE.md line 38: says "requestId" but the tool parameter is "permissionId" — minor doc error in the emergency-only tool section. Does not affect the primary review/correct loop.

### Human Verification Required

#### 1. MCP Tool Discovery

**Test:** From the project root (after `npm install && npm run build`), open Claude Code with `claude`. Inside the session, run `/mcp`.
**Expected:** `prefect` is listed as connected and all 7 tools are visible: opencode_create_session, opencode_run, opencode_get_diff, opencode_fork, opencode_revert, opencode_abort, opencode_approve_permission.
**Why human:** MCP server auto-discovery from `.mcp.json` requires running Claude Code interactively. The file structure is correct but actual subprocess spawning and tool registration cannot be verified without starting the session.

#### 2. End-to-End Loop Validation

**Test:** With OpenCode running (`opencode serve --port 4096`) and Claude Code connected, follow `examples/test-task.md` steps 1-6.
**Expected:** Step 3 (`opencode_get_diff`) returns a non-empty FileDiff array with at least one entry referencing `examples/hello.ts`. `git log --oneline -1` shows the commit message starting with "test: validate full prefect loop".
**Why human:** Requires live OpenCode instance, actual LLM model inference (Qwen via vllm), and real session state — none of which can be simulated with grep checks.

### Gaps Summary

No automated gaps found. All 4 deliverables exist, are substantive (not stubs), and are correctly wired. All automated acceptance criteria pass. The 2 human verification items are the only remaining items before the phase can be declared fully complete.

The code review (02-REVIEW.md) identified 2 warnings (WR-01: wrong mkdir directory in README auth setup; WR-02: "requestId" vs "permissionId" terminology in CLAUDE.md). These are minor doc accuracy issues that do not block the phase goal. They are tracked in the review report but do not constitute phase gaps.

---

_Verified: 2026-04-26_
_Verifier: Claude (gsd-verifier)_
