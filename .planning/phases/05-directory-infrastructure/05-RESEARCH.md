# Phase 5: Directory Infrastructure - Research

**Researched:** 2026-04-27
**Domain:** TypeScript refactor — shared helper function + Zod schema extension across 18 MCP tools
**Confidence:** HIGH

---

## Summary

Phase 5 is a focused refactor: add a `resolveDirectory()` helper to `src/index.ts`, add a `directory` Zod schema field to the 7 tools that currently lack it, and update all 18 tool handlers to call `resolveDirectory()` instead of the current inconsistent inline patterns.

The OpenCode SDK already accepts `query?: { directory?: string }` on every endpoint — this is confirmed by reading `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` exhaustively. The SDK-level support is complete; the only work is on the Prefect side.

The two locked design decisions from STATE.md are the entire specification for this phase:
1. Add `directory` param to all 18 tool input schemas uniformly. Only pass to SDK where the endpoint accepts it — document which tools honor it. (All 18 endpoints accept it per SDK types.)
2. `resolveDirectory()` fallback chain ends at `undefined`, NOT `process.cwd()`. Only forward `directory` to OpenCode when explicitly provided via per-tool param or `OPENCODE_DEFAULT_PROJECT` env var.

This is a pure TypeScript edit with no new dependencies, no new files required (helper lives in `src/index.ts`), and the only acceptance gate is `npm run build` passing with zero TypeScript errors.

**Primary recommendation:** Implement `resolveDirectory()` as a three-line module-level function, then do a single-pass edit updating all 18 `registerTool` calls in sequence.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| INFRA-01 | All 18 MCP tools accept an optional `directory` parameter | 7 tools already have it; 11 need it added. All 18 SDK endpoints accept `query.directory`. |
| INFRA-02 | `resolveDirectory()` resolves: per-tool param → `OPENCODE_DEFAULT_PROJECT` → `undefined` | Simple three-line function; no libraries needed. |
| INFRA-03 | `OPENCODE_DEFAULT_PROJECT` read at request time (not startup) | Must call `process.env.OPENCODE_DEFAULT_PROJECT` inside `resolveDirectory()`, not at module scope. |
</phase_requirements>

---

## User Constraints (from STATE.md decisions — no CONTEXT.md present)

### Locked Decisions
- Uniform directory schema on all 18 tools, but only pass to SDK where the endpoint accepts it — document which tools honor it. Consistent tool surface beats inconsistent schema; silent discard is acceptable when clearly documented.
- `resolveDirectory()` ends at `undefined` (NOT `process.cwd()`). Only send directory to OpenCode when explicitly provided via per-tool param or `OPENCODE_DEFAULT_PROJECT`. Sending `process.cwd()` unconditionally would silently override OpenCode's own session-level directory tracking — hard to diagnose bug class.

### Claude's Discretion
- Where to place `resolveDirectory()` in `src/index.ts` (module-level, near top, before `const server = ...`)
- Exact JSDoc wording for `resolveDirectory()`
- Whether to export `resolveDirectory()` for future test use (probably yes — tests for Phase 6 auto-start will need it)

### Deferred Ideas
- None from prior discussions that affect this phase.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| `resolveDirectory()` helper | MCP Server (src/index.ts) | — | Pure Node.js function; no HTTP, no SDK involvement |
| Per-tool `directory` Zod schema | MCP Server input layer | — | Zod schemas are defined inline in `registerTool` calls |
| Forwarding `directory` to OpenCode | MCP Server → OpenCode HTTP API | — | SDK `query` param on every endpoint |
| `OPENCODE_DEFAULT_PROJECT` env read | MCP Server (at request time) | — | Must NOT be read at module init — INFRA-03 |

---

## Standard Stack

No new dependencies needed for this phase.

### Existing Stack (unchanged)
| Library | Version | Purpose |
|---------|---------|---------|
| `zod` | 4.3.6 | Input schema for all 18 tools |
| `@opencode-ai/sdk` | 1.14.25 | HTTP client — all endpoints accept `query.directory` |
| `typescript` | 6.0.3 | Build |
| `@modelcontextprotocol/sdk` | 1.29.0 | `registerTool` / `McpServer` |

