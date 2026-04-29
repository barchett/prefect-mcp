# Phase 9: npm Distribution - Research

**Researched:** 2026-04-29
**Domain:** npm publishing, ESM module detection, env var soft migration, tool rename
**Confidence:** HIGH

## Summary

Phase 9 is a rename + distribution phase with two distinct workstreams. The first is a mechanical but comprehensive rename of all `opencode_*` tool names (25 tools) and `OPENCODE_*` env vars (4 vars) across `src/`, tests, and documentation. The second is preparing `package.json` for npm publishing as `prefect-mcp` and implementing global install detection in `prefect init`.

The rename workstream has no technical unknowns — the patterns are clear, the file inventory is complete, and `npm test` is the verification gate. The env var soft migration has two distinct patterns depending on whether reads happen at module init time (index.ts, autostart.ts) or call time (config.ts, auth.ts). Call-time reads require a module-level "warned" flag to avoid warning on every invocation.

The global install detection question (D-10) is resolved: the most reliable ESM idiom is a path-segment check — `dirname(fileURLToPath(import.meta.url)).replace(/\\/g, '/').includes('/node_modules/prefect-mcp/')`. This approach requires no external process calls, works across all version managers (npm, nvm, asdf, volta), and is cross-platform (handles both Windows backslash and Unix forward-slash paths). It is more reliable than `execSync('npm prefix -g')` which can disagree with volta's tool directory structure.

**Primary recommendation:** Implement path-segment global detection, add a second `"prefect-mcp"` bin entry pointing to `build/index.js`, use module-level warned flags for call-time env var reads, and set `files: ["build/", "README.md"]` in package.json.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tool Rename (DIST-07, DIST-08)**
- D-01: All `opencode_*` tool names renamed to `prefect_*` across every `*.ts` and `*.md` file (~122 occurrences in `src/`, test files, README, CLAUDE.md, examples/).
- D-02: Plan 1 (Wave 1) ends with `npm test` passing — no docs changes until the code rename is verified clean.
- D-03: Test files should use the new canonical env var names after migration, not the deprecated fallback names.

**Env Var Rename — Soft Migration (DIST-12)**
- D-04: Soft migration: read both old and new env var names; prefer new.
- D-05: On detecting the old name, emit a deprecation warning to stderr. One-time warning per read site (not per call).
- D-06: Old names scheduled for removal in v4.0 only — not in this phase.
- D-07: Exact rename mapping:
  - `OPENCODE_URL` → `PREFECT_SERVER_URL`
  - `OPENCODE_SERVER_PASSWORD` → `PREFECT_SERVER_PASSWORD`
  - `OPENCODE_SERVER_USERNAME` → `PREFECT_SERVER_USERNAME`
  - `OPENCODE_DEFAULT_PROJECT` → `PREFECT_DEFAULT_PROJECT`
  - `PREFECT_TIMEOUT_MS` — unchanged
  - `PREFECT_AUTOSTART_TIMEOUT_MS` — unchanged
- D-08: Soft migration applies to: `src/index.ts`, `src/config.ts`, `src/auth.ts`, `src/autostart.ts`.

**Global Install Detection (DIST-05)**
- D-09: Goal: `prefect init` writes `"command": "prefect-mcp"` (PATH-relative bin) when globally installed; writes `"command": "node", "args": ["/absolute/path/build/index.js"]` (current behavior) when locally installed.
- D-10: Research required — resolved below.
- D-11: If detection is unreliable, document a `--global` flag fallback.

**package.json Publishing Fields (DIST-01/02/03/04)**
- D-12: `name`: `"prefect-mcp"`
- D-13: `version`: `"1.0.0"`
- D-14: `license`: `"MIT"`
- D-15: `files`: `["build/", "README.md"]`
- D-16: `engines`: `{ "node": ">=20" }`
- D-17: `publishConfig`: Claude's discretion
- D-18: `description` field needed — Claude's discretion on wording

**Plan Structure**
- D-19: Two plans:
  - Plan 1 — Code rename + package.json
  - Plan 2 — Docs + publish verification

