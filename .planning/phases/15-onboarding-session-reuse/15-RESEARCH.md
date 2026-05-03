# Phase 15: Onboarding + Session Reuse - Research

**Researched:** 2026-05-02
**Domain:** TypeScript CLI enhancement, CLAUDE.md file management, MCP tool schema evolution
**Confidence:** HIGH

## Summary

Phase 15 is the final v5.0 feature slice. It adds three self-contained capabilities to an already-complete codebase: (1) auto-generating a `## Available Workers` section in CLAUDE.md whenever servers are added or removed, (2) printing first-server guidance from `prefect init` when the registry is empty, and (3) threading an optional `sessionId` into `prefect_delegate` and `prefect_dispatch` so callers can run follow-up prompts against an existing session without creating a new one.

All three features are additive changes to existing code paths. No new modules are needed. The implementation surface is narrow: `src/cli.ts` (MULTI-08 CLAUDE.md writer + MULTI-09 guidance message), `src/index.ts` (MULTI-10 `sessionId` param on two tool registrations). Phase 14's `resolveServerUrl(sessionId)` already handles session-to-server lookup, so MULTI-10's routing is free once the branch logic is added.

The principal engineering judgment calls are: (a) how to locate and replace the `## Available Workers` section reliably in a CLAUDE.md that may or may not exist; (b) where in an existing CLAUDE.md to insert the section on first write; and (c) exactly how the `prefect_delegate` handler's abort-on-timeout path should behave when a `sessionId` reuse run times out — the answer is: do NOT abort the session (the caller owns it), just return the timeout error.

**Primary recommendation:** Implement in two plans — Plan A covers MULTI-08 + MULTI-09 (both CLI-layer changes to `src/cli.ts`), Plan B covers MULTI-10 (`src/index.ts` schema and handler branches on two tools) plus the `examples/test-task.md` documentation update and build gate.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**MULTI-08: CLAUDE.md Server Registry Section**
- D-01: Auto-generate the `## Available Workers` section on every `prefect add-server` and `prefect remove-server` call.
- D-02: Section template: `## Available Workers\n- **{name}** — {providerID}/{modelID}, {host}:{port}` — one line per registered server.
- D-03: If CLAUDE.md doesn't exist, create it. If it exists, find and replace only the `## Available Workers` section (from the heading to the next `##` or EOF). Preserve all other CLAUDE.md content unchanged.
- D-04: The section lives in CLAUDE.md at project root (`process.cwd()` at the time of the add/remove call). Same directory behavior as `prefect init`.

**MULTI-09: `prefect init` First-Server Guidance**
- D-05: Non-interactive — print guidance + the exact command to run.
- D-06: No env var pre-population.
- D-07: Guidance message when servers.json is empty or absent:
  ```
  No servers registered yet. Register your first OpenCode server:
    prefect add-server <name> <host> <port> <provider> <model>
  Example:
    prefect add-server local localhost 4096 ollama qwen2.5-coder
  ```

**MULTI-10: Optional `sessionId` on Delegate/Dispatch**
- D-08: `prefect_delegate` with `sessionId`: skip `createSession`, run prompt against existing session. `model`/`agent`/`system` pass through; `directory` ignored; `title` ignored.
- D-09: `prefect_dispatch` with `sessionId`: skip `createSession`, call `promptAsync` on existing session. Same pass-through rules.
- D-10: Tool descriptions must document which params are session-creation-only vs. run-step.
- D-11: `server` param silently ignored when `sessionId` provided.

