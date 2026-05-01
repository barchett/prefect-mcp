# Phase 13: Server Registry - Research

**Researched:** 2026-05-01
**Domain:** Node.js CLI subcommand dispatch, JSON file persistence, TypeScript CLI patterns
**Confidence:** HIGH

## Summary

Phase 13 adds three CLI subcommands (`add-server`, `remove-server`, `list-servers`) to the existing `prefect` CLI binary and establishes the `~/.config/prefect/servers.json` registry file. This is a pure CLI/filesystem concern — it does not touch the MCP server (`src/index.ts`) or any HTTP-facing code at all.

The existing CLI lives in `src/cli.ts` and currently handles only one subcommand (`init`). The phase extends it to dispatch across four subcommands. The registry file format is a flat JSON object with a `servers` array; each entry carries `name`, `host`, `port`, and `model`. All I/O uses Node.js built-in `fs` (`readFileSync`/`writeFileSync`/`mkdirSync`) — no third-party JSON library is needed.

The success criteria require that the file is read fresh on every CLI invocation. Because `cli.ts` is a CLI process (not a long-running server), every run is a fresh `node` spawn — there is no in-process cache concern. The "no restart required" criterion is automatically satisfied.

**Primary recommendation:** Extend `src/cli.ts` with a subcommand dispatch table, add `src/registry.ts` for the JSON persistence logic, and add `src/registry.test.ts` with Node.js built-in `node:test` tests. Keep the registry module free of MCP/OpenCode SDK imports so it stays independently testable.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MULTI-01 | `prefect add-server <name> <host> <port> <model>` CLI command — registers a named OpenCode server in `~/.config/prefect/servers.json` | Covered by registry.ts write path + CLI dispatch |
| MULTI-02 | `prefect remove-server <name>` CLI command — deregisters a named server from the registry; clear error on missing name | Covered by registry.ts remove path with explicit missing-name guard |
| MULTI-03 | `prefect list-servers` CLI command — tabular output (name, host, port, model); empty registry prints informative message | Covered by registry.ts read path + tabular formatter in cli.ts |
| MULTI-04 | Registry persisted to `~/.config/prefect/servers.json`; read at every CLI invocation (no in-process cache) | Satisfied structurally — CLI is a per-invocation process; registry module reads file synchronously at call time |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLI subcommand dispatch | CLI process (cli.ts) | — | Argument parsing and routing is CLI-layer responsibility |
| Registry persistence | Filesystem (registry.ts) | — | JSON file in ~/.config/prefect/; no HTTP involvement |
| Tabular output | CLI process (cli.ts) | — | Formatting belongs with the command that outputs it |
| Directory creation (mkdir -p) | Filesystem (registry.ts) | — | Registry module owns its own directory bootstrap |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` (sync) | built-in (Node 20) | `readFileSync`, `writeFileSync`, `mkdirSync` | Already used in cli.ts; synchronous is fine for CLI (not server) |
| `node:path` | built-in | `join`, `dirname` | Already used throughout the project |
| `node:os` | built-in | `os.homedir()` | Correct cross-platform home dir resolution (works on WSL2 Linux) |
| `node:test` + `node:assert` | built-in (Node 18+) | Test framework | Already used in all test files (`cli.test.ts`, `auth.test.ts`, etc.) [VERIFIED: codebase grep] |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript 6.0.3 | already in devDeps | Type safety | All source files are `.ts` — no new dep needed |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `node:fs` sync | `node:fs/promises` async | Async is unnecessary complexity for a CLI that exits immediately after each subcommand |
| Hand-rolled table formatter | `cli-table3` / `columnify` | These packages add a dep for a trivially implementable feature; the table has 4 fixed columns — hand-roll is appropriate here |

**Installation:** No new packages required. All dependencies are Node.js built-ins or already present.

**Version verification:** `npm view` not required — all APIs used are stable Node.js built-ins available in Node 20. [VERIFIED: node --version output = v20.20.0]

## Architecture Patterns

### System Architecture Diagram

```
CLI invocation
  └─ process.argv.slice(2)
       ├─ "init"          → existing init handler (unchanged)
       ├─ "add-server"    → registryAdd(name, host, port, model)
       │                       └─ readRegistry() → mutate → writeRegistry()
       ├─ "remove-server" → registryRemove(name)
       │                       └─ readRegistry() → guard missing → mutate → writeRegistry()
       └─ "list-servers"  → registryList()
                               └─ readRegistry() → format table → stdout
                                   (empty) → informative message → stdout
