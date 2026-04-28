# Phase 7: Composite Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 07-composite-tools
**Areas discussed:** Handler extraction location, opencode_await result shape, opencode_inspect changedFiles, opencode_delegate session lifecycle

---

## Handler Extraction Location

| Option | Description | Selected |
|--------|-------------|----------|
| New `src/handlers.ts` | New module, consistent with parts.ts/auth.ts/autostart.ts extraction precedent | ✓ |
| Inline in `src/index.ts` | Named functions inside the existing file, no new module | |

**User's choice:** New `src/handlers.ts`
**Notes:** "Index.ts is already 600 lines with three extracted module precedents — the pattern is established. Keep it consistent."

---

## opencode_await Result Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Reconstruct `{info, parts}` via `session.messages()` | Same shape as opencode_run returns — last assistant message | ✓ |
| Return `{result: null, diff}` | Skip result entirely, just provide diff | |
| Different shape from opencode_run | Return raw messages without restructuring | |

**User's choice:** Use `session.messages()` to get the last assistant message and rebuild `{info, parts}`
**Notes:** "Same shape as opencode_run returns — Claude Code already knows how to navigate it. Consistency matters more than elegance here."

---

## opencode_inspect changedFiles Format

| Option | Description | Selected |
|--------|-------------|----------|
| `{file, additions, deletions}[]` | Richer than paths-only, no patch content — compact progress signal | ✓ |
| `string[]` paths only | Most compact | |
| Full `FileDiff[]` with patch | Same as opencode_get_diff — defeats "compact" purpose | |

**User's choice:** `{file, additions, deletions}[]` — no patch content
**Notes:** "It's a progress snapshot, not a diff review. Full FileDiff[] with patch content is what opencode_get_diff is for. Keep opencode_inspect compact — it's called mid-loop to answer 'how much has changed?' not 'what exactly changed?'"

---

## opencode_delegate Session Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Keep alive | Session persists — caller can inspect, fork, or recover afterward | ✓ |
| Auto-delete | Ephemeral — cleaned up automatically after delegate completes | |

**User's choice:** Keep alive
**Notes:** "Auto-delete is irreversible and removes Claude Code's ability to inspect, fork, or recover from a bad result. The user can always call opencode_session_delete explicitly. Never make irreversible decisions automatically when the cost of keeping the session is just a few KB of storage."

---

## Claude's Discretion

- Exact function signatures for extracted handlers in `src/handlers.ts`
- Whether to apply `PartSchema` validation in `opencode_await`'s reconstructed result
- Error handling shape for `opencode_await` timeout (whether `sessionId` is in the error payload)
- Whether the `client` instance is exported from `src/index.ts` or passed as a parameter to handler functions
- Composite tool registrations stay in `src/index.ts`; only handler functions move to `src/handlers.ts`

## Deferred Ideas

None.