### Claude's Discretion
- Where in CLAUDE.md to insert `## Available Workers` section (after the last section or before EOF).
- Whether to use a sentinel comment to locate the section, or rely on heading string match.
- Whether `prefect_delegate` with `sessionId` should still return `diff` (yes — diff is fetched from the session after run, regardless of whether we created it).

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MULTI-08 | CLAUDE.md server registry section: auto-generate `## Available Workers` on every add/remove-server | `updateClaudemdWorkers()` function called from `handleAddServer` and `handleRemoveServer` in `src/cli.ts` after the `addServer()`/`removeServer()` call succeeds |
| MULTI-09 | `prefect init` first-server guidance: print exact `add-server` command when registry empty | In `case 'init':` after writing `.mcp.json`, call `readRegistry()` and if `servers.length === 0` print D-07 message to `console.error()` |
| MULTI-10 | Optional `sessionId` on `prefect_delegate`/`prefect_dispatch`: skip session creation when provided | Add `sessionId?: z.string().optional()` to both input schemas in `src/index.ts`; branch at handler top |
</phase_requirements>

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| CLAUDE.md section write/replace | CLI layer (`src/cli.ts`) | — | Called immediately after registry mutations in `handleAddServer`/`handleRemoveServer`; registry.ts stays pure (no file I/O side effects) |
| First-server guidance message | CLI layer (`src/cli.ts`) | — | Purely a print-to-stderr side effect of `prefect init`; lives where `init` is handled |
| Session reuse routing | MCP server layer (`src/index.ts`) | `sessions.ts` lookup | `resolveServerUrl(sessionId)` already handles sessions.json lookup; delegate/dispatch just need a branch before `createSession` |
| Test coverage | `src/cli.test.ts` (MULTI-08, MULTI-09) | `src/index.ts` integration (MULTI-10 not unit-testable without mocking) | Follows established test pattern for CLI subcommands |

## Standard Stack

### Core (already installed — no new dependencies)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node:fs` built-in | Node ≥20 | CLAUDE.md read/write | Already used in `src/cli.ts` (`readFileSync`, `writeFileSync`, `existsSync`) [VERIFIED: src/cli.ts line 2] |
| `node:path` built-in | Node ≥20 | Path resolution | Already used in `src/cli.ts` (`resolve`) [VERIFIED: src/cli.ts line 3] |
| `zod` | 4.3.6 | Schema extension for `sessionId` param | Already used in `src/index.ts` for all tool schemas [VERIFIED: package.json] |
| `src/registry.ts` `readRegistry()` | local | Enumerate servers for CLAUDE.md section | Returns `{ servers: ServerEntry[] }`; called at-invocation-time, no cache [VERIFIED: src/registry.ts line 20] |

**Installation:** No new packages required. [VERIFIED: all dependencies already present]

## Architecture Patterns

### System Architecture Diagram

```
prefect add-server / remove-server
         │
         ▼
  addServer() / removeServer()          ← src/registry.ts (pure registry I/O)
         │
         ▼
  updateClaudemdWorkers(cwd)            ← new helper in src/cli.ts
         │
         ├─ readRegistry() → servers[]
         ├─ read CLAUDE.md (or start with '')
         ├─ find/replace ## Available Workers section
         └─ writeFile(CLAUDE.md)

prefect init
         │
         ▼
  write .mcp.json (existing logic)
         │
         ▼
  readRegistry().servers.length === 0?
         │ yes
         └─ console.error(D-07 guidance message)

prefect_delegate({ sessionId?, ... })
         │
         ├─ sessionId provided?
         │    yes → resolveServerUrl(sessionId) → existing client
         │           runPrompt(client, sessionId, prompt, opts, dir, signal)
         │           getDiff(client, sessionId, undefined, dir)
         │           return { sessionId, result, diff }
         │
         └─ no  → resolveServerUrl(undefined, serverParam) (existing path)
                   createSession(...) → runPrompt → getDiff → return

prefect_dispatch({ sessionId?, ... })
         │
         ├─ sessionId provided?
         │    yes → resolveServerUrl(sessionId) → c.session.promptAsync(...)
         │           return { sessionId }
         │
         └─ no  → existing path (createSession → promptAsync)
```

### Recommended Project Structure

No new files needed. All changes land in existing files:

```
src/
├── cli.ts           # MULTI-08 updateClaudemdWorkers() + MULTI-09 init guidance
├── index.ts         # MULTI-10 sessionId param on delegate + dispatch
├── registry.ts      # unchanged
├── sessions.ts      # unchanged
├── handlers.ts      # unchanged
└── cli.test.ts      # new tests for MULTI-08 + MULTI-09
examples/
└── test-task.md     # update to document sessionId reuse (Phase 15 success criterion 5)
```

### Pattern 1: CLAUDE.md Section Find-and-Replace

**What:** Read CLAUDE.md (or empty string if absent), locate the `## Available Workers` block, replace it with a freshly-generated block from `readRegistry()`, write back.

**When to use:** Called from `handleAddServer` and `handleRemoveServer` after the registry write succeeds.

