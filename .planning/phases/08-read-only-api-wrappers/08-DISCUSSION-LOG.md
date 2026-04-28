# Phase 8: Read-only API Wrappers - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-28
**Phase:** 08-read-only-api-wrappers
**Areas discussed:** Agent identifier field, Providers response shape, Symbol URI format

---

## Agent Identifier Field

| Option | Description | Selected |
|--------|-------------|----------|
| Return full raw Agent array | All SDK Agent fields as-is | |
| Filter to {name, description, mode} | name is the natural identifier | ✓ |
| Remap name→id | Add id field equal to name for spec compliance | |

**User's choice:** Filter to `{name, description, mode}`. Use `name` as the natural identifier — don't remap to `id` because that would be a lie about the schema. Claude Code references agents by name (e.g., `agent: "build"`).

---

## Providers Response Shape

| Option | Description | Selected |
|--------|-------------|----------|
| Return full { all: [...] } wrapper | Includes all model metadata (cost, limits, etc.) | |
| Unwrap to array, models full | Array<Provider> but trim wrapper only | |
| Unwrap + trim models to {id, name} | Just what Claude Code needs: available providers and model names | ✓ |

**User's choice:** Unwrap `data.all` to a plain array. Trim each model entry to `{id, name}` — no need for release_date, cost, limits, capabilities metadata. Claude Code just needs to know what's available.

---

## Symbol URI Format

| Option | Description | Selected |
|--------|-------------|----------|
| Return raw file:// URI | As returned by SDK, e.g. file:///home/user/project/src/index.ts | |
| Strip file:// prefix (absolute path) | Cleaner but still absolute, not project-relative | |
| Relative path from project root | Most useful for Claude Code file references | ✓ |

**User's choice:** Strip `file://` prefix and convert to relative path from project root (using `resolveDirectory()`). Absolute `file:///home/larry/repos/...` URIs add no value and hurt readability. Fallback to absolute path when no project root is known (don't inject `process.cwd()`).

---

## Claude's Discretion

- Exact Zod param name for `opencode_find_symbol`'s search string (`query` vs `symbolQuery`)
- Whether to include `kind` (LSP SymbolKind number) in symbol response

## Deferred Ideas

None.
