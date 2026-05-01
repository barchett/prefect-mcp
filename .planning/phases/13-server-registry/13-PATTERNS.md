# Phase 13: Server Registry - Pattern Map

**Mapped:** 2026-05-01
**Files analyzed:** 3 (1 modified, 2 new)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/cli.ts` | CLI entrypoint | request-response | `src/cli.ts` (current) | exact — extend in place |
| `src/registry.ts` | utility/service | file-I/O | `src/cli.ts` (fs read/write block) | role-adjacent — same fs APIs, same error/exit pattern |
| `src/registry.test.ts` | test | file-I/O | `src/cli.test.ts` | exact — same framework, same tmp-dir isolation pattern |

## Pattern Assignments

---

### `src/cli.ts` — modification (CLI entrypoint, request-response)

**Analog:** `src/cli.ts` lines 33–44 (current subcommand dispatch)

**Existing dispatch block to replace** (lines 38–44):
```typescript
const args = process.argv.slice(2);
const subcommand = args[0];
const force = args.includes('--force');

if (subcommand !== 'init') {
  usageAndExit();
}
```

**Replacement pattern — switch dispatch:**
```typescript
const args = process.argv.slice(2);
const subcommand = args[0];

switch (subcommand) {
  case 'init':
    // ... existing init logic (unchanged) ...
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

**`usageAndExit` update** (currently line 33–36):
```typescript
// BEFORE (line 34):
console.error('Usage: prefect init [--force]');

// AFTER — list all four subcommands:
function usageAndExit(): never {
  console.error(
    'Usage: prefect <subcommand> [options]\n\n' +
    'Subcommands:\n' +
    '  init [--force]                          Write .mcp.json for this project\n' +
    '  add-server <name> <host> <port> <model> Register a named OpenCode server\n' +
    '  remove-server <name>                    Remove a named server from the registry\n' +
    '  list-servers                            List all registered servers',
  );
  process.exit(1);
}
```

**Import additions** — add to the existing import block at the top of `cli.ts`:
```typescript
import { addServer, removeServer, listServers } from './registry.js';
```

**Handler functions** (add as named functions in `cli.ts`, calling through to `registry.ts`):
```typescript
function handleAddServer(args: string[]): never {
  const [name, host, portStr, model] = args;
  if (!name || !host || !portStr || !model) {
    console.error('Usage: prefect add-server <name> <host> <port> <model>');
    process.exit(1);
  }
  const port = parseInt(portStr, 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Error: invalid port '${portStr}' — must be an integer 1–65535`);
    process.exit(1);
  }
  addServer({ name, host, port, model });
  console.error(`Registered server '${name}' at ${host}:${port} (model: ${model})`);
  process.exit(0);
}

function handleRemoveServer(args: string[]): never {
  const [name] = args;
  if (!name) {
    console.error('Usage: prefect remove-server <name>');
    process.exit(1);
  }
  removeServer(name);
  process.exit(0);
}

function handleListServers(): never {
  listServers();
  process.exit(0);
}
```

**Error pattern** (lines 63–68 of current `cli.ts` — copy for JSON parse guard in registry.ts):
```typescript
try {
  existing = JSON.parse(readFileSync(mcpJsonPath, 'utf8')) as McpJson;
} catch (err) {
  console.error(`Error: failed to parse .mcp.json — ${(err as Error).message}`);
  process.exit(1);
}
```

---

### `src/registry.ts` — new file (utility/service, file-I/O)

**Analog:** `src/cli.ts` fs read/write block (lines 53–83) + `src/autostart.ts` escape-hatch pattern (line 117)

**Imports pattern** — copy from `src/cli.ts` lines 1–4, extend with `os` and `mkdirSync`:
```typescript
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
```

**Module-level constants:**
```typescript
const REGISTRY_DIR = join(homedir(), '.config', 'prefect');
const REGISTRY_PATH = join(REGISTRY_DIR, 'servers.json');
```

**Type definitions:**
```typescript
export interface ServerEntry {
  name: string;
  host: string;
  port: number;   // number, not string — prevents Phase 14 URL construction bugs
  model: string;
}