**Section boundary algorithm:**
- Find the line index of `## Available Workers` (exact heading match).
- Scan forward from that line to find the next line starting with `##` (the next section heading) or reach EOF.
- Replace everything in that range (inclusive of heading) with the generated block.
- If the heading is not found, append the generated block at EOF (first-write case).

**Example:**
```typescript
// Source: [VERIFIED: design decision from CONTEXT.md D-03]
function updateClaudemdWorkers(cwd: string): void {
  const claudePath = resolve(cwd, 'CLAUDE.md');
  const existing = existsSync(claudePath)
    ? readFileSync(claudePath, 'utf8')
    : '';

  const { servers } = readRegistry();
  const lines = servers.map(
    (s) => `- **${s.name}** — ${s.providerID}/${s.modelID}, ${s.host}:${s.port}`
  );
  const newSection =
    '## Available Workers\n' +
    (lines.length > 0 ? lines.join('\n') + '\n' : '*(no servers registered)*\n');

  const fileLines = existing.split('\n');
  const startIdx = fileLines.findIndex((l) => l === '## Available Workers');

  let updated: string;
  if (startIdx === -1) {
    // Section absent — append (with blank-line separator if file is non-empty)
    const sep = existing.length > 0 && !existing.endsWith('\n\n') ? '\n' : '';
    updated = existing + sep + newSection;
  } else {
    // Find end of section (next ## heading or EOF)
    let endIdx = fileLines.findIndex(
      (l, i) => i > startIdx && l.startsWith('## ')
    );
    if (endIdx === -1) endIdx = fileLines.length;
    // Replace section lines (trim trailing blank lines inside the section)
    const before = fileLines.slice(0, startIdx);
    const after = fileLines.slice(endIdx);
    updated = [...before, ...newSection.trimEnd().split('\n'), ...after].join('\n');
    // Ensure file ends with newline
    if (!updated.endsWith('\n')) updated += '\n';
  }

  writeFileSync(claudePath, updated);
}
```

**Important edge cases:**
- Empty registry after `remove-server`: write `*(no servers registered)*` placeholder rather than a section with no bullets (prevents the heading from becoming a heading-with-nothing-below-it).
- CLAUDE.md absent: create it containing only the `## Available Workers` section.
- CLAUDE.md with no trailing newline before the section: the algorithm must ensure the inserted section doesn't run on from the preceding line.

### Pattern 2: `prefect init` First-Server Guidance

**What:** After writing `.mcp.json` (all four cases — create, add, force-overwrite), check the registry and print the D-07 message if empty.

**When to use:** End of every `case 'init':` execution path that exits 0.

**Example:**
```typescript
// Source: [VERIFIED: design decision from CONTEXT.md D-05, D-07]
// Inside case 'init': — before process.exit(0)
const reg = readRegistry();
if (reg.servers.length === 0) {
  console.error(
    '\nNo servers registered yet. Register your first OpenCode server:\n' +
    '  prefect add-server <name> <host> <port> <provider> <model>\n' +
    'Example:\n' +
    '  prefect add-server local localhost 4096 ollama qwen2.5-coder'
  );
}
```

Note: `readRegistry()` is already imported in `src/cli.ts` (via `addServer`, `removeServer`, `listServers` re-exports) — the `readRegistry` function itself must be added to the import from `./registry.js`.

**Registry import audit:**
```typescript
// Current src/cli.ts line 5:
import { addServer, removeServer, listServers } from './registry.js';
// Must become:
import { addServer, removeServer, listServers, readRegistry } from './registry.js';
```
[VERIFIED: src/cli.ts line 5]

### Pattern 3: `sessionId` Reuse Branch in `prefect_delegate`

**What:** When `sessionId` is provided, skip `createSession`, call `runPrompt` and `getDiff` directly using the existing session. The abort path must NOT abort the session — the caller owns it.

**Key difference from new-session path:**
- New-session path: `sessionId` is set mid-handler after `createSession` returns; AbortError path calls `session.abort()` on the created session.
- Reuse path: `sessionId` is provided by caller; AbortError path must NOT abort — just return the timeout error.