**No `npm install` needed for this phase.** [VERIFIED: src package.json + types.gen.d.ts exhaustive review]

---

## Architecture Patterns

### System Architecture Diagram

```
Tool Call (MCP)
      |
      v
[Zod inputSchema] -- validates directory?: string (optional)
      |
      v
[resolveDirectory(directory)]
      |  reads process.env.OPENCODE_DEFAULT_PROJECT at call time
      |
      v
resolved: string | undefined
      |
      +-- defined --> query: { directory: resolved }  --> OpenCode HTTP API
      |
      +-- undefined --> query: undefined               --> OpenCode uses its own cwd
```

### resolveDirectory() Implementation

```typescript
// Source: locked design decision in STATE.md + INFRA-02/INFRA-03
function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}
```

The `?? undefined` tail is redundant but makes the three-tier contract explicit in code. [VERIFIED: TYPE confirmed — `string | undefined` satisfies all SDK `query?: { directory?: string }` call sites]

### Recommended Project Structure (unchanged)
```
src/
├── index.ts    # All 18 tools + resolveDirectory() helper
├── parts.ts    # Part discriminated union schemas (unchanged)
├── cli.ts      # prefect init CLI (unchanged)
```

No new files needed. `resolveDirectory()` goes in `src/index.ts` near the top, after the constants block and before `const server = ...`.

### Pattern: Calling resolveDirectory() in a Tool Handler

**Before (current inconsistent inline pattern):**
```typescript
// Some tools pass directory inline only when explicitly given (already correct):
query: directory ? { directory } : undefined,

// Some tools without directory param at all (needs adding):
async ({ sessionId }) => {  // no directory in scope
```

**After (uniform pattern for ALL 18 tools):**
```typescript
async ({ sessionId, directory }) => {
  const dir = resolveDirectory(directory);
  const { data, error } = await client.session.abort({
    path: { id: sessionId },
    query: dir ? { directory: dir } : undefined,
  });
```

### Anti-Patterns to Avoid

- **Reading env at module scope:** `const DEFAULT_DIR = process.env.OPENCODE_DEFAULT_PROJECT` at the top of the file violates INFRA-03 — changes don't take effect without restart.
- **Defaulting to process.cwd():** The locked decision explicitly forbids this. It would silently override OpenCode's own session-level directory tracking.
- **Skipping `resolveDirectory()` call for tools that "don't need it":** The point is uniformity — every tool calls it, even if the resolved value is usually undefined. Future callers rely on the consistent contract.

---

## Per-Tool Audit

### Current State of All 18 Tools

[VERIFIED: exhaustive grep of src/index.ts — line numbers are from the current file]

