# Phase 6: Auth + Auto-start - Pattern Map

**Mapped:** 2026-04-28
**Files analyzed:** 4 (2 new, 2 modified)
**Analogs found:** 4 / 4

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/auth.ts` | utility | request-response | `src/parts.ts` (module structure) + `src/index.ts` lines 22-24 (call-time env read) | role-match |
| `src/autostart.ts` | utility | request-response + event-driven | `src/parts.ts` (module structure) + `src/index.ts` lines 11, 22-24 (env pattern) | role-match |
| `src/index.ts` | config (wiring) | request-response | `src/index.ts` itself — one-line client creation change + first-call error interception | self-match |
| `README.md` | docs | — | existing README.md | docs-match |

## Pattern Assignments

### `src/auth.ts` (utility, request-response)

**Analog for module structure:** `src/parts.ts`

The module has no default export, only named exports. It uses no external imports beyond Node.js built-ins. This follows the same shape as `src/parts.ts`.

**Imports pattern** — copy from `src/parts.ts` lines 1 (no imports needed except Node.js built-ins):
```typescript
// No third-party imports — only Node.js Buffer (built-in, no import needed in ESM)
```

**Call-time env read pattern** (analog: `src/index.ts` lines 22-24):
```typescript
export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}
```
`authFetch` replicates this: reads `process.env.OPENCODE_SERVER_PASSWORD` and `process.env.OPENCODE_SERVER_USERNAME` **inside the function body**, never at module scope.

**Core pattern — authFetch and buildAuthHeader:**
```typescript
// buildAuthHeader reads env AT CALL TIME (not module init)
// Returns populated header object or {} if no password set
export function buildAuthHeader(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const username = process.env.OPENCODE_SERVER_USERNAME ?? 'opencode';
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

// authFetch matches Config.fetch signature from SDK:
// fetch?: (request: Request) => ReturnType<typeof fetch>
export async function authFetch(request: Request): Promise<Response> {
  const headers = buildAuthHeader();
  if (Object.keys(headers).length === 0) {
    return globalThis.fetch(request);
  }
  // Clone request with auth header injected
  const authed = new Request(request, { headers: { ...Object.fromEntries(request.headers), ...headers } });
  return globalThis.fetch(authed);
}
```

**SDK Config.fetch hook** (from `node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts` lines 17):
```typescript
fetch?: (request: Request) => ReturnType<typeof fetch>;
```
`authFetch` must match this signature exactly.

**No error handling in this module** — errors propagate to callers naturally.

---

### `src/autostart.ts` (utility, request-response + event-driven)

**Analog for module structure:** `src/parts.ts`

Named exports only. Module-level flag (`autoStartAttempted`) lives at module scope — equivalent to how `src/index.ts` keeps `BASE_URL` and `TIMEOUT_MS` at module scope (lines 10-12).

**TIMEOUT_MS pattern** (analog: `src/index.ts` line 11):
```typescript
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '', 10) || 120_000;
```
Replicate verbatim for autostart:
```typescript
const AUTOSTART_TIMEOUT_MS = parseInt(process.env.PREFECT_AUTOSTART_TIMEOUT_MS ?? '', 10) || 30_000;
```

**BASE_URL access pattern** (analog: `src/index.ts` line 10):
```typescript
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
```
`autostart.ts` needs the same value for the health check URL. It should read `process.env.OPENCODE_URL` directly (module scope is fine here since this mirrors the existing module-scope `BASE_URL` in `index.ts`).

**resolveDirectory pattern** (analog: `src/index.ts` lines 22-24) — used for spawn cwd:
```typescript
export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}
```
`ensureOpencodeRunning()` calls `resolveDirectory(undefined)` to get the spawn working directory — import from `./index.js` or duplicate the one-liner inline.

**stdio pattern** (D-08, locked spec):
```typescript
// stdout + stdin silenced to protect MCP JSON-RPC pipe; stderr inherited
const child = spawn('opencode', ['serve', '--port', port], {
  stdio: ['ignore', 'ignore', 'inherit'],
  cwd: resolveDirectory(undefined),
  detached: false,
});
```

**console.error only** (analog: `src/index.ts` line 602 and `src/cli.ts` throughout):
```typescript
console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);
```
All auto-start log lines must use `console.error`, never `console.log`.

**Health poll pattern:**
```typescript
const POLL_INTERVAL_MS = 500; // hardcoded per D-12
const deadline = Date.now() + AUTOSTART_TIMEOUT_MS;
while (Date.now() < deadline) {
  try {
    const res = await authFetch(new Request(`${BASE_URL}/global/health`));
    if (res.ok) return; // healthy
  } catch {
    // connection not yet ready — keep polling
  }
  await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
}
throw new Error(
  `OpenCode did not become healthy within ${AUTOSTART_TIMEOUT_MS}ms. ` +
  `Check that 'opencode serve' can start in your environment.`
);
```

**Once-per-lifetime guard:**
```typescript
let autoStartAttempted = false; // module scope

