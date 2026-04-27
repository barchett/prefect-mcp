---
phase: 02-wiring-validation
reviewed: 2026-04-26T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - .mcp.json
  - CLAUDE.md
  - README.md
  - examples/test-task.md
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 02: Code Review Report

**Reviewed:** 2026-04-26
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Four files reviewed: `.mcp.json` (MCP server registration), `CLAUDE.md` (operator instructions for Claude Code), `README.md` (setup guide), and `examples/test-task.md` (end-to-end validation procedure).

The source code in `src/index.ts` was read as cross-reference context (it is not in the review scope but is directly referenced by all four files). No security vulnerabilities found. Two warnings relate to a broken shell command in README setup and a stale permission-response documentation note. Two info items flag a dead `"env": {}` field and a redundant step label.

---

## Warnings

### WR-01: `mkdir -p` creates wrong directory — auth file write will silently fail

**File:** `README.md:93-94`

**Issue:** The setup instructions create `~/.config/opencode` but then write the auth file to `~/.local/share/opencode/auth.json`. Those are different parent directories. If `~/.local/share/opencode/` does not already exist on the user's machine, the `echo` redirect silently creates a file in a non-existent directory — on most shells this produces "No such file or directory" and exits non-zero, but the user may miss it because there is no error check. The OpenCode process then fails to start (or starts but cannot authenticate) with no obvious cause.

```bash
# Current (broken if ~/.local/share/opencode/ doesn't exist):
mkdir -p ~/.config/opencode
echo '{"vllm": "dummy"}' > ~/.local/share/opencode/auth.json

# Fix: create the correct parent directory before writing the file:
mkdir -p ~/.local/share/opencode
echo '{"vllm": "dummy"}' > ~/.local/share/opencode/auth.json
```

### WR-02: CLAUDE.md permission tool docs say `requestId` but the tool parameter is `permissionId`

**File:** `CLAUDE.md:38-39`

**Issue:** The "Permission Handling" section says "you'd see a `requestId` in the run output" as the identifier to pass. The actual tool signature (line 54 of CLAUDE.md, confirmed in `src/index.ts:116-118`) uses `permissionId` as the parameter name. Calling the tool with the key named `requestId` will fail Zod validation — the schema only accepts `permissionId`. A user following the prose description and using `requestId` will get a schema validation error.

```
# Current text (line 38):
"you'd see a requestId in the run output"

# Fix: use the actual parameter name:
"you'd see a permissionId in the run output (pass it as the permissionId argument to opencode_approve_permission)"
```

---

## Info

### IN-01: `"env": {}` in `.mcp.json` is a no-op that may mislead editors

**File:** `.mcp.json:9`

**Issue:** The empty `env` object is functionally harmless — Claude Code merges it with the inherited environment, which changes nothing. However, README.md (lines 147-153) specifically directs users to "edit the `env` field of `.mcp.json`" to set `OPENCODE_URL` or `PREFECT_TIMEOUT_MS`. A user who opens the file and sees `"env": {}` understands where to add keys. This is fine, but adding a comment (JSON does not support comments) or a placeholder value like `"PREFECT_TIMEOUT_MS": "120000"` (showing the default) would make the intent explicit and reduce setup errors.

No code change required; consider adding a commented-out example in README's code block for `.mcp.json` to show what a populated `env` looks like.

### IN-02: Step 7 in CLAUDE.md canonical loop is not a numbered step

**File:** `CLAUDE.md:32`

**Issue:** The canonical loop is numbered 1–6. Step 7 ("ABORT IF STUCK") appears as a separate numbered item but describes an out-of-band emergency action, not a sequential step in the loop. This is a minor documentation clarity issue — a reader counting steps will reach "7" and wonder why there are more steps after "Done" at step 6.

```
# Fix: Demote step 7 to a callout block, e.g.:

> **Emergency: ABORT IF STUCK.** If `opencode_run` is taking too long...
```

---

_Reviewed: 2026-04-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
