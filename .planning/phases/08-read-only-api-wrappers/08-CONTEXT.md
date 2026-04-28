# Phase 8: Read-only API Wrappers - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Add three read-only MCP tools wrapping non-session OpenCode API endpoints: `opencode_list_agents` (GET /agent), `opencode_list_providers` (GET /provider), `opencode_find_symbol` (GET /find/symbol).

Requirements in scope: API-01, API-02, API-03

</domain>

<decisions>
## Implementation Decisions

### opencode_list_agents (API-01)

- **D-01:** Return a filtered response: `Array<{ name: string, description?: string, mode: string }>`. Do NOT remap `name` to an `id` field — that would be a lie about the schema. Claude Code references agents by name (e.g., `agent: "build"`), so `name` is the natural identifier.
- **D-02:** SDK call: `client.app.agents({ query: dir ? { directory: dir } : undefined })`. Response is `Array<Agent>` — map each to `{ name, description, mode }` before returning.

### opencode_list_providers (API-02)

- **D-03:** Unwrap `data.all` and return just the array. The `{ all: [...] }` wrapper is UI-centric noise; Claude Code just needs to know what providers are available.
- **D-04:** Trim models: include models inline but reduce each model entry to `{ id: string, name: string }` only. Full model metadata (cost, limits, capabilities, release_date) is not needed for the use case of knowing what's available.
- **D-05:** SDK call: `client.provider.list({ query: dir ? { directory: dir } : undefined })`. Response is `{ all: Array<{id, name, models: {...}}> }` — map to `Array<{ id, name, models: Array<{ id, name }> }>`.

### opencode_find_symbol (API-03)

- **D-06:** Strip `file://` prefix from `location.uri` and convert to a path relative to the project root (from `resolveDirectory()`). Project-root-relative paths are what Claude Code would use to open or reference a file. Raw `file:///home/larry/repos/...` URIs add no value and hurt readability.
- **D-07:** Fallback when no project root is known (no `directory` param and no `OPENCODE_DEFAULT_PROJECT`): strip `file://` prefix and return the absolute path. Do NOT use `process.cwd()` to manufacture a relative path — per Phase 5 decisions, we don't silently inject process.cwd().
- **D-08:** SDK call: `client.find.symbols({ query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) } })`. Note: the MCP tool param should be named `query` (the search string), matching the SDK's required `query.query` field.

### Code Organization

- **D-09:** All three tools registered in `src/index.ts` alongside existing tools — consistent with Phase 7 decision (tool registrations stay in `src/index.ts`).
- **D-10:** No `src/handlers.ts` extraction needed — these are simple one-shot reads with no shared composition logic (unlike the Phase 7 composites that needed `createSession`, `runPrompt`, `getDiff` shared).

### Claude's Discretion

- Exact naming of the `query` input param for `opencode_find_symbol` (e.g., `query` vs `symbolQuery` in Zod schema) — planner decides based on clarity vs SDK naming alignment.
- Whether to include the `kind` field (LSP SymbolKind number) in the symbol response alongside path and range — planner can include if it adds value without clutter.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SDK Types (authoritative — verify all field names here)
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `Agent` type (fields: name, description?, mode, builtIn, permission, model?); `AppAgentsData` (url: "/agent"); `AppAgentsResponses` (200: Array<Agent>)
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `ProviderListData` (url: "/provider"); `ProviderListResponses` (200: { all: Array<{id, name, env, models: {[key]: {id, name, release_date, ...}}}>})
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `FindSymbolsData` (url: "/find/symbol", query: {directory?, query: string}); `FindSymbolsResponses` (200: Array<Symbol>); `Symbol` type (name, kind, location: {uri, range})
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `client.app.agents()`, `client.provider.list()`, `client.find.symbols()` method signatures

### Requirements
- `.planning/REQUIREMENTS.md` — API-01, API-02, API-03 (all three in scope for Phase 8)

### Existing Implementation
- `src/index.ts` — All 22 existing tool handlers (pattern template); `resolveDirectory` is re-exported from `src/config.ts`
- `src/config.ts` — `resolveDirectory()` helper (imported and re-exported in index.ts)
- `src/fetch.ts` — `fetchWithAuth` — wired into `createOpencodeClient`; all three new tools inherit auth transparently

### Prior Phase Decisions
- `.planning/phases/05-directory-infrastructure/05-01-PLAN.md` — `resolveDirectory()` ends at `undefined` (not process.cwd()); all tools accept optional `directory` param
- `.planning/phases/07-composite-tools/07-CONTEXT.md` — D-16: tool implementations in `src/index.ts`; D-17: `src/handlers.ts` is for shared handler functions only, not tool registration

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `resolveDirectory()` from `src/config.ts` (re-exported in `src/index.ts`) — used in every tool handler, same pattern applies here
- `createOpencodeClient` with `fetchWithAuth` — already wired; `client.app`, `client.provider`, `client.find` are all on the same client instance
- Standard error pattern: `if (error) throw new Error(JSON.stringify(error))`
- Standard return: `{ content: [{ type: 'text', text: JSON.stringify(data) }] }` or mapped variant

### Established Patterns
- `const dir = resolveDirectory(directory);` as first line of handler body (before `try`)
- `query: dir ? { directory: dir } : undefined` — or spread form for multi-param queries
- `console.error` only (stdout is the JSON-RPC pipe)
- Module-scope client: `const client = createOpencodeClient({ baseUrl: BASE_URL, fetch: fetchWithAuth })`

### Integration Points
- `client.app` — the `App` sub-client; accessed as `client.app.agents()`
- `client.provider` — the `Provider` sub-client; accessed as `client.provider.list()`
- `client.find` — the `Find` sub-client; accessed as `client.find.symbols()`
- All three sub-clients are on the existing `client` instance — no new client creation needed

### Note on `opencode_find_symbol` query param
The SDK's `FindSymbolsData.query` has `{ directory?: string, query: string }` — the search string is also named `query`. The Zod schema param name should be clear (consider `query` for SDK alignment, or `symbolQuery` for disambiguation). Either works; planner decides.

</code_context>

<specifics>
## Specific Ideas

- `opencode_list_agents` mapping: `(data ?? []).map(a => ({ name: a.name, description: a.description, mode: a.mode }))`
- `opencode_list_providers` mapping: `(data?.all ?? []).map(p => ({ id: p.id, name: p.name, models: Object.values(p.models).map(m => ({ id: m.id, name: m.name })) }))`
- `opencode_find_symbol` path conversion: strip `file://` prefix from `sym.location.uri`, then make relative using `path.relative(dir, absolutePath)` when `dir` is defined — or return absolute when `dir` is undefined.
- `opencode_find_symbol` query param naming: use `query` in Zod schema (matches SDK field) but pick a descriptive variable name in handler body (e.g., `const { query: symbolQuery, directory } = args`) to avoid shadowing the SDK `query` object.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 08-read-only-api-wrappers*
*Context gathered: 2026-04-28*
