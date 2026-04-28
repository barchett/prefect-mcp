# Phase 7: Composite Tools - Research

**Researched:** 2026-04-28
**Domain:** TypeScript MCP server — SDK type verification, handler extraction pattern, async polling
**Confidence:** HIGH

## Summary

Phase 7 adds four composite MCP tools (`opencode_delegate`, `opencode_dispatch`, `opencode_inspect`, `opencode_await`) and a handler-extraction refactor that creates `src/handlers.ts`. All SDK method signatures and return types have been verified directly against `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` and `sdk.gen.d.ts` — no assumed facts about the SDK shape.

The implementation is straightforward: Phase 6 is fully complete (auth + auto-start wired into `fetchWithAuth`), so all four composite tools inherit auth and auto-start transparently. The primary technical work is (1) extracting `createSession`, `runPrompt`, `getDiff` into named functions in `src/handlers.ts`, then (2) building the four composites on top of those named functions.

The STATE.md blocker "client.session.todo() call signature needs compile-time verification" is now resolved: the signature is confirmed as `todo(options: Options<SessionTodoData>)` where `SessionTodoData` requires `path: { id: string }` (the session ID) and optionally `query: { directory?: string }`. Return type is `Array<Todo>` where `Todo` has `{ id, content, status, priority }`. No ambiguity remains.

**Primary recommendation:** Extract exactly three handler functions into `src/handlers.ts` — `createSession`, `runPrompt`, `getDiff` — then build the four composites in `src/index.ts` calling those handlers. Keep the `client` instance in `src/index.ts` and pass it as a parameter to each handler function. This preserves the module structure established by Phases 1-6.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Shared handler functions live in a new `src/handlers.ts` module. `src/index.ts` is already 600 lines with three extracted-module precedents (`parts.ts`, `auth.ts`, `autostart.ts`). Inline helpers in `src/index.ts` would break the established pattern.
- **D-02:** Named functions in `src/handlers.ts` must include at minimum: `createSession`, `runPrompt`, `getDiff` — the three operations that `opencode_delegate` chains. Other handlers may also be extracted as needed for the composites.
- **D-03:** Existing tool registrations in `src/index.ts` are updated to call the extracted handlers rather than duplicating SDK calls inline. The 18 existing tools must behave identically after the refactor (Success Criterion 6).
- **D-04:** `opencode_delegate` returns `{ sessionId, result, diff }` where `result` is the structured `{ info, parts }` payload (same shape as `opencode_run`) and `diff` is the `Array<FileDiff & { patch: string }>` returned by `getDiff` (same shape as `opencode_get_diff`).
- **D-05:** Timeout: if the run exceeds `PREFECT_TIMEOUT_MS`, abort the session and return an error. No separate timeout param — uses the same env var as `opencode_run` for consistency.
- **D-06:** Session lifecycle: **keep alive after completion**. Auto-delete is irreversible. The caller can explicitly call `opencode_session_delete` if cleanup is desired.
- **D-07:** `opencode_dispatch` returns `{ sessionId }` immediately — non-blocking fire-and-forget. Creates the session, fires `promptAsync`, and returns without waiting.
- **D-08:** Same model/agent/system override fields as `opencode_run` — delegate and dispatch have identical input shapes except dispatch is non-blocking.
- **D-09:** `opencode_inspect` returns `{ status, todos, changedFiles }`. Sources: `status` from `session.status()`, `todos` from `session.todo()`, `changedFiles` from `session.diff()` mapped to `{ file, additions, deletions }[]` (no patch content).
- **D-10:** `changedFiles` format rationale: compact — no patch. Full diff is `opencode_get_diff`.
- **D-11:** `opencode_await` polls `session.status()` until the session's status is `"idle"`, then fetches `session.messages()` and `session.diff()`.
- **D-12:** Result reconstruction: filter `session.messages()` for the last item with `info.role === "assistant"` → take its `{ info, parts }`. Same shape as `opencode_run` output.
- **D-13:** `opencode_await` returns `{ result: { info, parts }, diff }` on success — same shape as `opencode_delegate`.
- **D-14:** Poll interval: `pollIntervalMs` param, default `2000`. Timeout: `timeoutMs` param, default `PREFECT_TIMEOUT_MS`. Both configurable per WORKFLOW-06.
- **D-15:** On timeout: surface an error with the sessionId so the caller can inspect or abort manually.
- **D-16:** Composite tool implementations go in `src/index.ts` alongside existing tool registrations.
- **D-17:** `src/handlers.ts` exports named async functions that encapsulate SDK calls + error handling. They do not register MCP tools.

