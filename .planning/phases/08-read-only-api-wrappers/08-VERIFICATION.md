---
phase: 08-read-only-api-wrappers
verified: 2026-04-28T20:49:09Z
status: human_needed
score: 5/6 must-haves verified
overrides_applied: 0
re_verification: false
human_verification:
  - test: "Call opencode_list_agents from Claude Code and confirm a non-empty array of agents is returned"
    expected: "Array of objects with name, description (optional), and mode fields; tool does not fall back to an error response"
    why_human: "Requires a running OpenCode instance. Cannot verify live API response programmatically without starting the server."
  - test: "Call opencode_list_providers and confirm the models dict is correctly unwrapped to an array"
    expected: "Array of { id, name, models: Array<{ id, name }> } — models is an array, not a dict; no release_date or env fields present"
    why_human: "Requires a running OpenCode instance. Object.values(p.models) behavior depends on live provider response shape."
  - test: "Call opencode_find_symbol with a query string (e.g. 'resolveDirectory') and confirm relative paths are returned when OPENCODE_DEFAULT_PROJECT is set"
    expected: "Array of { name, kind, path, range } where path is relative to the project root (not an absolute file:// URI)"
    why_human: "Requires a running OpenCode instance with workspace indexing active. path.relative() correctness depends on live URI from OpenCode LSP."
---

# Phase 8: Read-only API Wrappers Verification Report

**Phase Goal:** Users can list available agents, configured providers, and search workspace symbols directly from Claude Code MCP tool calls without falling back to raw HTTP.
**Verified:** 2026-04-28T20:49:09Z
**Status:** human_needed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1  | Calling opencode_list_agents returns an array of agents with name, description, mode fields | ✓ VERIFIED | Lines 765-769: `(data ?? []).map((a) => ({ name: a.name, description: a.description, mode: a.mode }))` — exactly three fields, matching SDK Agent type |
| 2  | Calling opencode_list_providers returns an array of providers with id, name, and trimmed models (id+name only) | ✓ VERIFIED | Lines 793-797: `(data?.all ?? []).map((p) => ({ id: p.id, name: p.name, models: Object.values(p.models).map((m) => ({ id: m.id, name: m.name })) }))` — correct unwrap of data.all, Object.values on dict, model trim confirmed |
| 3  | Calling opencode_find_symbol with a query string returns matching symbols with name, kind, path, range | ✓ VERIFIED | Lines 823-831: maps `{ name: sym.name, kind: sym.kind, path: filePath, range: sym.location.range }` — exactly four fields |
| 4  | opencode_find_symbol returns project-root-relative paths when a directory is resolved, absolute paths otherwise | ✓ VERIFIED | Line 824: `sym.location.uri.replace(/^file:\/\//, '')` strips prefix; line 825: `dir ? path.relative(dir, absolutePath) : absolutePath` — conditional per D-06/D-07; `process.cwd()` absent from handler |
| 5  | All three new tools accept an optional directory param routed through resolveDirectory() | ✓ VERIFIED | All three handlers call `resolveDirectory(directory)` at line 759 (agents), 787 (providers), 817 (find_symbol); conditional query `dir ? { directory: dir } : undefined` pattern confirmed in each |
| 6  | npm run build exits 0 with zero TypeScript errors after the three tools are added | ✓ VERIFIED | Build ran: `tsc && chmod 755 build/index.js build/cli.js` — no error output, exit 0 |

**Score:** 6/6 truths verified (automated)

**Note on ROADMAP SC#1 vs implementation:** ROADMAP success criterion #1 states agents return "id, name, and description fields." The SDK `Agent` type (types.gen.d.ts line 1399) has no `id` field — `name` is the identifier. PLAN D-01 explicitly documents this ("do NOT remap name to id") and the implementation correctly returns `{ name, description, mode }`. This is a documentation inaccuracy in REQUIREMENTS.md and ROADMAP that predates the SDK audit. The implementation is correct per the authoritative SDK type and the PLAN's D-01 decision. Not treated as a gap.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `src/index.ts` | Three new tool registrations: opencode_list_agents, opencode_list_providers, opencode_find_symbol | ✓ VERIFIED | All three present at lines 750, 779, 807; total registerTool count = 25 (was 22 pre-Phase 8) |
| `src/index.ts` | `import path from 'node:path'` present exactly once | ✓ VERIFIED | Line 7: `import path from 'node:path'` — count = 1 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `opencode_list_agents` handler | `client.app.agents` | SDK call at line 761 | ✓ WIRED | `client.app.agents({ query: dir ? { directory: dir } : undefined })` |
| `opencode_list_providers` handler | `client.provider.list` | SDK call at line 789 | ✓ WIRED | `client.provider.list({ query: dir ? { directory: dir } : undefined })` |
| `opencode_find_symbol` handler | `client.find.symbols` | SDK call at line 819 | ✓ WIRED | `client.find.symbols({ query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) } })` — required query field present, spread form used |
| `opencode_find_symbol` handler | `node:path.relative` | path.relative at line 825 | ✓ WIRED | `path.relative(dir, absolutePath)` guarded by `dir ? ... : absolutePath` |

### Data-Flow Trace (Level 4)