**Example:**
```typescript
// Source: [VERIFIED: design decision from CONTEXT.md D-08, D-11]
server.registerTool(
  'prefect_delegate',
  {
    description: '...', // updated per D-10
    inputSchema: z.object({
      sessionId: z.string().optional().describe(
        'Reuse an existing session. When provided: server/title/directory are ignored; model/agent/system still apply as run-step overrides.'
      ),
      prompt: z.string().describe('...'),
      title: z.string().optional().describe('Session-creation only. Ignored when sessionId is provided.'),
      directory: z.string().optional().describe('Session-creation only. Ignored when sessionId is provided.'),
      model: z.object({ providerID: z.string(), modelID: z.string() }).optional().describe('...'),
      agent: z.string().optional().describe('...'),
      system: z.string().optional().describe('...'),
      server: z.string().min(1).optional().describe('Session-creation only. Ignored when sessionId is provided.'),
    }),
  },
  async ({ sessionId: providedSessionId, prompt, title, directory, model, agent, system, server: serverParam }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    if (providedSessionId) {
      // Reuse path — D-08: skip createSession, server/directory/title ignored
      try {
        const serverUrl = resolveServerUrl(providedSessionId); // sessions.json lookup
        const c = getClient(serverUrl);
        const dir = undefined; // directory ignored in reuse mode
        const result = await runPrompt(c, providedSessionId, prompt, { model, agent, system }, dir, controller.signal);
        clearTimeout(timer);
        const diff = await getDiff(c, providedSessionId, undefined, dir);
        return { content: [{ type: 'text', text: JSON.stringify({ sessionId: providedSessionId, result, diff }) }] };
      } catch (err) {
        clearTimeout(timer);
        if ((err as Error).name === 'AbortError') {
          // D-08: do NOT abort the session — caller owns it
          return {
            content: [{ type: 'text', text: `prefect_delegate timed out after ${TIMEOUT_MS / 1000}s — session ${providedSessionId} NOT aborted (caller owns it)` }],
            isError: true,
          };
        }
        return { content: [{ type: 'text', text: String(err) }], isError: true };
      }
    }

    // Create-new-session path (existing logic)
    const dir = resolveDirectory(directory);
    let sessionId: string | undefined;
    try {
      const serverUrl = resolveServerUrl(undefined, serverParam);
      const serverName = serverNameForUrl(serverUrl, serverParam);
      const c = getClient(serverUrl);
      const session = await createSession(c, title, dir, undefined, serverUrl, serverName);
      sessionId = session.id;
      const result = await runPrompt(c, sessionId, prompt, { model, agent, system }, dir, controller.signal);
      clearTimeout(timer);
      const diff = await getDiff(c, sessionId, undefined, dir);
      return { content: [{ type: 'text', text: JSON.stringify({ sessionId, result, diff }) }] };
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        if (sessionId) {
          try { await getClient(resolveServerUrl(sessionId)).session.abort({ path: { id: sessionId } }); } catch { /* swallow */ }
        }
        return {
          content: [{ type: 'text', text: `prefect_delegate timed out after ${TIMEOUT_MS / 1000}s${sessionId ? ` — session ${sessionId} aborted` : ' — during session creation'}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### Pattern 4: `sessionId` Reuse Branch in `prefect_dispatch`

**What:** When `sessionId` is provided, skip `createSession`, call `promptAsync` directly.

**Example:**
```typescript
// Source: [VERIFIED: design decision from CONTEXT.md D-09, D-11]
async ({ sessionId: providedSessionId, prompt, title, directory, model, agent, system, server: serverParam }) => {
  if (providedSessionId) {
    // Reuse path — D-09: skip createSession
    try {
      const serverUrl = resolveServerUrl(providedSessionId);
      const { error } = await getClient(serverUrl).session.promptAsync({
        path: { id: providedSessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
          ...(model ? { model } : {}),
          ...(agent ? { agent } : {}),
          ...(system ? { system } : {}),
        },
        // directory ignored in reuse mode
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify({ sessionId: providedSessionId }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }

  // Create-new-session path (existing logic unchanged)
  const dir = resolveDirectory(directory);
  try {
    const serverUrl = resolveServerUrl(undefined, serverParam);
    const serverName = serverNameForUrl(serverUrl, serverParam);
    const c = getClient(serverUrl);
    const session = await createSession(c, title, dir, undefined, serverUrl, serverName);
    const { error } = await c.session.promptAsync({...});
    // ... (existing code)
  }
}
```