export async function ensureOpencodeRunning(): Promise<void> {
  if (autoStartAttempted) return;
  autoStartAttempted = true;
  // spawn + health poll ...
}
```

**Error handling** (analog: `src/index.ts` lines 136-149 — AbortError pattern):
```typescript
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```
`ensureOpencodeRunning()` throws on timeout; callers wrap in the existing catch block.

---

### `src/index.ts` (wiring changes)

**Analog:** itself. Two targeted changes:

**Change 1 — add authFetch import** (after existing imports, lines 1-7):
```typescript
import { PartSchema } from './parts.js';
// Add:
import { authFetch } from './auth.js';
import { ensureOpencodeRunning } from './autostart.js';
```

**Change 2 — thread authFetch into client** (line 12):
```typescript
// Before:
const client = createOpencodeClient({ baseUrl: BASE_URL });
// After:
const client = createOpencodeClient({ baseUrl: BASE_URL, fetch: authFetch });
```

**Change 3 — first-call connection-error detection pattern:**

The CONTEXT.md leaves the exact call site to the planner, but the pattern must follow the existing error handling shape (lines 136-149) while adding an `ensureOpencodeRunning()` pre-flight on ECONNREFUSED:

```typescript
} catch (err) {
  clearTimeout(timer);
  // ECONNREFUSED appears as TypeError in Node.js fetch; check message or code
  if (
    !autoStartHandled &&
    err instanceof TypeError &&
    String(err).includes('ECONNREFUSED')
  ) {
    await ensureOpencodeRunning();
    // retry or surface error — planner decides retry strategy
  }
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

---

### `README.md` (docs)

**No analog needed** — planner adds INFRA-06 warning text. Suggested location: top of "Environment" or "Setup" section.

Content to add (per D-05):
```
> **Warning (INFRA-06):** `OPENCODE_SERVER_PASSWORD` is read at every tool call.
> If your OpenCode server requires HTTP Basic Auth, set this variable in `.mcp.json`
> under `env`. Username defaults to `opencode`; override with `OPENCODE_SERVER_USERNAME`.
```

---

## Shared Patterns

### Call-time env reads
**Source:** `src/index.ts` lines 22-24 (`resolveDirectory`)
**Apply to:** `src/auth.ts` (`buildAuthHeader` / `authFetch`), `src/autostart.ts` (cwd for spawn)
```typescript
// Read process.env INSIDE the function body, not at module scope
return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
```

### Env-var with parseInt fallback
**Source:** `src/index.ts` line 11
**Apply to:** `src/autostart.ts` (`AUTOSTART_TIMEOUT_MS`)
```typescript
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '', 10) || 120_000;
```

### console.error only (never console.log)
**Source:** `src/index.ts` line 602, `src/cli.ts` throughout
**Apply to:** `src/autostart.ts` startup/spawn log lines
```typescript
console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);
```

### Error surface pattern
**Source:** `src/index.ts` lines 136-149 (every tool handler catch block)
**Apply to:** Connection-error detection in `src/index.ts` and thrown errors from `src/autostart.ts`
```typescript
} catch (err) {
  clearTimeout(timer);
  if ((err as Error).name === 'AbortError') { /* ... */ }
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

### Named-export-only module structure
**Source:** `src/parts.ts` (entire file — no default export, no side effects)
**Apply to:** `src/auth.ts`, `src/autostart.ts`
Both new modules export only named functions. No top-level side effects (spawn, fetch) at module load time.

### ESM .js extension on local imports
**Source:** `src/index.ts` line 7 (`import { PartSchema } from './parts.js'`)
**Apply to:** All new imports in `src/index.ts` (`./auth.js`, `./autostart.js`)
```typescript
import { PartSchema } from './parts.js';
```

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/autostart.ts` (spawn) | utility | event-driven | No process spawning exists in the codebase; closest Node.js pattern is `child_process.spawn` from stdlib |

The `spawn` call is a new pattern for this codebase. Planner should use the locked spec from CONTEXT.md D-08 directly:
```typescript
import { spawn } from 'node:child_process';
const child = spawn('opencode', ['serve', '--port', port], {
  stdio: ['ignore', 'ignore', 'inherit'],
  detached: false,
});
child.unref(); // allow parent to exit independently if needed
```

## Metadata

**Analog search scope:** `src/` (all 7 files), `node_modules/@opencode-ai/sdk/dist/` (types only)
**Files scanned:** 7 source files + 2 SDK type declaration files
**Pattern extraction date:** 2026-04-28