export interface Registry {
  servers: ServerEntry[];
}
```

**`readRegistry` with safe default** — mirrors `existsSync` check in `cli.ts` line 53, parse-error guard from lines 63–68:
```typescript
export function readRegistry(registryPath = REGISTRY_PATH): Registry {
  if (!existsSync(registryPath)) return { servers: [] };
  try {
    return JSON.parse(readFileSync(registryPath, 'utf8')) as Registry;
  } catch (err) {
    console.error(
      `Error: could not parse ${registryPath} — ${(err as Error).message}`
    );
    process.exit(1);
  }
}
```

**`writeRegistry` with mkdir -p** — mirrors `writeFileSync` call from `cli.ts` line 56, adds `mkdirSync`:
```typescript
export function writeRegistry(reg: Registry, registryPath = REGISTRY_PATH): void {
  mkdirSync(join(registryPath, '..'), { recursive: true });
  writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n');
}
```
Note: `JSON.stringify(reg, null, 2) + '\n'` copies exactly the pattern from `cli.ts` line 56 and 82 — pretty-print + trailing newline.

**`addServer` — upsert with warning on duplicate** (mirrors `--force` overwrite spirit from `cli.ts` lines 72–83):
```typescript
export function addServer(entry: ServerEntry, registryPath = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  const existing = reg.servers.findIndex((s) => s.name === entry.name);
  if (existing !== -1) {
    console.error(`Updated existing server '${entry.name}'.`);
    reg.servers[existing] = entry;
  } else {
    reg.servers.push(entry);
  }
  writeRegistry(reg, registryPath);
}
```

**`removeServer` with error-on-missing** (mirrors `console.error + process.exit(1)` from `cli.ts` lines 74–76):
```typescript
export function removeServer(name: string, registryPath = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  const before = reg.servers.length;
  reg.servers = reg.servers.filter((s) => s.name !== name);
  if (reg.servers.length === before) {
    console.error(`Error: no server named '${name}' in registry.`);
    process.exit(1);
  }
  writeRegistry(reg, registryPath);
  console.error(`Removed server '${name}'.`);
}
```

**`listServers` — tabular stdout** (stdout for pipe-friendly data, matches `list-servers` success criteria):
```typescript
export function listServers(registryPath = REGISTRY_PATH): void {
  const reg = readRegistry(registryPath);
  if (reg.servers.length === 0) {
    console.log('No servers registered. Use: prefect add-server <name> <host> <port> <model>');
    return;
  }
  console.log('NAME            HOST            PORT   MODEL');
  console.log('----            ----            ----   -----');
  for (const s of reg.servers) {
    console.log(s.name.padEnd(16) + s.host.padEnd(16) + String(s.port).padEnd(7) + s.model);
  }
}
```

**Escape-hatch pattern for testability** — copy from `src/autostart.ts` line 117 (`_resetStartPromise`). In `registry.ts`, expose a path override parameter on every exported function (default = `REGISTRY_PATH`) instead of a reset function — this is cleaner and avoids module-level mutation.

---

### `src/registry.test.ts` — new file (test, file-I/O)

**Analog:** `src/cli.test.ts` (entire file — exact framework match)

**Imports pattern** (copy from `cli.test.ts` lines 1–7):
```typescript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { addServer, removeServer, listServers, readRegistry, writeRegistry } from './registry.js';
```

**Temp-dir isolation helper** (copy from `cli.test.ts` lines 10–12):
```typescript
function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), 'prefect-registry-'));
}
```

**Per-test cleanup pattern** (copy from `cli.test.ts` lines 19–33 `try/finally` block):
```typescript
test('addServer creates registry file', () => {
  const dir = freshTmp();
  const regPath = join(dir, 'servers.json');
  try {
    addServer({ name: 'local', host: 'localhost', port: 4096, model: 'qwen3' }, regPath);
    const reg = readRegistry(regPath);
    assert.equal(reg.servers.length, 1);
    assert.equal(reg.servers[0].name, 'local');
    assert.equal(reg.servers[0].port, 4096); // must be number
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
```

**spawnSync pattern for CLI integration tests** (copy from `cli.test.ts` lines 14–17):
```typescript
const CLI = resolve(process.cwd(), 'build/cli.js');

function runCli(cwd: string, ...args: string[]): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('node', [CLI, ...args], { cwd, encoding: 'utf8' });
  return { status: res.status ?? -1, stdout: res.stdout, stderr: res.stderr };
}
```

---

## Shared Patterns

### Error Exit (stderr + process.exit(1))
**Source:** `src/cli.ts` lines 34–36, 74–76
**Apply to:** `registry.ts` removeServer, readRegistry parse-error handler; `cli.ts` handleAddServer validation
```typescript
console.error(`Error: <message>`);
process.exit(1);
```

### Success Exit (stderr status message + process.exit(0))
**Source:** `src/cli.ts` lines 57–58, 83–84
**Apply to:** `cli.ts` handleAddServer, handleRemoveServer; `registry.ts` removeServer
```typescript
console.error('Added prefect entry to .mcp.json');
process.exit(0);
// Note: status/diagnostic messages → stderr; tabular data for list-servers → stdout
```

### File Existence Guard Before Read
**Source:** `src/cli.ts` line 53 (`existsSync(mcpJsonPath)`)
**Apply to:** `registry.ts` readRegistry
```typescript
if (!existsSync(registryPath)) return { servers: [] };
```

### JSON Parse Error Guard
**Source:** `src/cli.ts` lines 63–68
**Apply to:** `registry.ts` readRegistry
```typescript
try {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
} catch (err) {
  console.error(`Error: failed to parse ${path} — ${(err as Error).message}`);
  process.exit(1);
}
```

### Pretty-Print JSON Write
**Source:** `src/cli.ts` lines 56 and 82
**Apply to:** `registry.ts` writeRegistry
```typescript
writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
```

### Test Isolation via Temp Dir
**Source:** `src/cli.test.ts` lines 10–12, 22, 32 (freshTmp + try/finally + rmSync)
**Apply to:** `src/registry.test.ts` — all test cases
```typescript
function freshTmp(): string {
  return mkdtempSync(join(tmpdir(), 'prefect-registry-'));
}
// Every test: const dir = freshTmp(); try { ... } finally { rmSync(dir, { recursive: true, force: true }); }
```

### Testability Escape Hatch
**Source:** `src/autostart.ts` line 117 (`_resetStartPromise`)
**Apply to:** `src/registry.ts` — use optional `registryPath` parameter (default = `REGISTRY_PATH`) on every exported function rather than a module-level reset. This avoids polluting `~/.config/prefect/servers.json` during tests.

---

## No Analog Found

All three files have strong analogs in the codebase. No files require falling back to RESEARCH.md patterns alone.

---

## Metadata

**Analog search scope:** `src/` directory
**Files scanned:** `src/cli.ts`, `src/cli.test.ts`, `src/autostart.ts`, `src/auth.test.ts`
**Pattern extraction date:** 2026-05-01