### Anti-Patterns to Avoid

- **Registry import omission:** `src/cli.ts` currently imports only `addServer, removeServer, listServers` from `registry.ts`. The CLAUDE.md writer needs `readRegistry` — must be added to the import. Easy to miss because it compiles without it if you accidentally use `addServer` return value instead. [VERIFIED: src/cli.ts line 5]
- **Calling `updateClaudemdWorkers` before the registry write:** The function reads the registry to generate the section. Must be called *after* `addServer()`/`removeServer()` returns, not before.
- **Aborting the session in reuse-mode timeout:** When `prefect_delegate` times out in reuse mode, the handler must NOT call `session.abort()`. The session belongs to the caller; aborting it would silently kill work the caller intends to continue.
- **`directory` pass-through in reuse mode:** D-08/D-09 say `directory` is ignored when `sessionId` is provided. Do not pass `dir` to `runPrompt` in the reuse path (pass `undefined`). The session's directory is already fixed.
- **Section heading whitespace mismatch:** The heading line to match is exactly `## Available Workers` (no trailing space, no leading space). A regex like `/^## Available Workers/m` is safer than `=== '## Available Workers'` when lines may have trailing whitespace, but the `===` form works when the write path normalizes the line.
- **Forgetting the guidance fires only when registry is empty:** D-07 guidance prints when `servers.length === 0` after init. If the user already has servers, init runs silently (no spam on re-runs). [VERIFIED: CONTEXT.md specifics section]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Section replacement in CLAUDE.md | Custom regex-based parser | String split on `'\n'`, line-scan, array splice | The file is line-oriented; no AST needed; regex group captures are more fragile on multi-line edge cases |
| Server URL resolution for reuse path | Second lookup implementation | `resolveServerUrl(sessionId)` (already in `src/index.ts`) | This function already covers the sessions.json→server-url lookup path [VERIFIED: src/index.ts line 45] |
| Registry reading in CLI | Direct `readFileSync` + JSON.parse | `readRegistry()` from `src/registry.ts` | Handles ENOENT, malformed JSON, and returns `{ servers: [] }` on missing file [VERIFIED: src/registry.ts line 20] |

## Common Pitfalls

### Pitfall 1: CLAUDE.md Trailing Newline Corruption
**What goes wrong:** After section replacement, the file gains extra blank lines or loses its final newline, causing noisy git diffs on every add/remove-server call.
**Why it happens:** Line split/join interacts poorly with trailing newlines. `'a\nb\n'.split('\n')` produces `['a', 'b', '']` — the trailing empty string causes a blank line when rejoined.
**How to avoid:** After the join, trim trailing whitespace artifacts, then ensure the file ends with exactly one `\n`. A reliable pattern: `updated = content.trimEnd() + '\n'` at the end.
**Warning signs:** `git diff` shows only whitespace changes after `prefect add-server`; the section content is correct but the file has grown.

### Pitfall 2: `handleAddServer` / `handleRemoveServer` Exit Before CLAUDE.md Update
**What goes wrong:** `handleAddServer` calls `process.exit(0)` at line 59. If `updateClaudemdWorkers` is called after `addServer()` succeeds, the function must be called before `process.exit(0)` — not after.
**Why it happens:** Both handler functions are typed `(): never` and end with `process.exit(0)`. The call to `updateClaudemdWorkers` must appear between the `addServer()` call and the `process.exit(0)` call.
**How to avoid:** Verify the call order in code review. [VERIFIED: src/cli.ts lines 57-59]
**Warning signs:** Unit test for `add-server` passes but CLAUDE.md is never written.

### Pitfall 3: Registry Read in `prefect init` Guidance Uses Wrong Path
**What goes wrong:** `readRegistry()` uses the default path `~/.config/prefect/servers.json`. Tests override HOME to a tempdir to get an isolated registry. If the test for MULTI-09 guidance doesn't set `HOME`/`USERPROFILE`, it reads the developer's real registry and the guidance may silently never fire.
**Why it happens:** `REGISTRY_PATH` in `src/registry.ts` is computed at module load time from `homedir()`. Tests that use `spawnSync` with a custom env inherit that env, so setting `HOME` in the spawned process env does isolate the registry path. [VERIFIED: src/registry.ts line 17, src/cli.test.ts lines 118-127 for the HOME pattern]
**How to avoid:** All `cli.test.ts` tests that care about registry state already use `{ ...process.env, HOME: dir, USERPROFILE: dir }` in their env. Follow the same pattern for MULTI-09 tests.

