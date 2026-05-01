# Phase 9: npm Distribution - Pattern Map

**Mapped:** 2026-04-29
**Files analyzed:** 8 (6 source modifications + 1 config modification + 3 doc modifications)
**Analogs found:** 8 / 8

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` | service | request-response | `src/autostart.ts` (module-init env read) | role-match |
| `src/auth.ts` | utility | request-response | self (call-time env read pattern from research) | exact |
| `src/config.ts` | utility | request-response | self (call-time env read) | exact |
| `src/autostart.ts` | utility | request-response | self (module-init env read) | exact |
| `src/cli.ts` | utility/config | config | self (existing `__dirname` + `PREFECT_ENTRY` pattern) | exact |
| `package.json` | config | — | self (existing fields; add publishing fields) | exact |
| `src/auth.test.ts` | test | request-response | self (existing env var test structure) | exact |
| `src/autostart.test.ts` | test | request-response | self (existing module-init env var test structure) | exact |
| `CLAUDE.md` | documentation | — | self (tool name strings to rename) | exact |
| `README.md` | documentation | — | self (tool names + install pathway to add) | exact |
| `examples/test-task.md` | documentation | — | self (tool name strings to rename) | exact |

## Pattern Assignments

### `src/index.ts` (service, request-response) — env var rename at module-init

**Current state (lines 13-16):**
```typescript
// CORE-08: Base URL from OPENCODE_URL env var, default http://localhost:4096
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '', 10) || 120_000;
const client = createOpencodeClient({ baseUrl: BASE_URL, fetch: fetchWithAuth });
```

**Target pattern — module-init soft migration** (from RESEARCH.md Pattern 1):
```typescript
// Module-init read: IIFE fires once naturally at module load — no warned flag needed
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

**Tool name rename pattern** — all 25 tool name string literals, e.g. line 24:
```typescript
// Before:
server.registerTool('opencode_create_session', { ... }, ...)
// After:
server.registerTool('prefect_create_session', { ... }, ...)
```
Apply `opencode_` → `prefect_` blanket replacement across all string literals, `.describe()` strings, description fields, and error message strings in this file. Verify with `grep -n "opencode_" src/index.ts` returning zero results.

**Description string pattern** — inputSchema `.describe()` strings also contain `opencode_` references (e.g. line 49: `'Session ID returned from opencode_create_session'`). These must be updated to `prefect_create_session` as part of the blanket replacement.

---

### `src/auth.ts` (utility, request-response) — env var rename at call-time

**Current state (lines 12-18):**
```typescript
export function buildAuthHeader(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const username = process.env.OPENCODE_SERVER_USERNAME ?? 'opencode';
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}
```

**Target pattern — call-time soft migration with module-level warned flags** (from RESEARCH.md Pattern 2 + Code Examples):
```typescript
// Module-level flags: warning fires at most once per process lifetime per var
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

**Key constraint:** All warnings MUST go to `console.error`, not `console.log` — stdout is the JSON-RPC pipe (existing codebase convention, visible in `src/autostart.ts` line 90).

---

### `src/config.ts` (utility, request-response) — env var rename at call-time

**Current state (lines 13-15):**
```typescript
export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT;
}
```

**Target pattern — call-time soft migration with module-level warned flag** (from RESEARCH.md Pattern 2):
```typescript
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

**Critical constraint from prior phase (05-01-PLAN.md):** `resolveDirectory` must return `undefined` (not `process.cwd()`) when no param/env is provided. The new pattern preserves this — the IIFE returns `old` which is `undefined` when `OPENCODE_DEFAULT_PROJECT` is not set.

---

### `src/autostart.ts` (utility, request-response) — env var rename at module-init

**Current state (line 7):**
```typescript
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
```

**Target pattern — module-init soft migration** (identical to `src/index.ts` pattern, fires once at load):
```typescript
const BASE_URL =
  process.env.PREFECT_SERVER_URL ??
  (() => {
    const old = process.env.OPENCODE_URL;
    if (old) console.error('[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL');
    return old;
  })() ??
  'http://localhost:4096';
```

**No warned flag needed here** — module-init reads execute once naturally when the module is first imported.

**Also update** error message string in line 78: `'OPENCODE_URL points to remote host'` → `'PREFECT_SERVER_URL points to remote host'` (prose reference, not an env var read).

---

### `src/cli.ts` (utility/config) — global install detection + PREFECT_ENTRY update

**Current state (lines 9-20):**
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
const mcpServerPath = resolve(__dirname, 'index.js');