| # | Tool Name | Has `directory` param now? | SDK endpoint | SDK accepts `directory`? | Phase 5 action |
|---|-----------|---------------------------|--------------|--------------------------|----------------|
| 1 | `opencode_create_session` | YES (line 23) | `client.session.create` | YES (`SessionCreateData`) | Change inline `directory ?` to `resolveDirectory(directory)` |
| 2 | `opencode_abort` | NO | `client.session.abort` | YES (`SessionAbortData`) | Add param + call `resolveDirectory()` |
| 3 | `opencode_run` | NO | `client.session.prompt` | YES (`SessionPromptData`) | Add param + call `resolveDirectory()` |
| 4 | `opencode_prompt_async` | NO | `client.session.promptAsync` | YES (`SessionPromptAsyncData`) | Add param + call `resolveDirectory()` |
| 5 | `opencode_get_diff` | NO | `client.session.diff` | YES (`SessionDiffData`) | Add param + call `resolveDirectory()` |
| 6 | `opencode_approve_permission` | NO | `client.postSessionIdPermissionsPermissionId` | YES (`PostSessionIdPermissionsPermissionIdData`) | Add param + call `resolveDirectory()` |
| 7 | `opencode_fork` | NO | `client.session.fork` | YES (`SessionForkData`) | Add param + call `resolveDirectory()` |
| 8 | `opencode_revert` | NO | `client.session.revert` | YES (`SessionRevertData`) | Add param + call `resolveDirectory()` |
| 9 | `opencode_session_list` | YES (line 292) | `client.session.list` | YES (`SessionListData`) | Change inline to `resolveDirectory()` |
| 10 | `opencode_session_get` | YES (line 315) | `client.session.get` | YES (`SessionGetData`) | Change inline to `resolveDirectory()` |
| 11 | `opencode_session_status` | YES (line 338) | `client.session.status` | YES (`SessionStatusData`) | Change inline to `resolveDirectory()` |
| 12 | `opencode_session_messages` | YES (line 364) | `client.session.messages` | YES (`SessionMessagesData`) | Change inline to `resolveDirectory()` |
| 13 | `opencode_session_message` | YES (line 389) | `client.session.message` | YES (`SessionMessageData`) | Change inline to `resolveDirectory()` |
| 14 | `opencode_session_delete` | YES (line 413) | `client.session.delete` | YES (`SessionDeleteData`) | Change inline to `resolveDirectory()` |
| 15 | `opencode_session_rename` | YES (line 438) | `client.session.update` | YES (`SessionUpdateData`) | Change inline to `resolveDirectory()` |
| 16 | `opencode_session_children` | YES (line 463) | `client.session.children` | YES (`SessionChildrenData`) | Change inline to `resolveDirectory()` |
| 17 | `opencode_session_unrevert` | YES (line 487) | `client.session.unrevert` | YES (`SessionUnrevertData`) | Change inline to `resolveDirectory()` |
| 18 | `opencode_session_command` | NO | `client.session.command` | YES (`SessionCommandData`) | Add param + call `resolveDirectory()` |

**Summary:**
- 11 tools already have `directory` in their Zod schema
- 7 tools are missing it: `opencode_abort`, `opencode_run`, `opencode_prompt_async`, `opencode_get_diff`, `opencode_approve_permission`, `opencode_fork`, `opencode_revert`, `opencode_session_command`
- ALL 18 SDK endpoints accept `query?: { directory?: string }` — confirmed from `types.gen.d.ts`
- The 11 tools that already have the param pass it inline with `directory ? { directory } : undefined` — all need updating to route through `resolveDirectory()`

### SDK Endpoint Verification Detail

The following `*Data` types from `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` were confirmed to include `query?: { directory?: string }`:
- `SessionCreateData` (line 1808–1832) [VERIFIED]
- `SessionAbortData` (line 2056–2083) [VERIFIED]
- `SessionPromptData` (line 2241–2287) [VERIFIED]
- `SessionPromptAsyncData` (line 2326–2369) [VERIFIED]
- `SessionDiffData` (line 2140–2171) — note: also has `messageID?` in query [VERIFIED]
- `PostSessionIdPermissionsPermissionIdData` (line 2507–2537) [VERIFIED]
- `SessionForkData` (line 2037–2055) [VERIFIED]
- `SessionRevertData` (line 2448–2478) [VERIFIED]
- `SessionListData` (line 1793–1807) [VERIFIED]
- `SessionGetData` (line 1885–1912) [VERIFIED]
- `SessionStatusData` (line 1833–1856) [VERIFIED]
- `SessionMessagesData` (line 2206–2240) — also has `limit?` [VERIFIED]
- `SessionMessageData` (line 2288–2325) [VERIFIED]
- `SessionDeleteData` (line 1857–1884) [VERIFIED]
- `SessionUpdateData` (line 1913–1942) [VERIFIED]
- `SessionChildrenData` (line 1943–1970) [VERIFIED]
- `SessionUnrevertData` (line 2479–2506) [VERIFIED]
- `SessionCommandData` (line 2370–2409) [VERIFIED]

**Finding:** Every single endpoint accepts `directory`. There is no "silent discard" case — passing `directory` to any endpoint is fully supported by the SDK. The planner should document all 18 tools as "honors directory" (not just some).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Fallback chain logic | Custom env-reading middleware | Simple `??` chain in `resolveDirectory()` |
| TypeScript types for `resolveDirectory` | Manual interface | `string \| undefined` — native TS, no extra type needed |

---

