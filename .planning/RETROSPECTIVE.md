# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — MVP

**Shipped:** 2026-04-26
**Phases:** 2 | **Plans:** 5

### What Was Built
- Node16 ESM TypeScript MCP server scaffolded from scratch
- 7 OpenCode tools registered with API-correct schemas
- CLAUDE.md canonical loop + README fresh-clone setup guide

### What Worked
- Reading SDK types directly (`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`) to confirm method names and enums before writing code — caught permission enum error before ship
- Keeping each plan small and atomic: 5 plans across 2 phases meant each change was easily reviewable

### What Was Inefficient
- REQUIREMENTS.md had wrong permission enum (`allow/deny/allow_always`) — needed correction mid-implementation

### Patterns Established
- Always verify SDK types from source before writing tool schemas
- Git is the safety net; auto-approve OpenCode permissions

### Key Lessons
1. SDK type inspection is faster and more reliable than docs for confirming API shape
2. `.mcp.json` project-scope means zero manual setup on fresh clones — always use it

---

## Milestone: v2.0 — Session Management + Run Options + Infrastructure

**Shipped:** 2026-04-27
**Phases:** 2 (3–4) | **Plans:** 6

### What Was Built
- 9 session lifecycle tools (list, get, status, messages, message, delete, rename, children, unrevert) — 7 → 16 tools
- opencode_run rewritten with AbortController, model/agent/system overrides, structured PartSchema response
- opencode_prompt_async fire-and-forget tool
- patch field on opencode_get_diff
- opencode_session_command for slash command execution
- prefect init CLI with merge-not-overwrite semantics

### What Worked
- Verifying SURF-02 Part type discriminators directly from SDK types before writing Zod schemas — explicitly prevented the same bug class as the v1.0 permission enum error
- Universal handler pattern (try/catch + `{ data, error }` destructuring) established in Phase 3 Plan 01 and replicated consistently across all remaining session tools
- Splitting Phase 4 into 4 atomic plans: each plan touched a small, well-defined surface — zero merge conflicts, easy to review
- Direct Edit tool used instead of Prefect loop in some executor contexts — pragmatic fallback when opencode_create_session isn't available in the agent environment

### What Was Inefficient
- REQUIREMENTS.md SESSION-01..09 checkboxes never updated during Phase 3 execution — PROJECT.md became the source of truth by default; creates confusion at milestone close
- `gsd-sdk query milestone.complete` CLI failed with "version required for phases archive" — had to archive manually; CLI workflow needs to be more robust

### Patterns Established
- Universal session tool handler: `try/catch` wrapping `client.session.X()` with `{ data, error }` destructuring
- Conditional query spread: `{ ...(field !== undefined ? { field } : {}) }` for optional multi-param queries
- SDK type verification gate before writing any discriminated union or enum schema
- `arguments` → `args` destructure rename when SDK body field is a reserved JS word
- ESM absolute path: `fileURLToPath(import.meta.url)` for CLI path resolution

### Key Lessons
1. The "verify discriminators from SDK types" practice paid off immediately in v2.0 — make it a standing checklist item before any new Zod schema
2. Keep REQUIREMENTS.md checkboxes updated during execution, not just PROJECT.md — the audit tool reads REQUIREMENTS.md and produces false positives when it's stale
3. Splitting a complex phase (9 requirements) into smaller atomic plans (03-01 read-only, 03-02 mutating) is worth the extra planning overhead — each plan was reviewable in minutes

### Cost Observations
- Sessions: ~2 (one per phase)
- Notable: v2.0 delivered 6x the LOC of v1.0 (1,221 vs 201) in 1 day vs 2 days — pattern reuse (handler pattern, Zod schemas) compounded velocity

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 | 2 | 5 | Established baseline: SDK type inspection, .mcp.json wiring |
| v2.0 | 2 | 6 | Universal handler pattern, discriminator verification gate, AbortController upgrade |

### Cumulative Quality

| Milestone | Tools | LOC (TypeScript) | Tests Added |
|-----------|-------|-----------------|-------------|
| v1.0 | 7 | 201 | 0 (UAT only) |
| v2.0 | 18 | 1,221 | Node built-in test runner (parts schemas + CLI integration) |

### Top Lessons (Verified Across Milestones)

1. Read SDK types from source before writing schemas — caught v1.0 enum bug and v2.0 discriminator risk before they shipped
2. Keep requirements checkboxes current during execution — stale REQUIREMENTS.md creates false audit positives at milestone close