const PREFECT_ENTRY = {
  type: 'stdio',
  command: 'node',
  args: [mcpServerPath],
  env: {},
} as const;
```

**Target pattern — path-segment global detection + two-mode PREFECT_ENTRY** (from RESEARCH.md Pattern 3 + 4):
```typescript
const __dirname = dirname(fileURLToPath(import.meta.url));
// Normalize Windows backslashes for cross-platform comparison
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

**No new imports needed** — `dirname`, `fileURLToPath`, `resolve` are already imported in `src/cli.ts` (lines 2-4). The `mcpServerPath` intermediate variable is no longer needed; inline `resolve(__dirname, 'index.js')` in the local branch.

**Rationale for path-segment over `execSync`:** No subprocess spawn, works across all version managers (nvm, asdf, volta, standard npm), cross-platform (Windows path normalization via `.replace(/\\/g, '/')`).

---

### `package.json` (config) — publishing fields

**Current state (lines 1-23):**
```json
{
  "name": "prefect",
  "version": "1.0.0",
  "type": "module",
  "scripts": { ... },
  "bin": { "prefect": "./build/cli.js" },
  ...
}
```

**Target state — add all publishing fields:**
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
  },
  "scripts": { ... },
  ...
}
```

**Key change:** `name` changes from `"prefect"` to `"prefect-mcp"`. Second bin entry `"prefect-mcp": "./build/index.js"` enables global install `.mcp.json` to use `"command": "prefect-mcp"`. `build/index.js` already has `#!/usr/bin/env node` shebang and is already chmoded 755 by the existing build script (`chmod 755 build/index.js build/cli.js`) — no build script change needed.

---

### `src/auth.test.ts` (test) — env var name updates

**Current pattern (lines 7-12) — test sets `OPENCODE_SERVER_PASSWORD`:**
```typescript
test('buildAuthHeader returns {} when OPENCODE_SERVER_PASSWORD is not set', () => {
  delete process.env.OPENCODE_SERVER_PASSWORD;
  delete process.env.OPENCODE_SERVER_USERNAME;
  ...
});
```

**Target pattern — test sets `PREFECT_SERVER_PASSWORD` (canonical new name per D-03):**
```typescript
test('buildAuthHeader returns {} when PREFECT_SERVER_PASSWORD is not set', () => {
  delete process.env.PREFECT_SERVER_PASSWORD;
  delete process.env.PREFECT_SERVER_USERNAME;
  ...
});
```

**All 24 occurrences** of `OPENCODE_SERVER_PASSWORD` / `OPENCODE_SERVER_USERNAME` in this file must be updated to `PREFECT_SERVER_PASSWORD` / `PREFECT_SERVER_USERNAME`. Test description strings ("when OPENCODE_SERVER_PASSWORD is not set") should also be updated for accuracy.

**Critical alignment requirement (Pitfall 2 from RESEARCH.md):** Test env var names must match what `buildAuthHeader()` reads after the source update. If source reads `PREFECT_SERVER_PASSWORD` but tests set `OPENCODE_SERVER_PASSWORD`, tests pass via soft-migration fallback, masking the primary read path.

---

### `src/autostart.test.ts` (test) — env var name updates

**Current critical pattern (lines 40-41) — remote-guard test:**
```typescript
const origUrl = process.env.OPENCODE_URL;
process.env.OPENCODE_URL = 'http://192.168.1.100:4096';
```

**Target pattern — use canonical new name:**
```typescript
const origUrl = process.env.PREFECT_SERVER_URL;
process.env.PREFECT_SERVER_URL = 'http://192.168.1.100:4096';
```

**Pitfall 3 from RESEARCH.md:** The `?v=remote-guard-test` cache-bust on line 45 causes a fresh module import. After the rename, `autostart.ts` reads `PREFECT_SERVER_URL` at module init. The test must set `PREFECT_SERVER_URL` (not `OPENCODE_URL`) before the fresh import, or the soft-migration fallback silently reads `OPENCODE_URL` and the test verifies the wrong code path.

**All 10 occurrences** of `OPENCODE_URL` / `OPENCODE_SERVER_PASSWORD` in this file must be updated: `OPENCODE_URL` → `PREFECT_SERVER_URL`, `OPENCODE_SERVER_PASSWORD` → `PREFECT_SERVER_PASSWORD`.

---

### Documentation files (`CLAUDE.md`, `README.md`, `examples/test-task.md`)

**Pattern:** Blanket `opencode_` → `prefect_` replacement in prose and code blocks.

**CLAUDE.md (17 occurrences):** All tool name references in the Canonical Loop, Tool Reference table, and example calls. Also update env var table (`OPENCODE_URL` → `PREFECT_SERVER_URL`, etc.) and add `directory` arg instruction to CREATE SESSION step (DIST-11).

