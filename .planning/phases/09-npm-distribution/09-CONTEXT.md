# Phase 9: npm Distribution - Context

**Gathered:** 2026-04-29
**Status:** Ready for planning

<domain>
## Phase Boundary

Rename all `opencode_*` tool names to `prefect_*` and all `OPENCODE_*` env vars to `PREFECT_*` across the codebase, update `package.json` for npm publishing (`prefect-mcp`), implement global install detection in `prefect init`, and update all documentation (CLAUDE.md, README.md, examples/).

Requirements in scope: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06, DIST-07, DIST-08, DIST-09, DIST-10, DIST-11, DIST-12

</domain>

<decisions>
## Implementation Decisions

### Tool Rename (DIST-07, DIST-08)
- **D-01:** All `opencode_*` tool names renamed to `prefect_*` across every `*.ts` and `*.md` file. (~122 occurrences in `src/`, test files, README, CLAUDE.md, examples/).
- **D-02:** Plan 1 (Wave 1) ends with `npm test` passing — no docs changes until the code rename is verified clean.
- **D-03:** Test files (`src/auth.test.ts`, `src/autostart.test.ts`, `src/cli.test.ts`, etc.) should use the new canonical env var names after migration, not the deprecated fallback names.

### Env Var Rename — Soft Migration (DIST-12)
- **D-04:** **Soft migration**: read both old and new env var names; prefer new. This avoids silently breaking existing `.mcp.json` and `CLAUDE.md` configs.
- **D-05:** On detecting the old name, emit a deprecation warning to stderr: `[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL` (and similarly for the other renamed vars). One-time warning per read site (not per call).
- **D-06:** Old names scheduled for removal in v4.0 only — not in this phase.
- **D-07:** Exact rename mapping (DIST-12):
  - `OPENCODE_URL` → `PREFECT_SERVER_URL`
  - `OPENCODE_SERVER_PASSWORD` → `PREFECT_SERVER_PASSWORD`
  - `OPENCODE_SERVER_USERNAME` → `PREFECT_SERVER_USERNAME`
  - `OPENCODE_DEFAULT_PROJECT` → `PREFECT_DEFAULT_PROJECT`
  - `PREFECT_TIMEOUT_MS` — **unchanged** (already correct prefix)
  - `PREFECT_AUTOSTART_TIMEOUT_MS` — **unchanged** (already correct prefix)
- **D-08:** Soft migration applies to: `src/index.ts` (BASE_URL, TIMEOUT_MS reads), `src/config.ts` (`resolveDirectory` reads OPENCODE_DEFAULT_PROJECT), `src/auth.ts` (`OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME`), `src/autostart.ts` (`OPENCODE_URL`).

### Global Install Detection (DIST-05)
- **D-09:** Goal: `prefect init` writes `"command": "prefect-mcp"` (PATH-relative bin) when globally installed; writes `"command": "node", "args": ["/absolute/path/build/index.js"]` (current behavior) when locally installed.
- **D-10:** **Research required** — the package uses `"type": "module"` (ESM), so `require.resolve()` is unavailable. The researcher should find the most reliable ESM idiom for detecting global vs local install at runtime. Candidate approaches: compare `dirname(fileURLToPath(import.meta.url))` against `execSync('npm prefix -g --silent')` output; or check if the resolved path contains `node_modules/prefect-mcp/` segment.
- **D-11:** The planner should pick the most reliable approach from research findings. Fallback: if detection is unreliable, document a `--global` flag that the user passes manually to `prefect init`.

### package.json Publishing Fields (DIST-01/02/03/04)
- **D-12:** `name`: `"prefect-mcp"` — npm package name (bin command stays `prefect`)
- **D-13:** `version`: `"1.0.0"` — milestone number is internal; public API is stable at 1.0.0
- **D-14:** `license`: `"MIT"`
- **D-15:** `files`: `["build/", "README.md"]` (DIST-02)
- **D-16:** `engines`: `{ "node": ">=20" }` (from ROADMAP success criteria; note: REQUIREMENTS.md says >=18 — use >=20 per roadmap)
- **D-17:** `publishConfig`: Claude's discretion — standard `{ "access": "public" }` for unscoped package, or omit if default is sufficient
- **D-18:** `description` field needed (DIST-03) — Claude's discretion on wording; should reflect "TypeScript MCP server that exposes OpenCode as Claude Code tools"