## Common Pitfalls

### Pitfall 1: Reading env at module scope (violates INFRA-03)
**What goes wrong:** `const DEFAULT_DIR = process.env.OPENCODE_DEFAULT_PROJECT` at module top. Changing the env var doesn't take effect until server restart.
**Why it happens:** Natural instinct to cache env reads for performance.
**How to avoid:** Read `process.env.OPENCODE_DEFAULT_PROJECT` inside `resolveDirectory()` body only.
**Warning signs:** Tests that change env between calls observe no effect.

### Pitfall 2: Forgetting to update the 11 existing tools
**What goes wrong:** Only the 7 missing tools get updated; the 11 existing tools still use the inline `directory ?` pattern, bypassing `OPENCODE_DEFAULT_PROJECT`.
**Why it happens:** The 11 existing tools "already work" so they look done.
**How to avoid:** Treat INFRA-02/INFRA-03 compliance as requiring ALL 18 tools to call `resolveDirectory()` — not just the 7 new ones.

### Pitfall 3: Passing resolved directory to query when it's undefined
**What goes wrong:** `query: { directory: undefined }` — some SDK clients may serialize this as `?directory=undefined` in the URL.
**Why it happens:** Destructuring `{ directory: dir }` where `dir` is `undefined`.
**How to avoid:** Keep the conditional `dir ? { directory: dir } : undefined` pattern. Never spread an object with undefined values into query.

### Pitfall 4: Adding `directory` to `opencode_run`'s description without mentioning it doesn't affect the session's persistent cwd
**What goes wrong:** Users think passing `directory` to `opencode_run` changes the session's working directory for all future prompts.
**Why it happens:** The `directory` param on prompt endpoints is a routing param (which OpenCode project/instance to target), not a "set working directory for this session" param.
**How to avoid:** Tool description should say "routes to the OpenCode project at this path" — not "sets working directory."

### Pitfall 5: TypeScript strict mode — `string | undefined` vs `string`
**What goes wrong:** `query: dir ? { directory: dir } : undefined` works fine. But if someone writes `query: { directory: dir }` where `dir: string | undefined`, TypeScript strict mode may allow it (undefined is valid for optional fields). The runtime risk is serialization as `?directory=` (empty string) by some HTTP clients.
**Why it happens:** TypeScript won't error on `{ directory?: string }` receiving `undefined`.
**How to avoid:** The ternary `dir ? { directory: dir } : undefined` eliminates the risk entirely and is already the established pattern in the codebase.

---

## Code Examples

### resolveDirectory() — the complete implementation
```typescript
// Source: INFRA-02 + INFRA-03 requirements; no external reference needed
// Place after TIMEOUT_MS constant, before `const server = ...`
function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}
```

### Tool schema addition (for the 7 missing tools)
```typescript
// Source: established Zod pattern in src/index.ts (see all Phase 3 tools)
inputSchema: z.object({
  sessionId: z.string().describe('Session ID'),
  // ... existing fields ...
  directory: z.string().optional().describe(
    'Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'
  ),
}),
```

### Handler update for ALL 18 tools (including existing 11)
```typescript
// Source: established pattern from Phase 3 tools; resolveDirectory() replaces inline ternary
async ({ sessionId, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.session.abort({
      path: { id: sessionId },
      query: dir ? { directory: dir } : undefined,
    });
    // ...
  }
}
```

### opencode_session_messages special case (two query params)
```typescript
// Source: current src/index.ts line 371 — limit must be preserved alongside directory
async ({ sessionId, limit, directory }) => {
  const dir = resolveDirectory(directory);
  const { data, error } = await client.session.messages({
    path: { id: sessionId },
    query: {
      ...(limit !== undefined ? { limit } : {}),
      ...(dir ? { directory: dir } : {}),
    },
  });
```