### Pitfall 4: `prefect_delegate` Description Becomes Misleading
**What goes wrong:** The current description says "create a session, run a prompt, and return". After MULTI-10, this is only true when `sessionId` is absent. The description must be updated per D-10.
**Why it happens:** Description is a static string; it doesn't automatically adapt to schema changes.
**How to avoid:** Rewrite description to cover both modes: "When `sessionId` is provided: reuse that session (server/title/directory ignored). When omitted: create a new session on the named server (server required)."

### Pitfall 5: `server` param not silently ignored — throws instead
**What goes wrong:** D-11 says `server` is silently ignored when `sessionId` is provided. If the handler calls `resolveServerUrl(undefined, serverParam)` in the reuse branch instead of `resolveServerUrl(providedSessionId)`, it will route to the wrong server (or fail if `serverParam` names a non-existent server).
**Why it happens:** Copy-paste from the create-new path.
**How to avoid:** In the reuse branch, always call `resolveServerUrl(providedSessionId)` — never pass `serverParam`.

## Code Examples

### CLAUDE.md Section Write (minimal)
```typescript
// Source: [VERIFIED: design decisions D-02, D-03, D-04 from CONTEXT.md + existing fs imports in src/cli.ts]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { readRegistry } from './registry.js';

function updateClaudemdWorkers(cwd: string): void {
  const claudePath = resolve(cwd, 'CLAUDE.md');
  const existing = existsSync(claudePath) ? readFileSync(claudePath, 'utf8') : '';
  const { servers } = readRegistry();

  const bullets = servers.map(
    (s) => `- **${s.name}** — ${s.providerID}/${s.modelID}, ${s.host}:${s.port}`
  );
  const sectionContent = bullets.length > 0
    ? bullets.join('\n')
    : '*(no servers registered)*';
  const newSection = `## Available Workers\n\n${sectionContent}\n`;

  const lines = existing.split('\n');
  const startIdx = lines.findIndex((l) => l.trimEnd() === '## Available Workers');

  let result: string;
  if (startIdx === -1) {
    // Append to EOF
    const sep = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
    result = existing + sep + '\n' + newSection;
  } else {
    // Find next ## heading
    const endIdx = lines.findIndex((l, i) => i > startIdx && /^## /.test(l));
    const tail = endIdx === -1 ? [] : lines.slice(endIdx);
    result = [
      ...lines.slice(0, startIdx),
      ...newSection.split('\n'),
      ...(tail.length > 0 ? ['', ...tail] : []),
    ].join('\n');
  }

  writeFileSync(claudePath, result.trimEnd() + '\n');
}
```

### Calling `updateClaudemdWorkers` from handleAddServer
```typescript
// Source: [VERIFIED: design decision D-01 + src/cli.ts handleAddServer lines 46-59]
function handleAddServer(handlerArgs: string[]): never {
  // ... (existing validation logic unchanged) ...
  addServer({ name, host, port, providerID, modelID });
  console.error(`Registered server '${name}' at ${host}:${port} (${providerID}/${modelID})`);
  updateClaudemdWorkers(process.cwd()); // D-04: uses process.cwd() at call time
  process.exit(0);
}
```

### MULTI-09 Guidance in `case 'init'`
```typescript
// Source: [VERIFIED: design decisions D-05, D-07 + src/cli.ts case 'init' lines 87-126]
case 'init': {
  // ... (existing .mcp.json write logic unchanged) ...
  console.error(force ? 'Updated prefect entry in .mcp.json' : 'Added prefect entry to .mcp.json');

  // MULTI-09: guidance when no servers registered
  const reg = readRegistry();
  if (reg.servers.length === 0) {
    console.error(
      '\nNo servers registered yet. Register your first OpenCode server:\n' +
      '  prefect add-server <name> <host> <port> <provider> <model>\n' +
      'Example:\n' +
      '  prefect add-server local localhost 4096 ollama qwen2.5-coder'
    );
  }
  process.exit(0);
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `prefect_delegate` always creates new session | `prefect_delegate` accepts optional `sessionId` to reuse | Phase 15 | Multi-pass delegation without session proliferation |
| No CLAUDE.md server docs | `## Available Workers` auto-generated on every registry mutation | Phase 15 | Claude Code can make routing decisions without reading config files |
| `prefect init` silent on empty registry | Prints exact `add-server` command when registry empty | Phase 15 | First-run UX: new users are not left guessing the next step |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `process.cwd()` in `handleAddServer`/`handleRemoveServer` is the project root the user intends CLAUDE.md to live in (same assumption as `prefect init`) | MULTI-08 patterns | Low — consistent with existing `init` behavior; CONTEXT.md D-04 explicitly confirms this |
| A2 | An empty `## Available Workers` section (zero servers registered after `remove-server`) should render a placeholder line rather than just the heading | Pattern 1 code example | Low — "no bullets" case is a discretion area; placeholder prevents confusing heading-with-nothing |

**If this table is empty:** All claims in this research were verified or cited — no user confirmation needed.

Both assumptions are LOW risk and consistent with context decisions.

## Open Questions

1. **`updateClaudemdWorkers` error handling:** Should a failure to write CLAUDE.md (e.g., permission denied) fail the `add-server` command with exit code 1, or print a warning and exit 0?
   - What we know: the registry write already succeeded before `updateClaudemdWorkers` is called.
   - What's unclear: should a stale/inaccessible CLAUDE.md block server registration or just warn?
   - Recommendation: wrap in try/catch, print `console.error('Warning: could not update CLAUDE.md: ...')` and proceed to `process.exit(0)` — the server was registered, only the documentation side effect failed.

2. **`prefect init` guidance placement:** The guidance message fires before `process.exit(0)` in all four init cases. For Case 3 (exits 1 because `--force` not passed), should guidance still fire?
   - What we know: Case 3 currently exits 1 before reaching the guidance check.
   - Recommendation: Guidance fires only on success paths (exit 0). Case 3 already exits 1 before the check — no change needed.

## Environment Availability

Step 2.6: SKIPPED — phase is purely code/config changes with no new external dependencies. All tools (`node`, `tsc`) are already verified present by Phase 14.

## Security Domain

`security_enforcement` not set to false in config.json, but this phase has no new security-relevant surface:

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Partial | `sessionId` on delegate/dispatch passes through to `resolveServerUrl` — already validated via sessions.json lookup; no user-controlled string reaches a shell or file path |
| V2 Authentication | No | No new auth surface |
| V6 Cryptography | No | No new crypto |

**Threat relevant to MULTI-08:** `updateClaudemdWorkers` writes to `CLAUDE.md` at `process.cwd()`. The server name, providerID, modelID, host, and port values in the section all come from `servers.json` (written by the CLI with validated inputs from prior `add-server` calls). No user-controlled string from the current `add-server` invocation is written to CLAUDE.md without first passing through the registry round-trip.

## Sources

### Primary (HIGH confidence)
- `src/cli.ts` — complete source read [VERIFIED]
- `src/registry.ts` — complete source read [VERIFIED]
- `src/index.ts` — prefect_delegate and prefect_dispatch handler code read [VERIFIED]
- `src/handlers.ts` — createSession, runPrompt, getDiff signatures read [VERIFIED]
- `src/sessions.ts` — lookupSession, addSession signatures read [VERIFIED]
- `src/cli.test.ts` — test patterns (HOME override, spawnSync, freshTmp) read [VERIFIED]
- `.planning/phases/15-onboarding-session-reuse/15-CONTEXT.md` — all design decisions read [VERIFIED]
- `.planning/REQUIREMENTS.md` — MULTI-08..10 requirement text read [VERIFIED]
- `.planning/ROADMAP.md` — Phase 15 success criteria read [VERIFIED]
- `package.json` — test command, dependencies, versions read [VERIFIED]

### Secondary (MEDIUM confidence)
None.

### Tertiary (LOW confidence)
None.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new dependencies; all libraries are already in use and source-verified
- Architecture: HIGH — all three features are additive changes to verified source code; patterns are derived directly from existing code
- Pitfalls: HIGH — pitfalls derived from direct code inspection (exit-before-update ordering, import list, test env pattern)

**Research date:** 2026-05-02
**Valid until:** 2026-06-02 (stable project; no external dependencies)