### Claude's Discretion

- Exact function signatures for extracted handlers (whether they accept raw SDK params or a typed object).
- Whether to validate parts in `opencode_await`'s reconstructed result with `PartSchema` (apply for consistency).
- Error handling shape for `opencode_await` timeout — whether to include `sessionId` in the error payload.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WORKFLOW-01 | `opencode_delegate` — blocking composite: creates session, runs prompt, returns `{ sessionId, result, diff }` in one call | Verified: `createSession` → `runPrompt` → `getDiff` pattern; all three SDK calls confirmed |
| WORKFLOW-02 | `opencode_delegate` aborts the created session and returns an error if the run exceeds `PREFECT_TIMEOUT_MS` | Verified: `AbortController` pattern from `opencode_run`; `client.session.abort({ path: { id } })` confirmed |
| WORKFLOW-03 | `opencode_dispatch` — non-blocking composite: creates session, fires prompt async, returns `{ sessionId }` immediately | Verified: `client.session.promptAsync()` returns `204 void`; existing `opencode_prompt_async` tool shows the pattern |
| WORKFLOW-04 | `opencode_inspect` — returns compact snapshot `{ status, todos, changedFiles }` for a session | Verified: all three SDK calls confirmed (`session.status()`, `session.todo()`, `session.diff()`); types verified |
| WORKFLOW-05 | `opencode_await` — polls a dispatched session until terminal state, returns `{ result, diff }` | Verified: `session.status()` polling pattern; `messages()` + `diff()` for result reconstruction |
| WORKFLOW-06 | `opencode_await` accepts `pollIntervalMs` (default 2000) and `timeoutMs` (default `PREFECT_TIMEOUT_MS`) | Verified: no SDK constraint; pure TypeScript polling loop with `setTimeout` |
| WORKFLOW-07 | Composite tools call shared named handler functions, not duplicating HTTP calls | Verified: `src/handlers.ts` extraction pattern; exact handler signatures specified below |
</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Handler extraction (`createSession`, `runPrompt`, `getDiff`) | `src/handlers.ts` | `src/index.ts` (calls them) | Established module pattern; auth transparent via `fetchWithAuth` |
| `opencode_delegate` composite | `src/index.ts` (tool registration) | `src/handlers.ts` (execution) | Tool registration stays in index.ts (D-16) |
| `opencode_dispatch` composite | `src/index.ts` (tool registration) | `src/handlers.ts` (execution) | Same pattern |
| `opencode_inspect` composite | `src/index.ts` (tool registration) | SDK `session.status/todo/diff` | D-09 sources verified |
| `opencode_await` poll loop | `src/index.ts` | SDK `session.status/messages/diff` | D-11 polling confirmed |
| Auth + auto-start | `src/fetch.ts` (`fetchWithAuth`) | — | Phase 6 complete; handlers inherit transparently |
| Client instantiation | `src/index.ts` (module level) | — | `createOpencodeClient` stays in index.ts; client passed as param to handlers |

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opencode-ai/sdk` | 1.14.25 | OpenCode HTTP client with typed methods | Project dependency; all SDK calls go through this |
| `zod` | 4.3.6 | Runtime type validation | Project standard; `PartSchema` validation in `runPrompt` and `opencode_await` |
| `diff` | ^7.0.0 | Unified diff computation for `getDiff` | Project dependency; `createPatch` already used in `opencode_get_diff` |
| `@modelcontextprotocol/sdk` | 1.29.0 | MCP server registration | Project foundation |

All versions verified from `package.json`. [VERIFIED: package.json]

**No new dependencies required for Phase 7.** All capabilities are achievable with the existing dependency set.

### Architecture Patterns

#### System Architecture: Data Flow Through Composites

```
Claude Code (MCP client)
    │
    ▼
opencode_delegate / opencode_dispatch / opencode_inspect / opencode_await
    │ (registered in src/index.ts)
    │
    ▼
src/handlers.ts  ─────────────────────────────────────────────────────────┐
│  createSession(client, title?, directory?)  → Session                   │
│  runPrompt(client, sessionId, prompt, opts?, directory?)  → {info,parts}│
│  getDiff(client, sessionId, messageID?, directory?)  → FileDiff+patch[] │
└─────────────────────────────────────────────────────────────────────────┘
    │
    ▼