```

```
~/.config/prefect/servers.json
  { "servers": [ { "name": "local", "host": "localhost", "port": 4096, "model": "qwen3" } ] }
```

### Recommended Project Structure

```
src/
├── cli.ts           # extended with add-server / remove-server / list-servers dispatch
├── registry.ts      # NEW — readRegistry / writeRegistry / add / remove / list logic
├── registry.test.ts # NEW — unit tests for registry.ts using node:test
└── ...              # all other files unchanged
```

### Pattern 1: Registry File Location

**What:** Use `os.homedir()` to build the config path, not `~` string expansion or `process.env.HOME`.

**When to use:** Any time an absolute path to `~/.config/prefect/` is needed.

```typescript
// Source: Node.js built-in, VERIFIED in this session
import { homedir } from 'node:os';
import { join } from 'node:path';

const REGISTRY_DIR = join(homedir(), '.config', 'prefect');
const REGISTRY_PATH = join(REGISTRY_DIR, 'servers.json');
```

`homedir()` on WSL2 Linux returns `/home/larry` (confirmed in this session: `node -e "require('os').homedir()"` → `/home/larry`). [VERIFIED: Bash probe]

### Pattern 2: Registry Read with Safe Default

**What:** If the file does not exist, return an empty registry rather than throwing.

**When to use:** `readRegistry()` — called on every subcommand, file may not exist yet.

```typescript
// Source: [VERIFIED: codebase grep of cli.ts for existsSync pattern]
import { readFileSync, existsSync } from 'node:fs';

interface ServerEntry { name: string; host: string; port: number; model: string; }
interface Registry { servers: ServerEntry[]; }

export function readRegistry(): Registry {
  if (!existsSync(REGISTRY_PATH)) return { servers: [] };
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as Registry;
}
```

### Pattern 3: Atomic-ish Write with mkdir -p

**What:** Create the directory if it doesn't exist, then write the file.

**When to use:** `writeRegistry()` — called on add/remove, first write creates the dir.

```typescript
// Source: [VERIFIED: Node.js built-in API, mkdirSync recursive]
import { mkdirSync, writeFileSync } from 'node:fs';

export function writeRegistry(reg: Registry): void {
  mkdirSync(REGISTRY_DIR, { recursive: true }); // no-op if dir exists
  writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2) + '\n');
}
```

`mkdirSync` with `{ recursive: true }` is safe to call on an existing directory — it does not throw. [VERIFIED: Bash probe — mkdirSync recursive confirmed working on Node 20]

### Pattern 4: CLI Subcommand Dispatch

**What:** Extend the existing `if (subcommand !== 'init')` guard into a dispatch table.

**When to use:** `src/cli.ts` main body — replaces the current single-subcommand guard.

```typescript
// Source: [VERIFIED: codebase read of src/cli.ts]
const subcommand = args[0];