All three tools are pass-through wrappers — they call SDK methods and project the response fields. No hardcoded static returns, no empty array stubs. The data flows from the SDK call through the field projection map to the MCP response.

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|--------------|--------|-------------------|--------|
| `opencode_list_agents` handler | `data` | `client.app.agents(...)` return | Yes — live SDK call, no static return | ✓ FLOWING |
| `opencode_list_providers` handler | `data` | `client.provider.list(...)` return | Yes — live SDK call, `data?.all` unwrap guards null | ✓ FLOWING |
| `opencode_find_symbol` handler | `data` | `client.find.symbols(...)` return | Yes — live SDK call, `data ?? []` null guard only | ✓ FLOWING |

### Behavioral Spot-Checks

Step 7b: SKIPPED for live API response correctness — requires a running OpenCode instance. Build and structural checks confirm wiring is present. Live behavior routed to human verification.

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Build passes with zero TS errors | `npm run build` | Exit 0, no error lines | ✓ PASS |
| registerTool count = 25 | `grep -c "registerTool" src/index.ts` | 25 | ✓ PASS |
| Three new tools each registered once | grep per tool name | 1 each | ✓ PASS |
| `import path from 'node:path'` present once | grep count | 1 | ✓ PASS |
| client.app.agents call present | grep | line 761 | ✓ PASS |
| client.provider.list call present | grep | line 789 | ✓ PASS |
| client.find.symbols call present | grep | line 819 | ✓ PASS |
| Only one createOpencodeClient call (T-08-05) | grep | line 16 only | ✓ PASS |
| process.cwd() absent from find_symbol block | grep lines 805-838 | no matches | ✓ PASS |
| Excluded fields absent (release_date, env, api, npm, builtIn, permission) | grep | no matches | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|---------|
| API-01 | 08-01-PLAN.md | `opencode_list_agents` — wraps GET /agent, returns list of agents | ✓ SATISFIED | `server.registerTool('opencode_list_agents', ...)` at line 750; `client.app.agents` call at line 761; field projection `{ name, description, mode }` at lines 765-769 |
| API-02 | 08-01-PLAN.md | `opencode_list_providers` — wraps GET /provider, returns providers and models | ✓ SATISFIED | `server.registerTool('opencode_list_providers', ...)` at line 779; `client.provider.list` at line 789; `data?.all` unwrap + model trim at lines 793-797 |
| API-03 | 08-01-PLAN.md | `opencode_find_symbol` — wraps GET /find/symbol, query string, returns symbols with path/location | ✓ SATISFIED | `server.registerTool('opencode_find_symbol', ...)` at line 807; `client.find.symbols` at line 819; URI strip + path.relative at lines 824-825; `{ name, kind, path, range }` output at lines 826-831 |

No orphaned requirements: REQUIREMENTS.md maps API-01, API-02, API-03 to Phase 8 — all three are claimed by 08-01-PLAN.md and verified.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| — | — | — | — | No anti-patterns found in new tool blocks (lines 749-838) |

No `TODO`, `FIXME`, `placeholder`, `return null`, `return []`, or hardcoded empty returns in the three new handlers. Null guards (`data ?? []`, `data?.all ?? []`) are safe initialization patterns, not stubs — they handle the case where the SDK returns undefined on error, which is covered by the `if (error) throw` check above them.

### Human Verification Required

### 1. opencode_list_agents live response

**Test:** With OpenCode running, call `opencode_list_agents` (optionally with `directory` set to this project root)
**Expected:** Returns a JSON array of at least one agent object, each with `name` (string), `mode` ("subagent" | "primary" | "all"), and optionally `description`. No `builtIn`, `permission`, or `model` fields.
**Why human:** Requires a running OpenCode instance. The tool's SDK call, field projection, and error handling are all structurally verified — the live response shape confirms end-to-end correctness.

### 2. opencode_list_providers live response

**Test:** With OpenCode running, call `opencode_list_providers`
**Expected:** Returns a JSON array of provider objects, each with `id` (string), `name` (string), `models` (array of `{ id, name }` — not a dict, not including `release_date` or env metadata). Array must not be empty if at least one provider is configured.
**Why human:** Requires a running OpenCode instance. `Object.values(p.models)` conversion from dict to array needs a live response to confirm the SDK actually returns a dict (not already an array) in the provider payload.

### 3. opencode_find_symbol path relativization

**Test:** With OpenCode running and `OPENCODE_DEFAULT_PROJECT` set to this repo root (or pass `directory` explicitly), call `opencode_find_symbol` with `query: "resolveDirectory"`
**Expected:** Returns matching symbols with `path` values that are relative (e.g., `src/config.ts`) not absolute (e.g., `/mnt/c/.../src/config.ts`) and not `file://` URIs. `range` field is present.
**Why human:** Requires a running OpenCode instance with LSP/workspace indexing. The URI-to-relative-path conversion logic is structurally correct but can only be confirmed end-to-end with live LSP output from OpenCode.

### Gaps Summary

No functional gaps. All six must-have truths are verified at the structural level:
- All three tools are registered, wired to correct SDK methods, and implement the specified field projections.
- The build passes with zero TypeScript errors.
- The `node:path` import is present exactly once.
- No process.cwd() is injected in the find_symbol handler (Phase 5 locked decision honored).
- Auth propagation uses the existing module-scope `client` instance (T-08-05 satisfied).
- All three threat model mitigations (T-08-01, T-08-02, T-08-03) are verifiable in the field projection maps.

The three human verification items are live integration checks that cannot be satisfied programmatically without a running OpenCode server. They are not blockers to code quality — they are end-to-end confirmation that the live API response shapes match the SDK types the plan was written against.

---

_Verified: 2026-04-28T20:49:09Z_
_Verifier: Claude (gsd-verifier)_