src/fetch.ts (fetchWithAuth)
    │  ├── src/auth.ts (Basic Auth injection)
    │  └── src/autostart.ts (ECONNREFUSED → spawn + health poll)
    │
    ▼
OpenCode HTTP API
    └── POST /session (create)
    └── POST /session/:id/message (prompt — blocking)
    └── POST /session/:id/prompt_async (dispatch — 204 void)
    └── GET  /session/status (poll status map)
    └── GET  /session/:id/todo (todo list)
    └── GET  /session/:id/diff (file diffs)
    └── GET  /session/:id/message (message list)
    └── POST /session/:id/abort (abort on timeout)
```

#### Recommended Project Structure

```
src/
├── index.ts        # Tool registrations (18 existing + 4 new composites)
├── handlers.ts     # NEW: Named SDK-call functions (createSession, runPrompt, getDiff)
├── parts.ts        # PartSchema (discriminated union, 12 types)
├── config.ts       # resolveDirectory()
├── auth.ts         # buildAuthHeader(), authFetch()
├── fetch.ts        # fetchWithAuth() (auth + auto-start)
├── autostart.ts    # ensureOpencodeRunning()
└── cli.ts          # prefect init CLI
```

## Verified SDK Types — Critical Reference

### `session.todo()` — RESOLVED

**Signature verified from `sdk.gen.d.ts`:**
```typescript
todo<ThrowOnError extends boolean = false>(
  options: Options<SessionTodoData, ThrowOnError>
): RequestResult<SessionTodoResponses, SessionTodoErrors, ThrowOnError, "fields">
```

**`SessionTodoData` verified from `types.gen.d.ts`:**
```typescript
type SessionTodoData = {
  body?: never;
  path: {
    id: string;  // Session ID — REQUIRED
  };
  query?: {
    directory?: string;
  };
  url: "/session/{id}/todo";
};
```

**`SessionTodoResponses` verified:**
```typescript
type SessionTodoResponses = {
  200: Array<Todo>;  // Array of Todo objects
};
```

**`Todo` type verified:**
```typescript
type Todo = {
  content: string;   // Brief description of the task
  status: string;    // "pending" | "in_progress" | "completed" | "cancelled"
  priority: string;  // "high" | "medium" | "low"
  id: string;        // Unique identifier
};
```

**Correct call pattern:**
```typescript
const { data, error } = await client.session.todo({
  path: { id: sessionId },
  query: dir ? { directory: dir } : undefined,
});
```

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts, sdk.gen.d.ts]

---

### `session.status()` — VERIFIED

**Signature verified from `sdk.gen.d.ts`:**
```typescript
status<ThrowOnError extends boolean = false>(
  options?: Options<SessionStatusData, ThrowOnError>
): RequestResult<SessionStatusResponses, SessionStatusErrors, ThrowOnError, "fields">
```

**`SessionStatusData` — NO path param (global endpoint):**
```typescript
type SessionStatusData = {
  body?: never;
  path?: never;   // NO sessionId — returns ALL sessions
  query?: {
    directory?: string;
  };
  url: "/session/status";
};
```

**`SessionStatusResponses` verified:**
```typescript
type SessionStatusResponses = {
  200: {
    [key: string]: SessionStatus;  // Map keyed by sessionId
  };
};
```

**`SessionStatus` union verified:**
```typescript
type SessionStatus =
  | { type: "idle" }
  | { type: "retry"; attempt: number; message: string; next: number }
  | { type: "busy" };
