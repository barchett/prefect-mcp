# Milestones

## v2.0 — Session Management + Run Options + Infrastructure

**Shipped:** 2026-04-27
**Phases:** 3–4 | **Plans:** 6 | **Commits:** 69
**Timeline:** 1 day (2026-04-26 → 2026-04-27)
**Scope:** 1,221 LOC TypeScript (up from 201), 64 files changed

### Delivered

Prefect grew from 7 tools to 18 — adding 9 session lifecycle tools (list, get, status, messages, message, delete, rename, children, unrevert), richer `opencode_run` options (model/agent/system overrides), `opencode_prompt_async` fire-and-forget, AbortController-based timeout replacing `Promise.race`, Zod-validated structured response surfaces (PartSchema for 12 Part types, `patch` field on diffs), `prefect init` CLI, and `opencode_session_command` for slash commands.

### Key Accomplishments

1. 5 read-only session inspection tools added (list, get, status, messages, message) — src/index.ts grew from 201 to 321 LOC with 12 total tools
2. 4 mutating session tools added (delete, rename, children, unrevert) — 16 total tools, universal try/catch + `{ data, error }` handler pattern established
3. Zod `discriminatedUnion` schemas for all 12 OpenCode Part types verified directly from `@opencode-ai/sdk` types — discriminator bug class prevented
4. `opencode_run` rewritten with AbortController timeout, model/agent/system body fields, structured `{ info, parts }` response; `opencode_prompt_async` (true fire-and-forget, 204) added as separate tool
5. `patch` field added to `opencode_get_diff` via `diff` npm package; `opencode_session_command` registered for slash command execution inside sessions
6. `prefect init` CLI with four-case merge-not-overwrite semantics and `fileURLToPath(import.meta.url)` ESM-safe absolute path resolution

### Known Deferred Items at Close: 7

See STATE.md Deferred Items — all are stale audit entries or human-verification items requiring a live OpenCode stack. All live tests passed per UAT files. Documentation gap: REQUIREMENTS.md SESSION-01..09 checkboxes were not updated during execution (all implemented and validated in Phase 3).

### Archive

- `.planning/milestones/v2.0-ROADMAP.md`
- `.planning/milestones/v2.0-REQUIREMENTS.md`

---

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
