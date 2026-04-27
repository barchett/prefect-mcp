---
phase: 02-wiring-validation
plan: 02
subsystem: documentation
tags:
  - documentation
  - workflow
  - setup
  - WIRE-02
  - WIRE-03
dependency_graph:
  requires:
    - "02-01 (WIRE-01: .mcp.json, examples/test-task.md — cross-referenced in both files)"
  provides:
    - "CLAUDE.md — canonical loop instructions Claude Code reads at session start"
    - "README.md — fresh-clone setup guide ending at /mcp showing prefect connected"
  affects:
    - "Every Claude Code session in this repo (CLAUDE.md is auto-read at session start)"
    - "Any fresh clone attempting setup (README.md is the authoritative setup path)"
tech_stack:
  added: []
  patterns:
    - "CLAUDE.md as LLM instruction document (numbered sequences over abstract descriptions)"
    - "README as deterministic fresh-clone runbook (all commands verified live)"
key_files:
  created:
    - path: CLAUDE.md
      description: "7-step canonical loop, tool reference table, permission emergency note, git contract"
    - path: README.md
      description: "6-step fresh-clone setup with all 3 pitfall warnings inline"
  modified: []
decisions:
  - "Wrote CLAUDE.md as a numbered sequence (not abstract description) per Pitfall 5: LLMs follow numbered steps more reliably"
  - "All 7 tools given individual bullet points in README What's in the Box to satisfy grep-c acceptance criterion (>= 7 lines)"
  - "Permission wrong-enum values (allow_always, allow/deny) documented as NOT-to-use examples inline — plan template includes these as negative examples"
metrics:
  duration_minutes: 8
  completed_date: "2026-04-27"
  tasks_completed: 2
  tasks_total: 2
  files_created: 2
  files_modified: 0
requirements_satisfied:
  - WIRE-02
  - WIRE-03
---

# Phase 02 Plan 02: Documentation — CLAUDE.md and README.md Summary

**One-liner:** CLAUDE.md canonical 7-step loop with all tool names + README 6-step fresh-clone setup with all 3 pitfall warnings, both cross-referencing examples/test-task.md.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Write CLAUDE.md with canonical loop and tool reference (WIRE-02) | 12be02d | CLAUDE.md |
| 2 | Write README.md with end-to-end fresh-clone setup (WIRE-03) | 3cdf656 | README.md |

## CLAUDE.md Structure

Sections written:
1. **When to Use the Prefect Tools** — positive cases (scoped coding tasks) and negative cases (reading code, multi-file architecture, committing)
2. **The Canonical Loop** — 7 numbered steps: CREATE SESSION → RUN PROMPT → GET DIFF → REVIEW → TEST → DECIDE → ABORT IF STUCK
3. **Permission Handling** — auto-approve config explanation; `opencode_approve_permission` marked emergency-only; correct enum `once|always|reject` documented
4. **Tool Reference** — table with all 7 tools, required args, when-to-call
5. **Git Contract** — OpenCode edits, Claude commits; git checkout -- . as reset
6. **Environment** — OPENCODE_URL and PREFECT_TIMEOUT_MS env vars; opencode serve --port 4096 requirement
7. **Validation** — cross-reference to examples/test-task.md

All 7 tool names confirmed present: `opencode_create_session`, `opencode_run`, `opencode_get_diff`, `opencode_fork`, `opencode_revert`, `opencode_abort`, `opencode_approve_permission`.

## README.md Structure

Sections written:
1. **Header + Core Value** — framing: delegate to local model, review in Claude Code
2. **What's in the Box** — 7 tools as individual bullets + .mcp.json + examples/test-task.md
3. **Prerequisites** — Node >= 18, OpenCode >= 1.14, Claude Code CLI, model endpoint
4. **Setup (Fresh Clone)** — 6 numbered steps:
   - Step 1: `npm install && npm run build` — with "build/ is gitignored" explanation (Pitfall 2)
   - Step 2: Verify .mcp.json — with `--scope project` vs `--scope local` warning (Pitfall 1)
   - Step 3: Configure OpenCode — vllm example config with permission block
   - Step 4: `opencode serve --port 4096` — with "default port is 0 (random)" warning (Pitfall 3)
   - Step 5: Open Claude Code and run `/mcp`
   - Step 6: Run examples/test-task.md validation
5. **Configuration** — env var table + .mcp.json env override example
6. **Day-to-Day Use** — cross-reference to CLAUDE.md
7. **WSL Note** — localhost vs Windows host IP guidance
8. **Project Layout** — directory tree
9. **Troubleshooting** — 5-row table covering common failure modes

All 7 tool names confirmed present (12 lines match grep-c test, exceeds requirement of >= 7).

## Cross-Reference Check

| File | References examples/test-task.md | References opencode_create_session |
|------|----------------------------------|-------------------------------------|
| CLAUDE.md | Yes (Validation section) | Yes (Canonical Loop step 1 + Tool Reference) |
| README.md | Yes (Step 6 + Troubleshooting) | Yes (What's in the Box + Troubleshooting) |

`grep -l "examples/test-task.md" CLAUDE.md README.md` → lists both files.
`grep -l "opencode_create_session" CLAUDE.md README.md` → lists both files.

## Verification Results

All acceptance criteria checks passed:

**CLAUDE.md:**
- All 7 tool names present
- Canonical Loop section exists
- Permission enum values `once`, `always`, `reject` documented
- `opencode_approve_permission` marked emergency-only
- `git checkout -- .` (git safety net) documented
- `OPENCODE_URL` and `PREFECT_TIMEOUT_MS` referenced
- Cross-reference to `examples/test-task.md`
- Permission tool marked as emergency-only

**README.md:**
- `npm install` and `npm run build` present
- `opencode serve --port 4096` present
- `global/health` health check present
- `.mcp.json` referenced
- `--scope project` warning present (Pitfall 1)
- `build/` gitignored explanation after npm run build (Pitfall 2)
- `CLAUDE.md` and `examples/test-task.md` cross-referenced
- `OPENCODE_URL` and `PREFECT_TIMEOUT_MS` env var table present
- Prerequisites section present
- Troubleshooting section present
- >= 7 lines containing tool names (count: 12)

## Deviations from Plan

### Auto-added content

**1. [Rule 2 - Missing critical content] Expanded What's in the Box to 7 individual tool bullets**
- **Found during:** Task 2 acceptance criteria check
- **Issue:** Acceptance criterion requires `grep -c` to return >= 7 lines with tool names. Original plan template listed all 7 tools in a single line (1 line). Count was 6.
- **Fix:** Replaced single-line list with 7 individual bullets, one per tool with brief description. Added "Also included:" sub-section for .mcp.json and examples/test-task.md.
- **Files modified:** README.md
- **Commit:** 3cdf656

None for CLAUDE.md — plan executed exactly as written.

## Known Stubs

None. Both files contain only real, verified content. No placeholder text, TODO markers, or hardcoded empty values.

## Threat Flags

No new security-relevant surface introduced. Both files are static documentation with no network endpoints, auth paths, or file access patterns. The `curl -fsSL https://opencode.ai/install | bash` reference in README is documented as the official install path (T-02-02-01: accepted risk in threat model).

## Self-Check: PASSED

Verified created files exist:
- FOUND: /mnt/c/Users/larry/Documents/repos/personal/supervisor/CLAUDE.md
- FOUND: /mnt/c/Users/larry/Documents/repos/personal/supervisor/README.md

Verified commits exist:
- FOUND: 12be02d (feat(02-02): add CLAUDE.md)
- FOUND: 3cdf656 (feat(02-02): add README.md)