```

**Critical implication for `opencode_await` and `opencode_inspect`:** The status response is a global map. To get the status for one session, index by `sessionId`:
```typescript
const { data, error } = await client.session.status({
  query: dir ? { directory: dir } : undefined,
});
const sessionStatus = (data as Record<string, SessionStatus>)[sessionId];
const statusType = sessionStatus?.type ?? 'unknown';
```

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts, sdk.gen.d.ts]

---

### `session.messages()` — VERIFIED

**Signature verified from `sdk.gen.d.ts`:**
```typescript
messages<ThrowOnError extends boolean = false>(
  options: Options<SessionMessagesData, ThrowOnError>
): RequestResult<SessionMessagesResponses, SessionMessagesErrors, ThrowOnError, "fields">
```

**`SessionMessagesData`:**
```typescript
type SessionMessagesData = {
  body?: never;
  path: {
    id: string;  // Session ID — REQUIRED
  };
  query?: {
    directory?: string;
    limit?: number;
  };
  url: "/session/{id}/message";
};
```

**`SessionMessagesResponses` verified:**
```typescript
type SessionMessagesResponses = {
  200: Array<{
    info: Message;        // UserMessage | AssistantMessage
    parts: Array<Part>;   // 12-type discriminated union
  }>;
};
```

**Result reconstruction for `opencode_await`:**
```typescript
const { data, error } = await client.session.messages({
  path: { id: sessionId },
  query: dir ? { directory: dir } : undefined,
});
// Find last assistant message
const last = [...(data ?? [])].reverse().find(m => m.info.role === 'assistant');
if (!last) throw new Error('No assistant message found');
const validatedParts = PartSchema.array().parse(last.parts);
return { info: last.info as AssistantMessage, parts: validatedParts };
```

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts]

---

### `session.promptAsync()` — VERIFIED

**Returns `204 void` — confirmed `opencode_dispatch` pattern:**
```typescript
type SessionPromptAsyncResponses = {
  204: void;  // No body — true fire-and-forget
};
```

The existing `opencode_prompt_async` tool in `src/index.ts` already uses this correctly. `opencode_dispatch` replicates this pattern after calling `createSession`. [VERIFIED: src/index.ts lines 170-193, types.gen.d.ts]

---

### `session.diff()` — VERIFIED

```typescript
type SessionDiffResponses = {
  200: Array<FileDiff>;
};
type FileDiff = {
  file: string;
  before: string;
  after: string;
  additions: number;
  deletions: number;
};
```

**For `getDiff` extracted handler (same as `opencode_get_diff`):** appends `patch: createPatch(d.file, d.before, d.after)` to each `FileDiff`.

**For `opencode_inspect changedFiles`:** drops `before`, `after`, `patch` — returns only `{ file, additions, deletions }`.

[VERIFIED: types.gen.d.ts]

---

### `session.create()` — VERIFIED (already in use)

```typescript
type SessionCreateData = {
  body?: {
    parentID?: string;
    title?: string;
  };
  query?: {
    directory?: string;
  };
  url: "/session";
};
type SessionCreateResponses = {
  200: Session;  // Session.id is the sessionId for subsequent calls
};
```

[VERIFIED: src/index.ts lines 33-42, types.gen.d.ts]

---

### `session.abort()` — VERIFIED (already in use)

```typescript
type SessionAbortData = {
  path: { id: string };
  query?: { directory?: string };
};
type SessionAbortResponses = {
  200: boolean;
};
```

[VERIFIED: src/index.ts lines 58-67, types.gen.d.ts]

---

## Architecture Patterns

### Pattern 1: Handler Function Signature Convention

**What:** Handler functions in `src/handlers.ts` accept the `client` instance as first parameter, followed by operation-specific parameters. This avoids module-level coupling (no `export { client }` from `index.ts`) and makes handlers testable in isolation.

**When to use:** Every function in `src/handlers.ts`.

**Recommended signatures:**
```typescript
// src/handlers.ts
import { OpencodeClient } from '@opencode-ai/sdk';
import { createPatch } from 'diff';
import { PartSchema } from './parts.js';
import { resolveDirectory } from './config.js';

export interface RunPromptOptions {
  model?: { providerID: string; modelID: string };
  agent?: string;
  system?: string;
}

export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
): Promise<import('@opencode-ai/sdk').Session> { ... }

export async function runPrompt(
  client: OpencodeClient,
  sessionId: string,
  prompt: string,
  opts: RunPromptOptions,
  directory: string | undefined,
  signal: AbortSignal,
): Promise<{ info: import('@opencode-ai/sdk').AssistantMessage; parts: unknown[] }> { ... }

export async function getDiff(
  client: OpencodeClient,
  sessionId: string,
  messageID: string | undefined,
  directory: string | undefined,
): Promise<Array<import('@opencode-ai/sdk').FileDiff & { patch: string }>> { ... }
```

[ASSUMED] — exact signature shape is Claude's Discretion per D-01 to D-17. The pattern above is consistent with the codebase and passes `AbortSignal` from the composite into `runPrompt` to enable timeout cancellation. Planner should finalize.

### Pattern 2: Refactoring Existing Tool Handlers to Use Extracted Functions

**What:** The three existing handlers (`opencode_create_session`, `opencode_run`, `opencode_get_diff`) are updated to call the new named functions instead of inlining SDK calls. The tool surface and return shape must be identical.

**Example refactor for `opencode_run`:**
```typescript
// Before (inline SDK call):
async ({ sessionId, prompt, directory, model, agent, system }) => {
  const dir = resolveDirectory(directory);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await client.session.prompt({ ... });
    // ...
  }
}