switch (subcommand) {
  case 'init':
    // ... existing init logic ...
    break;
  case 'add-server':
    handleAddServer(args.slice(1));
    break;
  case 'remove-server':
    handleRemoveServer(args.slice(1));
    break;
  case 'list-servers':
    handleListServers();
    break;
  default:
    usageAndExit();
}
```

The `usageAndExit()` function currently prints `Usage: prefect init [--force]` and calls `process.exit(1)`. It must be updated to list all four subcommands.

### Pattern 5: Tabular Output Format

**What:** Print a fixed-width table to stdout for `list-servers`. Empty registry prints a message to stdout (NOT stderr) — success exit code, not an error.

**When to use:** `handleListServers()`.

```typescript
// Source: [ASSUMED] — no external lib; hand-rolled column alignment
function handleListServers(): never {
  const reg = readRegistry();
  if (reg.servers.length === 0) {
    console.log('No servers registered. Use: prefect add-server <name> <host> <port> <model>');
    process.exit(0);
  }
  // header
  console.log('NAME            HOST            PORT   MODEL');
  console.log('----            ----            ----   -----');
  for (const s of reg.servers) {
    console.log(
      s.name.padEnd(16) + s.host.padEnd(16) + String(s.port).padEnd(7) + s.model
    );
  }
  process.exit(0);
}
```

The exact column widths are a discretion area; the above is a starting point.

### Pattern 6: Error Exit on Missing Name

**What:** `remove-server` for a non-existent name exits 1 with a clear message to stderr.

**When to use:** `handleRemoveServer()` — must NOT silently succeed (MULTI-02 criterion).

```typescript
// Source: [VERIFIED: matches existing cli.ts error pattern — console.error + process.exit(1)]
export function removeServer(name: string): void {
  const reg = readRegistry();
  const before = reg.servers.length;
  reg.servers = reg.servers.filter((s) => s.name !== name);
  if (reg.servers.length === before) {
    console.error(`Error: no server named '${name}' in registry.`);
    process.exit(1);
  }
  writeRegistry(reg);
  console.error(`Removed server '${name}'.`);
}
```

### Anti-Patterns to Avoid

- **Parsing args with index[1]/[2]/[3] inline in cli.ts:** Leads to fragile, hard-to-test code. Extract each handler into a named function or a separate registry module.
- **Writing to stdout vs stderr inconsistently:** The project convention (confirmed from cli.ts) is: status/diagnostic messages go to `console.error` (stderr), tabular data output for `list-servers` goes to `console.log` (stdout). The success criteria say "prints a tabular view" — use stdout so it's pipe-friendly.
- **Storing port as string:** Port should be `number` in the TypeScript interface so downstream code (Phase 14 routing) can use it directly. Parse with `parseInt(portArg, 10)` in the CLI handler, validate it is a valid port number (1–65535).
- **Duplicate name handling in add-server:** The spec doesn't explicitly say to error on duplicate — but silently overwriting vs. rejecting is a design choice. Recommend: overwrite with a logged warning (matches how `prefect init --force` works). Flag as a discretion area.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON persistence | Custom serialization | `JSON.stringify(reg, null, 2)` | Already used throughout cli.ts; pretty-print for human readability matches existing `.mcp.json` output |
| Directory creation | Recursive mkdir implementation | `mkdirSync(dir, { recursive: true })` | Built-in, tested, handles race conditions |
| Home directory path | `process.env.HOME` string expansion | `os.homedir()` | Works on Windows, WSL2, macOS without env var brittleness |
| Test framework | Jest / Vitest | `node:test` + `node:assert/strict` | Already used in all 6 existing test files — consistency matters, no new dep |

**Key insight:** This phase is additive to an existing pattern. Every technique needed already appears in the codebase — copy the patterns exactly.

## Common Pitfalls

### Pitfall 1: Port Stored as String, Breaks Phase 14

**What goes wrong:** `port` stored as `"4096"` (string) in servers.json; Phase 14 tries to use it in URL construction and gets `NaN` or `"NaN"`.

**Why it happens:** `process.argv` values are always strings; if you spread them into the entry without parsing, port becomes a string.

**How to avoid:** `parseInt(args[1], 10)` in the CLI handler; validate range 1–65535; store as `number` in the TypeScript interface.

**Warning signs:** TypeScript will flag it if the interface has `port: number` and you assign a string without `parseInt`.

### Pitfall 2: Test Writes to Real `~/.config/prefect/servers.json`

**What goes wrong:** Registry tests use the real home-dir path; they corrupt the user's actual registry or leave test data behind.

**Why it happens:** `REGISTRY_PATH` is a module-level constant baked in at import time; tests can't override it through `process.env`.

**How to avoid:** Design `registry.ts` to accept an optional `registryPath` override parameter, OR export a `_setRegistryPath(p: string)` escape hatch for testing (same pattern as `_resetStartPromise` in `autostart.ts`). Alternatively, pass `registryPath` as a parameter to every registry function — this is the cleanest approach.

**Warning signs:** Tests pass locally but leave `~/.config/prefect/servers.json` with garbage entries.

### Pitfall 3: `usageAndExit` Message Not Updated

**What goes wrong:** After adding three new subcommands, the usage message still only says `prefect init [--force]`. The "Bogus subcommand exits 1 with usage" CLI test in `cli.test.ts` checks `assert.match(stderr, /Usage: prefect init/)` — this test will continue to pass but the message will be misleading.

**Why it happens:** The existing test only asserts the partial match `/Usage: prefect init/` — it doesn't break if you add more text. But a user running `prefect bogus` will see an incomplete help message.

**How to avoid:** Update `usageAndExit()` to list all four subcommands. Update the existing `cli.test.ts` `usageAndExit` test to additionally assert the new subcommands appear.

### Pitfall 4: JSON Parse Error on Malformed Registry File

**What goes wrong:** `readRegistry()` throws a SyntaxError if the file exists but is malformed (e.g., interrupted write).

**Why it happens:** `JSON.parse` throws on invalid JSON; the error propagates as an unhandled exception.

**How to avoid:** Wrap the parse in try/catch; on failure, print a clear error message (`Error: could not parse ~/.config/prefect/servers.json — <message>`) and exit 1. Same pattern used in `cli.ts` for `.mcp.json` parse errors (lines 63–66 of cli.ts).

### Pitfall 5: Duplicate Server Name on `add-server`

**What goes wrong:** Running `prefect add-server local localhost 4096 qwen3` twice creates two entries with the same name. Phase 14 routing breaks — which entry wins?

**Why it happens:** No uniqueness guard on the add path.

**How to avoid:** Before appending, check for an existing entry with the same name. Two reasonable behaviors: (a) overwrite silently, (b) error unless a `--force` flag is passed. Recommendation: overwrite and log a message to stderr, matching the spirit of `prefect init` behavior. The planner should confirm this with the user before committing.

## Code Examples

Verified patterns from official sources:

### Registry File Shape

```typescript
// Source: [VERIFIED: derived from REQUIREMENTS.md spec — MULTI-01/04]
interface ServerEntry {
  name: string;   // unique logical name (e.g., "local", "dev-box")
  host: string;   // hostname or IP (e.g., "localhost", "192.168.1.50")
  port: number;   // numeric port (e.g., 4096)
  model: string;  // model identifier (e.g., "qwen3", "gpt-4o")
}