**README.md (26 occurrences):** All tool name references. Add a global install section documenting:
1. `npm install -g prefect-mcp`
2. `prefect init` (auto-detects global, writes `"command": "prefect-mcp"`)
3. Update env var table to show new `PREFECT_*` names (with note that `OPENCODE_*` still works but is deprecated).

**examples/test-task.md (8 occurrences):** Update `opencode_create_session`, `opencode_run`, `opencode_get_diff` references to `prefect_*` equivalents.

---

## Shared Patterns

### Console Error for All Warnings
**Source:** `src/autostart.ts` line 90 and throughout
**Apply to:** All deprecation warning emit sites in `src/index.ts`, `src/auth.ts`, `src/config.ts`, `src/autostart.ts`
```typescript
// CORRECT — stderr is safe; stdout is the JSON-RPC pipe
console.error('[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL');

// WRONG — never use console.log in this codebase
console.log('[Prefect] ...');
```

### Module-Init vs Call-Time Read Classification
**Source:** `src/autostart.ts` line 7 (module-init), `src/auth.ts` line 13 (call-time)
**Apply to:** Determine warned-flag requirement:

| File | Var | Read Time | Warned Flag Needed |
|------|-----|-----------|-------------------|
| `src/index.ts` | `OPENCODE_URL` | module-init | No — fires once |
| `src/autostart.ts` | `OPENCODE_URL` | module-init | No — fires once |
| `src/config.ts` | `OPENCODE_DEFAULT_PROJECT` | call-time | Yes — `warnedDefaultProject` |
| `src/auth.ts` | `OPENCODE_SERVER_PASSWORD` | call-time | Yes — `warnedPassword` |
| `src/auth.ts` | `OPENCODE_SERVER_USERNAME` | call-time | Yes — `warnedUsername` |

### IIFE Soft Migration IIFE Template
**Source:** RESEARCH.md Pattern 1 and Pattern 2 (runtime-verified)
**Apply to:** Every renamed env var read site
```typescript
// Template for any renamed env var — fill in NEW_NAME, OLD_NAME, default
const VALUE =
  process.env.NEW_NAME ??
  (() => {
    const old = process.env.OLD_NAME;
    if (old /* && !warnedFlag — add for call-time reads */) {
      console.error('[Prefect] OLD_NAME is deprecated, use NEW_NAME');
      // warnedFlag = true;  — add for call-time reads
    }
    return old;
  })() ??
  'default-value'; // omit if no default (returns undefined)
```

### Tool Handler Error Pattern
**Source:** `src/index.ts` lines 37-40 (preserved — no changes to this pattern)
```typescript
try {
  const result = await someApiCall(...);
  return { content: [{ type: 'text', text: JSON.stringify(result) }] };
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

### Test Env Var Save/Restore Pattern
**Source:** `src/auth.test.ts` lines 14-27
**Apply to:** All updated test cases — save prev, set new, restore in finally
```typescript
const prev = process.env.PREFECT_SERVER_PASSWORD;  // use new canonical name
process.env.PREFECT_SERVER_PASSWORD = 'secret';
try {
  // ... test body
} finally {
  if (prev === undefined) delete process.env.PREFECT_SERVER_PASSWORD;
  else process.env.PREFECT_SERVER_PASSWORD = prev;
}
```

---

## No Analog Found

All files in scope have direct analogs or are self-modifying (the existing file is its own pattern source). No files lack an analog.

---

## Pitfalls Cross-Reference (from RESEARCH.md)

| Pitfall | File(s) Affected | Guard |
|---------|-----------------|-------|
| Renaming description strings but missing tool name literals | `src/index.ts` | Run `grep -n "opencode_" src/index.ts` after rename — must return 0 |
| Test env var names diverging from source reads | `src/auth.test.ts`, `src/autostart.test.ts` | D-03: tests use canonical new names; update source + tests together |
| `autostart.test.ts` remote-guard test uses stale env var name | `src/autostart.test.ts` line 41 | Set `PREFECT_SERVER_URL` (not `OPENCODE_URL`) before `?v=remote-guard-test` import |
| `build/index.js` not executable for new `prefect-mcp` bin | `package.json` | `build/index.js` is already in the `chmod 755` command — no change needed |
| `npm pack --dry-run` showing `build/*.test.js` | Plan 2 verification | Expected — DIST-02 only requires excluding `node_modules/` and `src/` |

---

## Metadata

**Analog search scope:** `src/` (all .ts files)
**Files scanned:** 7 source files (`src/index.ts`, `src/auth.ts`, `src/config.ts`, `src/autostart.ts`, `src/cli.ts`, `src/auth.test.ts`, `src/autostart.test.ts`, `src/handlers.ts`) + `package.json`
**Pattern extraction date:** 2026-04-29