// After (delegates to extracted handler):
async ({ sessionId, prompt, directory, model, agent, system }) => {
  const dir = resolveDirectory(directory);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const result = await runPrompt(client, sessionId, prompt, { model, agent, system }, dir, controller.signal);
    clearTimeout(timer);
    return { content: [{ type: 'text', text: JSON.stringify(result) }] };
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') { ... }
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

[VERIFIED: src/index.ts — existing opencode_run handler is the template]

### Pattern 3: `opencode_delegate` Timeout + Abort Sequence

**What:** Delegate uses `AbortController` (same as `opencode_run`). On `AbortError`, it must also call `client.session.abort()` on the newly-created session before returning the error. Otherwise the session is left running.

```typescript
// opencode_delegate handler (in src/index.ts):
async ({ prompt, title, directory, model, agent, system }) => {
  const dir = resolveDirectory(directory);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  let sessionId: string | undefined;
  try {
    const session = await createSession(client, title, dir);
    sessionId = session.id;
    const result = await runPrompt(client, sessionId, prompt, { model, agent, system }, dir, controller.signal);
    clearTimeout(timer);
    const diff = await getDiff(client, sessionId, undefined, dir);
    return { content: [{ type: 'text', text: JSON.stringify({ sessionId, result, diff }) }] };
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError' && sessionId) {
      // D-05: abort the session on timeout
      await client.session.abort({ path: { id: sessionId } }).catch(() => {});
      return {
        content: [{ type: 'text', text: `opencode_delegate timed out after ${TIMEOUT_MS / 1000}s — session ${sessionId} aborted` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

[VERIFIED: pattern derived from src/index.ts opencode_run + opencode_abort handlers]

### Pattern 4: `opencode_await` Poll Loop

**What:** A `while` loop that polls `session.status()`, sleeps, and checks the deadline. Exits when the session's status type is `"idle"`.

```typescript
// opencode_await handler poll loop (in src/index.ts):
async ({ sessionId, pollIntervalMs = 2000, timeoutMs = TIMEOUT_MS, directory }) => {
  const dir = resolveDirectory(directory);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { data, error } = await client.session.status({ query: dir ? { directory: dir } : undefined });
    if (error) throw new Error(JSON.stringify(error));
    const statusEntry = (data as Record<string, { type: string }>)[sessionId];
    if (statusEntry?.type === 'idle') break;
    if (Date.now() + pollIntervalMs >= deadline) {
      // D-15: timeout — return error with sessionId
      return {
        content: [{ type: 'text', text: JSON.stringify({ error: `Timed out after ${timeoutMs}ms`, sessionId }) }],
        isError: true,
      };
    }
    await new Promise<void>((r) => setTimeout(r, pollIntervalMs));
  }
  // Reconstruct result from messages + diff
  const msgs = await client.session.messages({ path: { id: sessionId }, query: dir ? { directory: dir } : undefined });
  // ... find last assistant message, validate parts, fetch diff
}
```

[VERIFIED: session.status() shape verified from types.gen.d.ts; poll pattern is standard Node.js]

### Anti-Patterns to Avoid

- **Exporting `client` from `src/index.ts`:** Creates a circular import risk and breaks the module boundary pattern. Pass `client` as a parameter instead.
- **Calling `session.todo(options?)` without path.id:** `SessionTodoData.path` is REQUIRED (not optional). Missing it causes a runtime error.
- **Calling `session.status({ path: { id: sessionId } })`:** There is no `path` param on `session.status()`. It's a global endpoint that returns all sessions as a map. Index by `sessionId` after the call.
- **Using `process.cwd()` as a directory fallback:** Phase 5 design decision — `resolveDirectory` returns `undefined`, not `process.cwd()`. Handlers must not add this fallback.
- **Auto-deleting the session in `opencode_delegate`:** D-06 explicitly prohibits this. Irreversible and removes recovery options.
- **Catching errors inside `runPrompt` that swallow `AbortError`:** The `AbortError` must propagate out of `runPrompt` so the delegate handler can detect the timeout and call `session.abort()`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unified diff generation in `getDiff` | Custom string comparison | `createPatch` from `diff` package | Already used in `opencode_get_diff`; handles edge cases |
| Part validation in reconstructed results | Manual type checks | `PartSchema.array().parse()` | Already used in `opencode_run`; catches malformed API responses |
| Auth header injection | Per-handler Basic Auth | `fetchWithAuth` (transparent via SDK client) | Phase 6 wires auth through `createOpencodeClient({ fetch: fetchWithAuth })`; all handlers inherit it |
| AbortController timeout | `Promise.race` or manual timer | `AbortController` + `clearTimeout` | Already established pattern in `opencode_run` (Phase 4 decision) |

## Common Pitfalls

### Pitfall 1: `session.status()` Indexed by sessionId (Not a Single-Session Endpoint)

**What goes wrong:** Code calls `client.session.status({ path: { id: sessionId } })` expecting a `SessionStatus` directly — TypeScript rejects it at compile time (no `path` in `SessionStatusData`).

**Why it happens:** Name looks like a per-session endpoint, but the OpenCode API `/session/status` returns a global map of ALL active sessions.

**How to avoid:** Always index the response: `(data as Record<string, SessionStatus>)[sessionId]?.type`.

**Warning signs:** TypeScript error "Argument of type '{ path: {...} }' is not assignable..." on `session.status()` call.

[VERIFIED: types.gen.d.ts — `SessionStatusData.path` is typed `never`]

### Pitfall 2: `session.todo()` Requires `path: { id }` (Not Optional)

**What goes wrong:** Code calls `client.session.todo()` with no arguments — TypeScript error at compile time. `SessionTodoData.path` is typed as `{ id: string }` (required, not optional).

**Why it happens:** Contrast with `session.status()` which has `path?: never` (no path needed). The two look similar but are opposite.

**How to avoid:** Always pass `path: { id: sessionId }` to `session.todo()`.

[VERIFIED: types.gen.d.ts — `SessionTodoData.path: { id: string }` is required]

### Pitfall 3: `opencode_await` — Session Not In Status Map

**What goes wrong:** `(data as Record<string, SessionStatus>)[sessionId]` returns `undefined` if the session is not active (not running, or OpenCode doesn't know about it). Polling loop exits as `undefined?.type === 'idle'` is `false`, running until timeout.

**Why it happens:** The `/session/status` endpoint only includes sessions that are actively tracked by OpenCode's runtime.

**How to avoid:** Add a guard: if `statusEntry` is `undefined` for more than N polls, treat the session as idle (OpenCode may have already processed it). Or check `session.get()` to confirm the session exists before polling.

**Warning signs:** `opencode_await` always times out even after `opencode_dispatch` completed.

[ASSUMED] — based on the map-typed response; not explicitly documented.

### Pitfall 4: AbortError Swallowed Inside `runPrompt`

**What goes wrong:** `runPrompt` catches `AbortError` internally and returns an error string instead of rethrowing. The `opencode_delegate` handler never sees `AbortError` and cannot call `session.abort()`, leaving the session running.

**Why it happens:** Convenience — "catch everything" handlers. The existing `opencode_run` handler catches `AbortError` at the tool level. In the extracted `runPrompt` function, `AbortError` must rethrow so the composite can handle abort.

**How to avoid:** In `runPrompt`, rethrow `AbortError`:
```typescript
} catch (err) {
  clearTimeout(timer);
  throw err;  // Let caller (delegate handler) decide: AbortError → session.abort()
}
```

Or: don't catch errors in `runPrompt` at all — let them propagate to the tool handler.

[VERIFIED: pattern derived from existing src/index.ts opencode_run handler structure]

### Pitfall 5: `TIMEOUT_MS` Not Exported

**What goes wrong:** `src/handlers.ts` references `TIMEOUT_MS` but the constant is module-scoped in `src/index.ts` and not exported. TypeScript compile error.

**Why it happens:** `TIMEOUT_MS` is defined at the top of `src/index.ts` as a `const` without `export`.

**How to avoid:** Either:
- (Option A) Move `TIMEOUT_MS` to `src/config.ts` alongside `resolveDirectory()` and import it in both `index.ts` and `handlers.ts`.
- (Option B) Pass `TIMEOUT_MS` as a parameter to handler functions that need it (only `runPrompt` needs the timeout; the poll loop in `opencode_await` uses its own `timeoutMs` param).

**Recommendation:** Option B — pass as parameter. `runPrompt` already receives `signal: AbortSignal` from an `AbortController`, so the timeout management stays in `src/index.ts` where the `TIMEOUT_MS` constant lives. Handlers get the `signal`; callers manage the `AbortController`.

[VERIFIED: src/index.ts line 13 — `const TIMEOUT_MS = ...` (no `export`)]

### Pitfall 6: `opencode_await` Reconstruct — `AssistantMessage` vs `Message` Cast

**What goes wrong:** `session.messages()` returns `Array<{ info: Message; parts: Array<Part> }>` where `Message = UserMessage | AssistantMessage`. Filtering for `role === 'assistant'` narrowed to an element, but `last.info` is still typed as `Message`. Passing it to the output requires a cast.

**How to avoid:** After the `.find()`, cast explicitly: `last.info as AssistantMessage`. TypeScript cannot automatically narrow through `Array.find()` with a manual `role` check.

[VERIFIED: types.gen.d.ts — `Message = UserMessage | AssistantMessage`; both have `.role`]

## Code Examples

### Extract: `createSession` in `src/handlers.ts`

```typescript
// Source: verified from src/index.ts opencode_create_session handler (lines 33-42)
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
): Promise<Session> {
  const { data, error } = await client.session.create({
    body: { title },
    query: directory ? { directory } : undefined,
  });
  if (error) throw new Error(JSON.stringify(error));
  return data!;
}
```

### Extract: `runPrompt` in `src/handlers.ts`

```typescript
// Source: verified from src/index.ts opencode_run handler (lines 100-143)
export async function runPrompt(
  client: OpencodeClient,
  sessionId: string,
  prompt: string,
  opts: RunPromptOptions,
  directory: string | undefined,
  signal: AbortSignal,
): Promise<{ info: AssistantMessage; parts: z.infer<typeof PartSchema>[] }> {
  const { data, error } = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: 'text', text: prompt }],
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.agent ? { agent: opts.agent } : {}),
      ...(opts.system ? { system: opts.system } : {}),
    },
    query: directory ? { directory } : undefined,
    signal,
  });
  if (error) throw new Error(JSON.stringify(error));
  const validatedParts = PartSchema.array().parse(data!.parts);
  return { info: data!.info, parts: validatedParts };
}
```

### Extract: `getDiff` in `src/handlers.ts`

```typescript
// Source: verified from src/index.ts opencode_get_diff handler (lines 207-226)
export async function getDiff(
  client: OpencodeClient,
  sessionId: string,
  messageID: string | undefined,
  directory: string | undefined,
): Promise<Array<FileDiff & { patch: string }>> {
  const { data, error } = await client.session.diff({
    path: { id: sessionId },
    query: {
      ...(messageID ? { messageID } : {}),
      ...(directory ? { directory } : {}),
    },
  });
  if (error) throw new Error(JSON.stringify(error));
  return (data ?? []).map((d) => ({
    ...d,
    patch: createPatch(d.file, d.before, d.after),
  }));
}
```

### `opencode_inspect` changedFiles Mapping

```typescript
// Source: verified from types.gen.d.ts FileDiff type and CONTEXT.md D-09/D-10
const { data, error } = await client.session.diff({
  path: { id: sessionId },
  query: dir ? { directory: dir } : undefined,
});
if (error) throw new Error(JSON.stringify(error));
const changedFiles = (data ?? []).map((d) => ({
  file: d.file,
  additions: d.additions,
  deletions: d.deletions,
  // NOTE: omit before, after, and computed patch — this is inspect, not get_diff
}));
```

### `opencode_inspect` Status + Todo Fetch

```typescript
// Source: verified from types.gen.d.ts SessionStatusData (no path, global map)
// and SessionTodoData (path.id required)
const [statusResult, todoResult] = await Promise.all([
  client.session.status({ query: dir ? { directory: dir } : undefined }),
  client.session.todo({ path: { id: sessionId }, query: dir ? { directory: dir } : undefined }),
]);
if (statusResult.error) throw new Error(JSON.stringify(statusResult.error));
if (todoResult.error) throw new Error(JSON.stringify(todoResult.error));
const status = (statusResult.data as Record<string, { type: string }>)[sessionId]?.type ?? 'unknown';
const todos = todoResult.data ?? [];
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Inline SDK calls in every tool handler | Named handler functions in `src/handlers.ts` | Phase 7 (this phase) | Composites can chain operations without HTTP duplication |
| Single-step tools only | Composite tools (`delegate`, `dispatch`, `inspect`, `await`) | Phase 7 (this phase) | Claude Code can use fewer tool calls for the common workflow |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Handler functions should accept `signal: AbortSignal` as a parameter (passed by composite callers) rather than creating their own `AbortController` | Handler signatures (Code Examples) | Low — planner can restructure; pattern is consistent with existing code |
| A2 | `opencode_await` should treat `undefined` status entry as non-idle and continue polling (not as idle) | Pitfall 3 | Medium — if undefined means "completed", await would spin until timeout for finished sessions |
| A3 | `TIMEOUT_MS` stays in `src/index.ts` and is passed via `AbortSignal` to handlers (not exported or moved) | Pitfall 5 | Low — alternative is moving to `src/config.ts`; both compile cleanly |

