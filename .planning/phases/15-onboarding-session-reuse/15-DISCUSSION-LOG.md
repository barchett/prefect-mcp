# Phase 15: Onboarding + Session Reuse - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 15-onboarding-session-reuse
**Areas discussed:** CLAUDE.md freshness, prefect init prompting style, Env var pre-population, Delegate/dispatch reuse params

---

## CLAUDE.md Freshness

| Option | Description | Selected |
|--------|-------------|----------|
| Auto-generate on add/remove | Write section from servers.json on every prefect add-server and prefect remove-server call | ✓ |
| Static docs | Write once at prefect init; update manually | |

**User's choice:** Auto-generate on every add-server and remove-server call. Static docs drift — guaranteed. CLI already reads servers.json so writing is a few lines. Template: `## Available Workers\n- **{name}** — {model}, {host}:{port}`. If no CLAUDE.md exists, create it; if it exists, find-and-replace only the workers section.

---

## prefect init Prompting Style

| Option | Description | Selected |
|--------|-------------|----------|
| Print guidance + next command | Non-interactive: print clear next-step message with exact prefect add-server command | ✓ |
| Interactive readline | stdin-based prompts for name/host/port/model | |

**User's choice:** Print guidance + next command. Interactive readline breaks in CI, Docker, non-tty. Pattern: print what's needed, show the exact command. `prefect add-server` is already the right UX — init just surfaces it clearly for first-time users.

---

## Env Var Pre-population

| Option | Description | Selected |
|--------|-------------|----------|
| Skip it | No model env var exists; don't invent one | ✓ |
| Detect from PREFECT_SERVER_URL | Extract host:port, show next command with those pre-filled | |
| New env var | Define PREFECT_MODEL or similar | |

**User's choice:** Skip entirely. No model env var exists; inventing one adds complexity for marginal value. The user just ran prefect add-server — they know their model. Don't add env var surface area you'll have to maintain forever just to save one copy-paste.

---

## Delegate/Dispatch Reuse Params

| Option | Description | Selected |
|--------|-------------|----------|
| model/agent/system pass through; directory/title ignored | Per-prompt overrides apply; session-creation params silently ignored | ✓ |
| All non-prompt params ignored | Simplest; nothing passes through except prompt | |

**User's choice:** model/agent/system pass through to run step (they're per-prompt overrides, not session-level). directory is ignored (session already has its directory). title is ignored entirely (session already named). Must document clearly in tool description — callers need to know which params are session-creation-only vs. run-step params.

---

## Claude's Discretion

- Where in CLAUDE.md to insert the `## Available Workers` section
- Whether to use a sentinel comment for reliable section location vs. heading match
- Whether to return diff from delegate when reusing a session (yes — diff reflects the reuse run)

## Deferred Ideas

None.