### opencode_get_diff special case (messageID must be preserved)
```typescript
// Source: current src/index.ts lines 191-200 — messageID is also a query param
async ({ sessionId, messageID, directory }) => {
  const dir = resolveDirectory(directory);
  const { data, error } = await client.session.diff({
    path: { id: sessionId },
    query: {
      ...(messageID ? { messageID } : {}),
      ...(dir ? { directory: dir } : {}),
    },
  });
```

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Inline `directory ? { directory } : undefined` in 11 tools | `resolveDirectory()` call in all 18 | Consistent; OPENCODE_DEFAULT_PROJECT honored everywhere |
| No `directory` in 7 tools | Uniform schema across all 18 | User-facing API surface is consistent |

---

## Open Questions

1. **Should `resolveDirectory()` be exported?**
   - What we know: Phase 6 (auto-start) needs to resolve a directory for `OPENCODE_DEFAULT_PROJECT` as the child process cwd (INFRA-09).
   - What's unclear: Whether a separate `resolveDirectory` export or a new `resolveAutoStartDir()` call is cleaner.
   - Recommendation: Export `resolveDirectory` for testability and reuse in Phase 6. A named export from `src/index.ts` is fine since `src/index.ts` is a module (`"type": "module"` in package.json).

2. **Tool description wording for `directory` on prompt-type tools**
   - What we know: `directory` on `opencode_run`, `opencode_prompt_async`, `opencode_session_command` is a routing param, not a session cwd setter.
   - What's unclear: Exact description text to avoid user confusion.
   - Recommendation: "Routes this call to the OpenCode project at the specified path. Does not change the session's working directory. Falls back to OPENCODE_DEFAULT_PROJECT env var."

---

## Environment Availability

Step 2.6: SKIPPED — this phase is a pure code edit. No external services, tools, CLIs, or databases are required beyond the existing Node.js + TypeScript build stack already confirmed in the working environment.

---

## Validation Architecture

`nyquist_validation` is `false` in `.planning/config.json`. Section omitted per config.

---

## Security Domain

This phase adds no authentication, no new HTTP endpoints, no input that reaches a database or file system, and no cryptographic operations. The `directory` parameter is a string forwarded to an already-trusted local OpenCode instance. No ASVS categories apply uniquely to this phase.

---

## Project Constraints (from CLAUDE.md)

- Use Prefect tools (opencode_create_session / opencode_run loop) for scoped coding tasks; use Read/Grep directly for exploration — this phase is a single-file refactor, appropriate for the Prefect loop.
- OpenCode edits files; Claude Code reviews diff and commits.
- `npm run build` (tsc + chmod) is the test gate — must pass zero errors.
- `npm test` runs the existing test suite — parts.test, cli.test, diff-patch.test, session-command.test. None of these cover the new `resolveDirectory()` logic directly (no nyquist validation required).
- git is the safety net; commit after build passes.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| — | All assumptions in this research were verified by reading SDK types.gen.d.ts and src/index.ts directly | All | — |

**This table is effectively empty** — all factual claims were verified by direct file inspection in this session.

---

## Sources

### Primary (HIGH confidence)
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — exhaustive review of all 18 `*Data` types confirmed `query?: { directory?: string }` on every endpoint [VERIFIED: read in this session]
- `src/index.ts` — current 18-tool implementation; confirmed which 7 are missing directory param and which 11 already have it [VERIFIED: read in this session]
- `.planning/STATE.md` — locked design decisions for resolveDirectory() behavior [VERIFIED: read in this session]
- `.planning/REQUIREMENTS.md` — INFRA-01, INFRA-02, INFRA-03 exact text [VERIFIED: read in this session]
- `package.json` — confirmed no new dependencies needed [VERIFIED: read in this session]
- `.planning/config.json` — confirmed nyquist_validation: false [VERIFIED: read in this session]

### Secondary (MEDIUM confidence)
- None needed — all required information was available in the local codebase.

---

## Metadata

**Confidence breakdown:**
- Per-tool SDK endpoint audit: HIGH — read from authoritative `types.gen.d.ts`
- resolveDirectory() implementation: HIGH — two-line function, requirements fully specify behavior
- Architecture: HIGH — single-file refactor, established patterns in codebase
- Pitfalls: HIGH — derived from TypeScript type system and verified codebase patterns

**Research date:** 2026-04-27
**Valid until:** Until `@opencode-ai/sdk` version changes (stable for 30+ days at current pace)