**If this table is empty regarding verified facts:** All SDK type claims in this research were verified against the actual `.d.ts` files — zero assumed SDK facts.

## Open Questions

1. **`opencode_await` with undefined session status**
   - What we know: `session.status()` returns a map; sessions not tracked return `undefined` for their key
   - What's unclear: Should `undefined` status be treated as idle (session completed before first poll) or as "not found" (error)?
   - Recommendation: Treat `undefined` as "not in status map → check if it was ever idle by calling `session.get()` once to confirm session exists, then treat undefined as idle". Alternatively, treat as idle immediately. Planner decides.

2. **`opencode_dispatch` input schema**
   - What we know: D-08 says "same model/agent/system override fields as `opencode_run`"
   - What's unclear: Should `dispatch` also accept a `title` param for the created session (like `opencode_create_session` does)?
   - Recommendation: Yes — add `title?: string` as optional. It's already handled by `createSession`. The CONTEXT.md does not explicitly prohibit it, and it's consistent with the delegate tool.

## Environment Availability

Step 2.6: SKIPPED — Phase 7 is purely TypeScript code changes. No new external tools, services, CLIs, or runtimes are required beyond what is already installed and verified in Phase 6.

## Validation Architecture

`workflow.nyquist_validation` is explicitly `false` in `.planning/config.json`. Section omitted.

