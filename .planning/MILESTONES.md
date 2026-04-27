# Milestones

## v1.0 — MVP

**Shipped:** 2026-04-26
**Phases:** 1–2 | **Plans:** 5 | **Commits:** 46
**Timeline:** 2 days (2026-04-25 → 2026-04-26)
**Scope:** 201 LOC TypeScript, 36 files changed

### Delivered

TypeScript MCP server exposing OpenCode's HTTP API as 7 Claude Code tools — enabling Claude Code to delegate file edits to a local model (Qwen via OpenCode), review diffs, run tests, and correct the result without leaving the Claude Code workflow.

### Key Accomplishments

1. Node16 ESM TypeScript project scaffolded with 4 pinned dependencies (`@modelcontextprotocol/sdk`, `@opencode-ai/sdk`, `zod`, `typescript`); actual SDK method names confirmed via type inspection
2. MCP server skeleton with `StdioServerTransport`, `OPENCODE_URL` env var (default `http://localhost:4096`), and `PREFECT_TIMEOUT_MS` timeout control
3. All 7 OpenCode tools registered with API-correct schemas: `opencode_create_session`, `opencode_run`, `opencode_get_diff`, `opencode_approve_permission`, `opencode_fork`, `opencode_revert`, `opencode_abort`
4. Project-scoped `.mcp.json` — Claude Code auto-discovers tools without `claude mcp add` on every clone
5. `CLAUDE.md` canonical 7-step review/correct loop + `README.md` fresh-clone setup guide (all 3 pitfall warnings inline)

### Known Deferred Items at Close: 3

See STATE.md Deferred Items — all are human-verification items requiring a live OpenCode stack (not automated gaps).

### Archive

- `.planning/milestones/v1.0-ROADMAP.md`
- `.planning/milestones/v1.0-REQUIREMENTS.md`
