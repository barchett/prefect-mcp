---
phase: 13-server-registry
reviewed: 2026-05-01T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/registry.ts
  - src/registry.test.ts
  - src/cli.ts
  - src/cli.test.ts
findings:
  critical: 0
  warning: 3
  info: 4
  total: 7
status: issues_found
---

# Phase 13: Code Review Report

**Reviewed:** 2026-05-01
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This phase introduces a server registry (`src/registry.ts`) and three new CLI subcommands (`add-server`, `remove-server`, `list-servers`) wired in `src/cli.ts`. The implementation is well-structured and test coverage is thorough. No security vulnerabilities or data-loss bugs were found. Three warnings relate to `process.exit` in library functions (which prevents callers from handling errors), a TOCTOU race in `readRegistry`, and missing runtime validation of the parsed JSON shape. Four informational items cover column overflow in tabular output, fragile global-install path detection, dead `break` statements, and a build-dependency assumption in tests.

---

## Warnings

### WR-01: `process.exit` called inside library functions

**File:** `src/registry.ts:25` and `src/registry.ts:53`

**Issue:** `readRegistry` calls `process.exit(1)` when JSON parsing fails, and `removeServer` calls `process.exit(1)` when the requested name is not found. Library functions should not terminate the process — that decision belongs to the caller. As written, any future caller that is not a top-level CLI handler (e.g., a programmatic API consumer, a test, or a future MCP tool handler) cannot catch or recover from these conditions.

**Fix:** Throw an error instead and let the CLI layer call `process.exit`:

```typescript
// registry.ts — readRegistry
} catch (err) {
  throw new Error(`could not parse ${registryPath}: ${(err as Error).message}`);
}

// registry.ts — removeServer
if (reg.servers.length === before) {
  throw new Error(`no server named '${name}' in registry`);
}

// cli.ts — callers wrap in try/catch:
try {
  removeServer(name);
} catch (err) {
  console.error(`Error: ${(err as Error).message}`);
  process.exit(1);
}
```

---

### WR-02: TOCTOU race in `readRegistry`

**File:** `src/registry.ts:19-26`

**Issue:** `readRegistry` checks `existsSync(registryPath)` and then reads the file with `readFileSync`. If the file is deleted between the two calls (e.g., concurrent `remove-server` invocations), `readFileSync` will throw a raw `ENOENT` error that bypasses the `catch` block (which only catches JSON parse errors) and propagates uncaught to the caller.

**Fix:** Wrap the entire read-and-parse in a single try/catch and handle both `ENOENT` and parse errors:

```typescript
export function readRegistry(registryPath: string = REGISTRY_PATH): Registry {
  try {
    return JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { servers: [] };
    throw new Error(`could not parse ${registryPath}: ${(err as Error).message}`);
  }
}
```

This also removes the `existsSync` import dependency.

---

### WR-03: No runtime validation of parsed registry JSON shape

**File:** `src/registry.ts:23`

**Issue:** `JSON.parse(readFileSync(...)) as Registry` is a type assertion with no runtime check. If the file on disk has a corrupt or unexpected shape (e.g., `{"servers": null}` or `{"servers": "oops"}`), downstream code that iterates `reg.servers` (e.g., `listServers`, `addServer`) will throw a cryptic `TypeError: reg.servers.filter is not a function` rather than a clear error message.

**Fix:** Add a minimal shape guard after parsing:

```typescript
const parsed = JSON.parse(readFileSync(registryPath, 'utf8'));
if (!parsed || !Array.isArray(parsed.servers)) {
  throw new Error(`malformed registry at ${registryPath}: expected { servers: [...] }`);
}
return parsed as Registry;
```

---

## Info

### IN-01: Column overflow in `listServers` tabular output

**File:** `src/registry.ts:66-68`

**Issue:** `padEnd(16)` for name and host columns silently overflows when a server name or host string is 16 characters or longer, causing columns to misalign. There is no truncation or dynamic column width calculation.

**Fix:** Either truncate at column width or compute max-width dynamically. A simple guard:

```typescript
const cell = (s: string, w: number) => s.length >= w ? s.slice(0, w - 1) + '…' : s.padEnd(w);
console.log(cell(s.name, 16) + cell(s.host, 16) + cell(String(s.port), 7) + s.model);
```

---

### IN-02: Fragile global-install detection via path string match

**File:** `src/cli.ts:15`

**Issue:** Global install is detected by checking whether `__dirname` contains the literal string `/node_modules/@lbarchett/prefect-mcp/`. This will produce a false positive if a user's home or project directory path happens to contain that segment (unlikely but possible), or a false negative if the package is installed under a scoped symlink or alternate registry path. The comment acknowledges Node resolves symlinks, but does not address the false-positive case.

**Fix:** This is an inherent limitation of path-based detection without a dedicated install marker. A more robust approach is to embed a build-time constant (e.g., via a `package.json` field read at startup) indicating the intended execution mode. As a lower-effort improvement, document the known limitation explicitly.

---

### IN-03: Unreachable `break` statements after `never`-returning handlers

**File:** `src/cli.ts:125, 128, 131`

**Issue:** `handleAddServer`, `handleRemoveServer`, and `handleListServers` are all typed as `never` (they always call `process.exit`). The `break` statements after each call in the `switch` are therefore unreachable dead code. This is harmless but adds noise.

**Fix:** Remove the `break` statements and add a comment that the handlers exit:

```typescript
case 'add-server':
  handleAddServer(args.slice(1));  // never returns
case 'remove-server':
  handleRemoveServer(args.slice(1));  // never returns
case 'list-servers':
  handleListServers();  // never returns
```

TypeScript will accept this because the return type `never` satisfies the switch fall-through.

---

### IN-04: Test build-artifact dependency not checked at startup

**File:** `src/registry.test.ts:14` and `src/cli.test.ts:8`

**Issue:** Both test files resolve `build/registry.js` and `build/cli.js` at module load time. Tests that use `runDriver`/`runCli` to spawn child processes will silently fail with exit code -1 (from `spawnSync` returning `null` status) rather than a clear diagnostic if the build directory is absent or stale. This makes CI failure modes harder to diagnose.

**Fix:** Add a pre-check in the test file or in the `runDriver`/`runCli` helper:

```typescript
import { existsSync } from 'node:fs';
if (!existsSync(REGISTRY_BUILD)) {
  throw new Error(`Build artifact missing: ${REGISTRY_BUILD} — run 'npm run build' first`);
}
```

---

_Reviewed: 2026-05-01_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