## Security Domain

No new security surface area in Phase 7. The composite tools call the same SDK endpoints as the existing atomic tools. Auth is handled transparently by `fetchWithAuth`. No new authentication, authorization, or input validation requirements arise from adding composites.

## Sources

### Primary (HIGH confidence)
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — `SessionStatus`, `SessionTodoData`, `SessionTodoResponses`, `Todo`, `SessionStatusData`, `SessionStatusResponses`, `SessionMessagesData`, `SessionMessagesResponses`, `SessionDiffData`, `FileDiff`, `SessionCreateData`, `SessionPromptAsyncResponses`
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — `session.todo()`, `session.status()`, `session.messages()`, `session.promptAsync()`, `session.diff()`, `session.create()`, `session.abort()` method signatures
- `src/index.ts` — existing tool handler patterns (opencode_run, opencode_get_diff, opencode_create_session, opencode_abort, opencode_prompt_async)
- `src/parts.ts` — PartSchema (all 12 types), used in runPrompt and opencode_await reconstruction
- `src/config.ts` — resolveDirectory() signature
- `src/fetch.ts`, `src/auth.ts`, `src/autostart.ts` — Phase 6 complete; auth/autostart transparent to handlers
- `.planning/phases/07-composite-tools/07-CONTEXT.md` — all 17 locked decisions

### Secondary (MEDIUM confidence)
- `package.json` — dependency versions verified

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json and types.gen.d.ts
- SDK types: HIGH — read directly from .d.ts files in node_modules
- Architecture patterns: HIGH — derived from existing src/index.ts handlers
- Pitfalls: HIGH (Pitfalls 1-2, 4-6) / MEDIUM (Pitfall 3 — runtime behavior assumed)
- Handler signatures: MEDIUM — Claude's Discretion area; pattern is consistent but planner may adjust

**Research date:** 2026-04-28
**Valid until:** Until `@opencode-ai/sdk` is upgraded (currently pinned at 1.14.25 in package.json)