interface Registry {
  servers: ServerEntry[];
}
```

On-disk example at `~/.config/prefect/servers.json`:

```json
{
  "servers": [
    { "name": "local", "host": "localhost", "port": 4096, "model": "qwen3" }
  ]
}
```

### CLI Usage String

```
Usage: prefect <subcommand> [options]

Subcommands:
  init [--force]                          Write .mcp.json for this project
  add-server <name> <host> <port> <model> Register a named OpenCode server
  remove-server <name>                    Remove a named server from the registry
  list-servers                            List all registered servers
```

### Test Infrastructure Pattern (from existing test files)

```typescript
// Source: [VERIFIED: codebase read of src/cli.test.ts]
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Use a temp dir per test to avoid polluting the real registry
function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), 'prefect-registry-'));
}
```

For registry.ts unit tests, accept `registryPath` as a parameter to avoid `~/.config/prefect/` writes:

```typescript
// registry.ts — recommended testable design
export function readRegistry(registryPath = REGISTRY_PATH): Registry { ... }
export function writeRegistry(reg: Registry, registryPath = REGISTRY_PATH): void { ... }
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single `init` subcommand in cli.ts | Dispatch table for 4 subcommands | Phase 13 | cli.ts grows but stays self-contained |
| No server config storage | `~/.config/prefect/servers.json` | Phase 13 | Establishes config dir used by Phases 14–15 |