### Claude's Discretion
- Exact implementation of global install detection
- `publishConfig` content
- `description` field wording
- Which env var read sites emit the deprecation warning vs silently fall back
- Whether to add a `--global` flag as fallback

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| DIST-01 | Package published as `prefect-mcp` | Name verified available on npm registry (404 = available) [VERIFIED: npm registry] |
| DIST-02 | `files: ["build/", "README.md"]` in package.json | Verified: excludes node_modules/, src/; includes test.js files in build/ (acceptable per requirement) [VERIFIED: codebase] |
| DIST-03 | name, description, license, engines, publishConfig fields | All patterns documented below [CITED: npm docs] |
| DIST-04 | `npm pack --dry-run` verified before first publish | Dry-run behavior confirmed; currently packs everything without files field [VERIFIED: npm pack --dry-run run] |
| DIST-05 | `prefect init` detects global vs local | Path-segment detection approach verified reliable [VERIFIED: codebase + manual testing] |
| DIST-06 | README documents both install pathways | Existing README needs global install section added [VERIFIED: codebase] |
| DIST-07 | All tool names renamed opencode_* → prefect_* | 25 tools in index.ts confirmed, total 85 non-test occurrences in src/ [VERIFIED: grep] |
| DIST-08 | npm test passes after rename | Existing test suite verified; no new tests needed for rename itself [VERIFIED: codebase] |
| DIST-09 | CLAUDE.md uses prefect_* tool names | 17 occurrences to update [VERIFIED: grep] |
| DIST-10 | examples/test-task.md uses prefect_* names | 8 occurrences to update [VERIFIED: grep] |
| DIST-11 | CLAUDE.md instructs explicit directory arg | CLAUDE.md canonical loop needs directory arg instruction added [VERIFIED: codebase] |
| DIST-12 | OPENCODE_* env vars renamed with soft migration | 4 env vars, 2 read patterns (module-init + call-time), soft migration pattern verified [VERIFIED: codebase + runtime test] |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Tool name rename | API / Backend (MCP server) | Documentation | Tool names are string literals registered in src/index.ts; docs follow code |
| Env var soft migration | API / Backend | — | All env reads are in src/ modules; read at server process init or call time |
| Global install detection | CLI (src/cli.ts) | — | prefect init is the CLI entry point; detection only needed there |
| package.json publishing config | Build / Distribution | — | Static manifest change only |
| Documentation updates | Documentation | — | CLAUDE.md, README.md, examples/ are pure doc files |

---

## Standard Stack

No new libraries are introduced in this phase. All changes are to existing code.

### Existing Tools Used
| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| `node:url` (built-in) | Node 20 | `fileURLToPath`, `import.meta.url` | Already used in src/cli.ts |
| `node:path` (built-in) | Node 20 | `dirname`, `resolve` | Already used in src/cli.ts |
| `npm pack` | 10.8.2 | Dry-run verification of published files | Available on this machine |

**Installation:** No new dependencies.

**Version verification:** No new packages; all existing dependencies unchanged. [VERIFIED: npm view on this machine]

---

## Architecture Patterns

### Rename Inventory — Complete File List

**src/ (non-test) — 85 occurrences:**
| File | Occurrences | Type |
|------|-------------|------|
| `src/index.ts` | ~80 | Tool name strings, description strings, OPENCODE_URL read |
| `src/autostart.ts` | 4 | OPENCODE_URL read (module init) |
| `src/auth.ts` | 2 | OPENCODE_SERVER_PASSWORD, OPENCODE_SERVER_USERNAME reads |
| `src/config.ts` | 1 | OPENCODE_DEFAULT_PROJECT read |
| `src/handlers.ts` | 4 | Comment references only |