### Plan Structure
- **D-19:** **Two plans** (not one):
  - **Plan 1 — Code rename + package.json**: Rename all `opencode_*` → `prefect_*` tool names, env var soft migration in `src/`, `package.json` publishing fields. Verify `npm test` passes before stopping.
  - **Plan 2 — Docs + publish verification**: Update CLAUDE.md, README.md (both install pathways), `examples/test-task.md`. Run `npm pack --dry-run` to verify DIST-04. Verify DIST-05 (global detection) works end-to-end.

### Claude's Discretion
- Exact implementation of global install detection (pending researcher finding the reliable ESM idiom)
- `publishConfig` content — include `{ "access": "public" }` only if needed; planner decides
- `description` field wording in package.json
- Which env var read sites emit the deprecation warning vs silently fall back (planner judgment)
- Whether to add a `--global` flag as fallback for global install detection if ESM idiom is unreliable

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — DIST-01 through DIST-12 (all Distribution requirements for Phase 9)

### Current Source Files (authoritative — read before writing any rename)
- `src/index.ts` — All tool registrations; `opencode_*` tool names and `OPENCODE_URL`/`BASE_URL`/`TIMEOUT_MS` reads
- `src/config.ts` — `resolveDirectory()` reads `OPENCODE_DEFAULT_PROJECT`
- `src/auth.ts` — `OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME` reads; `buildAuthHeader()`
- `src/autostart.ts` — `OPENCODE_URL` read for non-local detection; `ensureOpencodeRunning()`
- `src/cli.ts` — `prefect init` command; global install detection logic lives here (DIST-05)
- `src/handlers.ts` — Shared handler functions (Phase 7); tool names in descriptions

### Test Files (all need `OPENCODE_*` env var references updated)
- `src/auth.test.ts` — Tests `OPENCODE_SERVER_PASSWORD`, `OPENCODE_SERVER_USERNAME`
- `src/autostart.test.ts` — Tests `OPENCODE_URL`
- `src/cli.test.ts` — Tests `prefect init` behavior

### Documentation (Phase 9 scope)
- `CLAUDE.md` — Canonical loop tool names (`opencode_*` → `prefect_*`), env var table, DIST-09, DIST-11
- `README.md` — Both install pathways (local + global), env var table (DIST-06)
- `examples/test-task.md` — Validation prompt uses `prefect_*` tool names (DIST-10)

### Prior Phase Decisions
- `.planning/phases/05-directory-infrastructure/05-01-PLAN.md` — `resolveDirectory()` ends at `undefined` (not process.cwd()); pattern must be preserved after env var rename

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/config.ts` exports `resolveDirectory()` — the env var rename (`OPENCODE_DEFAULT_PROJECT` → `PREFECT_DEFAULT_PROJECT`) is isolated here with soft-migration fallback
- `src/auth.ts` `buildAuthHeader()` — reads `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME`; both get soft migration
- `src/cli.ts` already uses `__dirname`-relative absolute path for local install; `PREFECT_ENTRY` object is the only thing that changes for global detection

### Established Patterns
- ESM module (`"type": "module"`) — no `require()`, no `require.resolve()`; use `fileURLToPath(import.meta.url)` for `__dirname` equivalent
- `console.error` only (stdout is the JSON-RPC pipe) — deprecation warnings must use `console.error`
- All 22+ tools registered in `src/index.ts` with string literal names — the rename is mechanical but comprehensive

### Integration Points
- `package.json` `"bin"` entry already set: `{ "prefect": "./build/cli.js" }` — bin command name stays `prefect`
- `.mcp.json` server key is `"prefect"` (set by `prefect init`) — not an `opencode_*` name, no rename needed
- `npm run build` (tsc + chmod) must succeed before `npm test`; Wave 1 plan ends with both passing

### Scope Note
- 122 occurrences of `opencode_*`/`OPENCODE_*` in `src/`; 26 in README.md; also in CLAUDE.md, examples/
- The rename is large but mechanical — most occurrences are tool name strings and env var reads

</code_context>

<specifics>
## Specific Ideas

- Deprecation warning pattern (for each renamed env var):
  ```ts
  const val = process.env.PREFECT_SERVER_URL ?? (() => {
    const old = process.env.OPENCODE_URL;
    if (old) console.error('[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL');
    return old;
  })();
  ```
- `prefect init` global detection: research should focus on ESM-compatible approach; most likely: `execSync('npm prefix -g')` comparison against `dirname(fileURLToPath(import.meta.url))`
- `npm pack --dry-run` (DIST-04): run in the Wave 2 plan after `files` field is set; verify output lists only `build/` and `README.md`

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-npm-distribution*
*Context gathered: 2026-04-29*