**Not yet deprecated:** Everything in the current `src/cli.ts` init logic remains intact. Phase 13 is purely additive.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Duplicate `add-server` names should silently overwrite (matching `prefect init` spirit) | Common Pitfalls, Anti-Patterns | If user expects an error on duplicate, we silently lose the old entry |
| A2 | `list-servers` tabular output goes to stdout (not stderr) so it's pipe-friendly | Pattern 5 | If success output should go to stderr (unusual), tests would differ |
| A3 | Port in registry stored as `number` (not string) | Pattern 1, registry shape | Phase 14 routing code may need adjustment if it was written expecting a string |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

## Open Questions

1. **Duplicate `add-server` behavior**
   - What we know: Spec says "registers the server" — silent upsert vs. explicit error not specified
   - What's unclear: Should the planner implement overwrite-with-warning or error-on-duplicate?
   - Recommendation: Overwrite with `console.error("Updated existing server '${name}'.")` to mirror `prefect init` semantics. If the user wants strict uniqueness, add a note for Phase 13 planning discussion.

2. **Validation depth for `add-server` inputs**
   - What we know: `port` must be parseable as a number; no format requirement stated for `host` or `model`
   - What's unclear: Should host be validated as a hostname/IP? Should model be cross-checked against anything?
   - Recommendation: Validate only that `port` is a valid integer in range 1–65535. Leave host/model as free-form strings — Phase 14 will connect to the host and surface errors naturally.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js >= 20 | All CLI and fs operations | ✓ | v20.20.0 | — |
| TypeScript 6.0.3 | Build (tsc) | ✓ | 6.0.3 | — |
| `node:os`, `node:fs`, `node:path` | Registry persistence | ✓ | built-in | — |
| `~/.config/prefect/` directory | Registry file | ✗ (does not exist yet) | — | Created by `mkdirSync` on first `add-server` call |

**Missing dependencies with no fallback:** None — all blocking dependencies are available.

**Missing dependencies with fallback:** `~/.config/prefect/` is created automatically on first write.

## Sources

### Primary (HIGH confidence)

- Codebase: `src/cli.ts` — existing CLI structure, dispatch pattern, error/exit conventions [VERIFIED: Read tool]
- Codebase: `src/cli.test.ts` — test framework pattern (node:test, spawnSync, tmpdir) [VERIFIED: Read tool]
- Codebase: `src/autostart.ts` — `_resetStartPromise` escape hatch pattern for test isolation [VERIFIED: Read tool]
- Codebase: `package.json` — test command, bin entries, existing deps [VERIFIED: Read tool]
- Codebase: `tsconfig.json` — compiler target (ES2022, Node16 module resolution) [VERIFIED: Read tool]
- Runtime probe: `node -e "require('os').homedir()"` → `/home/larry` [VERIFIED: Bash]
- Runtime probe: `mkdirSync` recursive API confirmed on Node 20 [VERIFIED: Bash]
- Runtime probe: `npm test` → 39/39 passing baseline [VERIFIED: Bash]

### Secondary (MEDIUM confidence)

- REQUIREMENTS.md: MULTI-01..04 field names (`name`, `host`, `port`, `model`) and file path (`~/.config/prefect/servers.json`) [CITED: .planning/REQUIREMENTS.md]
- STATE.md: v5.0 architectural decisions (file-backed registry, no in-process cache) [CITED: .planning/STATE.md]

### Tertiary (LOW confidence)

- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all Node.js built-ins, no external libs needed
- Architecture: HIGH — direct extension of existing cli.ts pattern
- Pitfalls: HIGH — derived from reading actual source code, not speculation

**Research date:** 2026-05-01
**Valid until:** 2026-06-01 (stable Node.js built-in APIs; no ecosystem churn risk)