**src/*.test.ts — 37 occurrences:**
| File | Occurrences | Notes |
|------|-------------|-------|
| `src/auth.test.ts` | 24 | OPENCODE_SERVER_PASSWORD, OPENCODE_SERVER_USERNAME |
| `src/autostart.test.ts` | 10 | OPENCODE_URL, OPENCODE_SERVER_PASSWORD |
| `src/diff-patch.test.ts` | 1 | Comment only |
| `src/session-command.test.ts` | 1 | Comment only |
| `src/cli.test.ts` | 0 | No OPENCODE_ references (already clean) |

**Documentation:**
| File | Occurrences |
|------|-------------|
| README.md | 26 |
| CLAUDE.md | 17 |
| examples/test-task.md | 8 |

### Tool Names to Rename (25 tools)

All 25 `opencode_*` → `prefect_*`:

```
opencode_create_session   → prefect_create_session
opencode_abort            → prefect_abort
opencode_run              → prefect_run
opencode_prompt_async     → prefect_prompt_async
opencode_get_diff         → prefect_get_diff
opencode_approve_permission → prefect_approve_permission
opencode_fork             → prefect_fork
opencode_revert           → prefect_revert
opencode_session_list     → prefect_session_list
opencode_session_get      → prefect_session_get
opencode_session_status   → prefect_session_status
opencode_session_messages → prefect_session_messages
opencode_session_message  → prefect_session_message
opencode_session_delete   → prefect_session_delete
opencode_session_rename   → prefect_session_rename
opencode_session_children → prefect_session_children
opencode_session_unrevert → prefect_session_unrevert
opencode_session_command  → prefect_session_command
opencode_delegate         → prefect_delegate
opencode_dispatch         → prefect_dispatch
opencode_inspect          → prefect_inspect
opencode_await            → prefect_await
opencode_list_agents      → prefect_list_agents
opencode_list_providers   → prefect_list_providers
opencode_find_symbol      → prefect_find_symbol
```
[VERIFIED: grep of src/index.ts]

### System Architecture Diagram

```
Phase 9 — Two Plans

Plan 1 (Code + Config):
  src/*.ts (rename opencode_* → prefect_*)
      ↓
  src/*.ts (add env var soft migration)
      ↓
  package.json (add name/description/license/engines/files/publishConfig/bin)
      ↓
  npm run build → npm test → GATE: tests pass

Plan 2 (Docs + Verification):
  CLAUDE.md, README.md, examples/test-task.md (rename opencode_* → prefect_*)
      ↓
  README.md (add global install section)
      ↓
  src/cli.ts (add global install detection → two-mode PREFECT_ENTRY)
      ↓
  npm pack --dry-run → verify file list
      ↓
  DONE (publish is a manual human step)
```

### Pattern 1: Env Var Soft Migration — Module-Init Read

For env vars read once at module load (`index.ts` BASE_URL, `autostart.ts` BASE_URL):

```typescript
// Source: verified via runtime test on Node 20.20.0
// No warned flag needed — fires once naturally at module load
const BASE_URL =
  process.env.PREFECT_SERVER_URL ??
  (() => {
    const old = process.env.OPENCODE_URL;
    if (old) console.error('[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL');
    return old;
  })() ??
  'http://localhost:4096';
```

[VERIFIED: runtime test confirmed warning fires once, returns correct value]

### Pattern 2: Env Var Soft Migration — Call-Time Read

For env vars read on every tool call (`config.ts` OPENCODE_DEFAULT_PROJECT, `auth.ts` OPENCODE_SERVER_PASSWORD/USERNAME):

```typescript
// Source: verified via runtime test on Node 20.20.0
// Module-level flag ensures warning fires at most once per process lifetime
let warnedDefaultProject = false;

export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return (
    perToolParam ??
    process.env.PREFECT_DEFAULT_PROJECT ??
    (() => {
      const old = process.env.OPENCODE_DEFAULT_PROJECT;
      if (old && !warnedDefaultProject) {
        console.error('[Prefect] OPENCODE_DEFAULT_PROJECT is deprecated, use PREFECT_DEFAULT_PROJECT');
        warnedDefaultProject = true;
      }
      return old;
    })()
  );
}
```

[VERIFIED: runtime test confirmed warning fires once across multiple calls]

### Pattern 3: Global Install Detection — Path Segment

The path-segment approach is the recommended implementation for `src/cli.ts`:

```typescript
// Source: verified via manual testing on Node 20.20.0 across multiple version manager path patterns
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Normalize Windows backslashes for cross-platform comparison
function isGlobalInstall(): boolean {
  return __dirname.replace(/\\/g, '/').includes('/node_modules/prefect-mcp/');
}
```

**Why path-segment over `execSync('npm prefix -g')`:**
- No subprocess spawn (no `execSync` dependency, no failure modes)
- Works correctly with volta (which installs to `~/.volta/tools/image/packages/prefect-mcp/lib/node_modules/prefect-mcp/`) [ASSUMED based on volta's known install path structure]
- Works correctly with nvm (`~/.nvm/versions/node/<ver>/lib/node_modules/prefect-mcp/`)
- Works correctly with asdf (`~/.asdf/installs/nodejs/<ver>/lib/node_modules/prefect-mcp/`)
- Works correctly with standard npm (`~/.npm-global/lib/node_modules/prefect-mcp/`)
- Works on Windows (`C:/Users/user/AppData/Roaming/npm/node_modules/prefect-mcp/`)
- Returns `false` for local dev checkout (no `node_modules/prefect-mcp/` in path)
- Returns `false` for `node /absolute/path/build/index.js` invocation

Node.js resolves symlinks when computing `import.meta.url`, so the resolved path is always the real file path inside `node_modules/`, not the bin symlink path. [VERIFIED: confirmed via npm global bin symlink inspection on this machine]

### Pattern 4: Global vs Local PREFECT_ENTRY in cli.ts

```typescript
// Source: derived from existing src/cli.ts pattern + global detection research
const __dirname = dirname(fileURLToPath(import.meta.url));
const isGlobal = __dirname.replace(/\\/g, '/').includes('/node_modules/prefect-mcp/');

const PREFECT_ENTRY = isGlobal
  ? {
      type: 'stdio' as const,
      command: 'prefect-mcp',
      args: [],
      env: {},
    }
  : {
      type: 'stdio' as const,
      command: 'node',
      args: [resolve(__dirname, 'index.js')],
      env: {},
    };
```

### Pattern 5: package.json Publishing Fields

```json
{
  "name": "prefect-mcp",
  "version": "1.0.0",
  "type": "module",
  "description": "TypeScript MCP server that exposes OpenCode's HTTP API as Claude Code tools",
  "license": "MIT",
  "engines": { "node": ">=20" },
  "files": ["build/", "README.md"],
  "publishConfig": { "access": "public" },
  "bin": {
    "prefect": "./build/cli.js",
    "prefect-mcp": "./build/index.js"
  }
}
```

**Key notes:**
- `name` changes from `"prefect"` to `"prefect-mcp"` [VERIFIED: current package.json has "prefect"]
- Second bin entry `"prefect-mcp": "./build/index.js"` is NEW — enables global install `.mcp.json` to use `"command": "prefect-mcp"` [VERIFIED: codebase analysis]
- `build/index.js` already has `#!/usr/bin/env node` shebang and is chmoded 755 by build script [VERIFIED: codebase]
- `publishConfig: { access: "public" }` is redundant for an unscoped package (npm defaults to public) but conventional and harmless [ASSUMED based on npm documentation knowledge]
- `engines: ">=20"` per ROADMAP.md success criteria — CONTEXT.md D-16 explicitly overrides REQUIREMENTS.md's ">=18" [VERIFIED: ROADMAP.md cross-reference]
- `files: ["build/", "README.md"]` will include compiled test files (`*.test.js`) — this is acceptable per DIST-02's stated goal of excluding `node_modules/` and `src/` [VERIFIED: npm pack --dry-run analysis]

### Anti-Patterns to Avoid

- **`require.resolve()` for global detection**: unavailable in ESM modules (`"type": "module"`). [VERIFIED: ESM does not have require]
- **`execSync('npm prefix -g')` for global detection**: works but adds subprocess spawn, can fail silently, and may disagree with volta's install structure. The path-segment approach is simpler and more reliable.
- **`process.env.npm_config_prefix` for global detection**: only set during npm scripts, not when running a global bin directly.
- **Emitting deprecation warnings to stdout**: stdout is the JSON-RPC pipe. All warnings MUST go to `console.error`. [VERIFIED: existing codebase convention]
- **Warning on every call for call-time env reads**: the `warnedDefaultProject` flag pattern is required for `config.ts` and `auth.ts`; without it, every tool call would print the deprecation warning.
- **Renaming `PREFECT_TIMEOUT_MS` or `PREFECT_AUTOSTART_TIMEOUT_MS`**: these already have the correct prefix and are explicitly out of scope per D-07. [VERIFIED: CONTEXT.md]

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting global install in CommonJS | Custom resolver | N/A — this is ESM | `require.resolve()` unavailable |
| Counting rename occurrences | Manual review | `grep -rn` | Reliable, complete |
| Verifying publish contents | Manual file listing | `npm pack --dry-run` | Standard npm workflow |
| Cross-platform path comparison | Custom OS detection | `.replace(/\\/g, '/')` normalization | Handles backslash/forward-slash transparently |

**Key insight:** Global install detection has no standard npm API in ESM. The path-segment approach is idiomatic for ESM packages that need to distinguish install contexts.

---

## Runtime State Inventory

> This section applies because Phase 9 renames env vars (OPENCODE_* → PREFECT_*).

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None — no database stores env var names as records | None |
| Live service config | `.mcp.json` in project root has `"command": "node", "args": ["build/index.js"]` — no env vars embedded | Code edit (prefect init rewrites on demand) |
| OS-registered state | None — no task scheduler or systemd units use OPENCODE_* names | None |
| Secrets/env vars | User shell configs (`.bashrc`, `.zshrc`) may have `OPENCODE_URL`, `OPENCODE_SERVER_PASSWORD`, etc. — these are NOT in git | Soft migration handles transparently; users notified by stderr warning |
| Build artifacts | `build/*.js` compiled from current `src/*.ts` — will be stale after rename until rebuilt | `npm run build` in Wave 1 of Plan 1 |

**Critical note on soft migration scope:** The deprecation warnings exist specifically because user shell profiles and existing `.mcp.json` env blocks (with `OPENCODE_URL` etc.) cannot be automatically updated. Users will see stderr warnings on first use, then can update their configs. The old names remain functional until v4.0.

---

## Common Pitfalls

### Pitfall 1: Renaming in description strings but missing tool name literals
**What goes wrong:** `sed`/replace hits description prose ("Use opencode_run to...") but misses the actual tool name string literal (`'opencode_run'`) or vice versa.
**Why it happens:** Occurrences of `opencode_` appear in four contexts: (1) tool name literals, (2) inputSchema `.describe()` strings, (3) description fields, (4) error message strings. Mechanical replace handles all four identically.
**How to avoid:** Do a blanket `opencode_` → `prefect_` replacement then verify with grep that zero occurrences remain.
**Warning signs:** `grep -rn "opencode_" src/` returns any results after the rename.

### Pitfall 2: OPENCODE_* in test env vars vs source env vars
**What goes wrong:** Test file is updated to use `PREFECT_SERVER_PASSWORD` but the source file still reads `OPENCODE_SERVER_PASSWORD` (or vice versa), causing tests to pass with the old name but soft migration to silently return `undefined` for the new name.
**Why it happens:** Auth.test.ts and autostart.test.ts test internal functions that read env vars directly — the test env var name must match what the source function reads.
**How to avoid:** Update test env var names and source env var reads together in the same wave. After rename, tests use new names (D-03).
**Warning signs:** Tests pass but `buildAuthHeader()` doesn't inject headers when `PREFECT_SERVER_PASSWORD` is set.

### Pitfall 3: autostart.ts module-init OPENCODE_URL test
**What goes wrong:** `autostart.test.ts` line 31 uses `process.env.OPENCODE_URL` to test the remote-host guard. After rename, `autostart.ts` reads `PREFECT_SERVER_URL`. If the test still sets `OPENCODE_URL`, the fresh module import will pick up the soft migration fallback, but the remote-guard test uses a fresh module with the *pre-migration* env var value.
**Why it happens:** `BASE_URL` is read at module init, and the test uses `?v=remote-guard-test` to force a fresh module load. After rename the test must set `PREFECT_SERVER_URL` (new canonical name).
**How to avoid:** D-03 — update test files to use canonical new names. Set `process.env.PREFECT_SERVER_URL = 'http://192.168.1.100:4096'` in the test.

### Pitfall 4: build script chmod misses new prefect-mcp bin
**What goes wrong:** After adding `"prefect-mcp": "./build/index.js"` to package.json bin, the bin is not executable on Linux because `build/index.js` lacks execute bit.
**Why it happens:** Build script runs `chmod 755 build/index.js build/cli.js` — `index.js` is already included. No change needed.
**How to avoid:** Verify `build/index.js` is already in the chmod command (it is). [VERIFIED: build script in package.json]

### Pitfall 5: npm pack dry-run shows test files in package
**What goes wrong:** `npm pack --dry-run` shows `build/auth.test.js` etc. in the output — mistaken for a failure.
**Why it happens:** `files: ["build/"]` includes all files in build/, including compiled test files. This is correct per DIST-02.
**How to avoid:** DIST-04 verification passes as long as `node_modules/` and `src/` are absent from the dry-run output. Test file presence is acceptable.

---

## Code Examples

### Soft Migration: auth.ts

```typescript
// Source: verified pattern — call-time read with one-time warning
let warnedPassword = false;
let warnedUsername = false;

export function buildAuthHeader(): Record<string, string> {
  const password =
    process.env.PREFECT_SERVER_PASSWORD ??
    (() => {
      const old = process.env.OPENCODE_SERVER_PASSWORD;
      if (old && !warnedPassword) {
        console.error('[Prefect] OPENCODE_SERVER_PASSWORD is deprecated, use PREFECT_SERVER_PASSWORD');
        warnedPassword = true;
      }
      return old;
    })();

  if (!password) return {};

  const username =
    process.env.PREFECT_SERVER_USERNAME ??
    (() => {
      const old = process.env.OPENCODE_SERVER_USERNAME;
      if (old && !warnedUsername) {
        console.error('[Prefect] OPENCODE_SERVER_USERNAME is deprecated, use PREFECT_SERVER_USERNAME');
        warnedUsername = true;
      }
      return old;
    })() ??
    'opencode';

  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}
```

### Soft Migration: index.ts BASE_URL

```typescript
// Source: module-init read — fires once naturally
const BASE_URL =
  process.env.PREFECT_SERVER_URL ??
  (() => {
    const old = process.env.OPENCODE_URL;
    if (old) console.error('[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL');
    return old;
  })() ??
  'http://localhost:4096';
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '', 10) || 120_000;
```

### Global Install Detection in cli.ts

```typescript
// Source: verified approach — no external process needed
const __dirname = dirname(fileURLToPath(import.meta.url));
const isGlobal = __dirname.replace(/\\/g, '/').includes('/node_modules/prefect-mcp/');

const PREFECT_ENTRY = isGlobal
  ? { type: 'stdio' as const, command: 'prefect-mcp', args: [], env: {} }
  : { type: 'stdio' as const, command: 'node', args: [resolve(__dirname, 'index.js')], env: {} };
```

### npm pack --dry-run Verification Command

```bash
# After adding "files" field to package.json:
npm pack --dry-run 2>&1

# PASS: output contains build/ files and README.md, NO src/ or node_modules/
# ACCEPTABLE: build/*.test.js appears in output (satisfies DIST-02)
# FAIL: src/ TypeScript files appear, or node_modules/ appears
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `require.resolve()` for global detection | `fileURLToPath(import.meta.url)` path inspection | Node 12+ ESM | `require` not available in ESM modules |
| `.npmignore` to exclude files | `package.json` `files` whitelist | npm 3+ | `files` is now the preferred approach; whitelist beats blacklist |

**Deprecated/outdated:**
- `__dirname` global: unavailable in ESM — replaced by `dirname(fileURLToPath(import.meta.url))` which is already used in `src/cli.ts`

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | volta stores global packages at `~/.volta/tools/image/packages/<pkg>/lib/node_modules/<pkg>/` — path segment check works for volta users | Pattern 3 (global detection) | Path segment detection returns `false` for volta global installs; `--global` flag fallback would be needed |
| A2 | `publishConfig: { access: "public" }` is redundant for unscoped packages (npm defaults to public) | Pattern 5 (package.json fields) | If omitted and npm's default changed, first publish would fail; safe to include it |

**If volta assumption (A1) is wrong:** The `--global` flag fallback (D-11) is the recovery. The planner should include a `--global` flag in `prefect init` as an override.

---

## Open Questions

1. **DIST-05 command name clarification resolved**
   - What we know: REQUIREMENTS.md and CONTEXT.md say `"command": "prefect-mcp"` for global; package.json bin key is `"prefect"` (pointing to cli.js)
   - Resolution: A second bin entry `"prefect-mcp": "./build/index.js"` is needed so global installs expose the MCP server via PATH. The existing `"prefect"` bin (cli.js) is unchanged. [VERIFIED: codebase analysis]

2. **Test file publication**
   - What we know: `files: ["build/"]` includes `build/*.test.js`; DIST-02's stated goal is excluding `node_modules/` and `src/`
   - Resolution: Acceptable as-is. DIST-02 is satisfied by the whitelist. Test files add ~20KB to the tarball — not harmful for consumers.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | All | ✓ | v20.20.0 | — |
| npm | npm pack --dry-run, publish | ✓ | 10.8.2 | — |
| TypeScript (tsc) | npm run build | ✓ | 6.0.3 (devDep) | — |

[VERIFIED: node --version, npm --version, package.json devDependencies]

**npm package name `prefect-mcp`:** Available — registry returns 404 with "Unpublished on 2026-02-09T11:25:10.174Z". The name was previously published and unpublished, which confirms it is claimable. [VERIFIED: npm info prefect-mcp]

---

## Validation Architecture

> nyquist_validation is explicitly `false` in `.planning/config.json` — this section is skipped.

---

## Security Domain

This phase has no security-relevant changes. The env var rename is transparent to callers; soft migration preserves behavior. No new attack surfaces are introduced. The `--global` flag (if added) accepts no external input beyond the flag presence.

---

## Sources

### Primary (HIGH confidence)
- Codebase grep and file inspection — all tool counts, env var read sites, file paths [VERIFIED: direct grep results]
- `npm pack --dry-run` output — confirmed current behavior without `files` field [VERIFIED: live run]
- `npm info prefect-mcp` — confirmed package name availability [VERIFIED: live run]
- Runtime test of soft migration pattern in Node 20.20.0 [VERIFIED: live test]
- Runtime test of path segment detection across simulated version manager paths [VERIFIED: live test]
- npm global bin symlink inspection (`~/.npm-global/bin/`) — confirmed symlinks resolve to real paths [VERIFIED: ls -la live output]

### Secondary (MEDIUM confidence)
- npm `publishConfig` documentation — `access: public` behavior for unscoped packages [ASSUMED: well-established npm behavior]

### Tertiary (LOW confidence)
- Volta global install path structure [ASSUMED: based on training knowledge; not verified on this machine which does not have volta installed]

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all existing
- Architecture (rename inventory): HIGH — verified by grep; all 25 tool names confirmed
- Env var soft migration: HIGH — pattern verified by runtime test
- Global install detection: HIGH — path-segment verified; volta case ASSUMED (LOW for that specific version manager)
- npm publishing fields: HIGH — current package.json verified; npm registry verified; pack behavior verified

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (stable domain; npm publish API changes slowly)
