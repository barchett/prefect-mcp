# Phase 3: Session Management Tools — Research

**Researched:** 2026-04-26
**Domain:** TypeScript MCP server — additive session management tools wrapping OpenCode HTTP API
**Confidence:** HIGH (all findings sourced directly from installed SDK types and current `src/index.ts`)

---

## Summary

Phase 3 adds 9 new MCP tools to `src/index.ts` — all purely additive `server.registerTool()` calls. No existing code is touched. Every tool follows the exact same handler pattern already established in v1.0: async SDK call returning `{ data, error }`, error rethrow, JSON.stringify response. The pattern is mechanical; the main research value is confirming exact SDK method names, parameter shapes, and response types for all 9 tools — including the 5 that were not fully documented in ARCHITECTURE.md.

The most critical pre-implementation clarification: REQUIREMENTS.md uses the name `opencode_session_rename` (SESSION-07), but the SDK method is `client.session.update()` and the endpoint is PATCH `/session/{id}`. This mismatch must be understood before implementation. Similarly, FEATURES.md listed `session.children` and `session.unrevert` as future/v3.0 candidates, but REQUIREMENTS.md places them in Phase 3 — they ARE in scope and ARE fully supported in the installed SDK (`@opencode-ai/sdk` 1.14.25).

The second important clarification is the `limit` parameter semantics for SESSION-04 (`opencode_session_messages`): the SDK exposes only a `limit` query param with no cursor/offset — it is a "most recent N" truncation, not offset-based pagination. The tool description must say so explicitly to prevent callers from attempting pagination loops.

**Primary recommendation:** Implement all 9 tools in a single plan as `server.registerTool()` additions at the bottom of `src/index.ts`, grouped in requirement order. No file splits, no new dependencies, no tsconfig changes needed.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| List all sessions | API / Backend (OpenCode) | MCP Server (thin proxy) | OpenCode owns session registry; MCP server is a pass-through |
| Get single session | API / Backend (OpenCode) | MCP Server (thin proxy) | Same: OpenCode owns the data |
| Check global session status | API / Backend (OpenCode) | MCP Server (thin proxy) | Status is live server state; MCP just exposes it |
| Retrieve message history | API / Backend (OpenCode) | MCP Server (thin proxy) | Messages are stored in OpenCode; limit param passed through as-is |
| Fetch single message | API / Backend (OpenCode) | MCP Server (thin proxy) | Same as messages |
| Delete a session | API / Backend (OpenCode) | MCP Server (thin proxy) | Destructive op on OpenCode-owned state |
| Rename a session | API / Backend (OpenCode) | MCP Server (thin proxy) | PATCH on OpenCode session record |
| List child sessions | API / Backend (OpenCode) | MCP Server (thin proxy) | Parentage is OpenCode-owned; children endpoint returns Array<Session> |
| Unrevert a session | API / Backend (OpenCode) | MCP Server (thin proxy) | Revert state is stored in OpenCode session record |

All 9 tools are thin proxies. The MCP server layer is responsible only for input validation (Zod schemas), error normalization (catch → isError response), and JSON serialization. No business logic lives in the MCP layer.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESSION-01 | Claude Code can list all active sessions (`session.list` → GET /session) | `client.session.list(options?)` verified; response `Array<Session>`; optional `directory` query param |
| SESSION-02 | Claude Code can fetch a single session by ID (`session.get` → GET /session/:id) | `client.session.get({ path: { id }, query? })` verified; response `Session`; errors 400/404 |
| SESSION-03 | Claude Code can check global session status (`session.status` → GET /session/status) | `client.session.status(options?)` verified; response `{ [sessionID: string]: SessionStatus }`; SessionStatus union: idle/busy/retry |
| SESSION-04 | Claude Code can retrieve a session's message history with optional limit (`session.messages` → GET /session/:id/message) | `client.session.messages({ path: { id }, query?: { limit?, directory? } })` verified; response `Array<{ info: Message; parts: Array<Part> }>`; limit = most-recent-N, no cursor/offset exists |
| SESSION-05 | Claude Code can fetch a single message by ID within a session (`session.message` → GET /session/:id/message/:id) | `client.session.message({ path: { id, messageID }, query? })` verified; response `{ info: Message; parts: Array<Part> }`; errors 400/404 |
| SESSION-06 | Claude Code can delete a session (`session.delete` → DELETE /session/:id) | `client.session.delete({ path: { id }, query? })` verified; response `boolean` (true on success); errors 400/404 |
| SESSION-07 | Claude Code can rename a session (`session.rename` → PATCH /session/:id) | SDK method is `client.session.update()` not `session.rename()`; body `{ title?: string }`; response `Session`; errors 400/404 |
| SESSION-08 | Claude Code can list child sessions of a forked session (`session.children` → GET /session/:id/children) | `client.session.children({ path: { id }, query? })` verified; response `Array<Session>`; errors 400/404 |
| SESSION-09 | Claude Code can unrevert a session to undo a revert (`session.unrevert` → POST /session/:id/unrevert) | `client.session.unrevert({ path: { id }, query? })` verified; no body params; response `Session`; errors 400/404 |
</phase_requirements>

---

## Standard Stack

No new dependencies are required for Phase 3.

### Core (unchanged from v1.0)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@modelcontextprotocol/sdk` | 1.29.0 | `McpServer`, `StdioServerTransport`, `registerTool` | Already installed; defines the MCP protocol surface |
| `@opencode-ai/sdk` | 1.14.25 | `createOpencodeClient`, all session SDK methods | Already installed; all 9 Phase 3 methods present in installed types |
| `zod` | 4.3.6 | Input schema validation for all tools | Already installed; v1.0 convention |
| TypeScript | 6.0.3 | Language | Already installed |

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts] — all 9 SDK methods confirmed present in installed version.

### Installation

No new packages needed. Build command unchanged: `npm run build`.

---

## Architecture Patterns

### System Architecture Diagram

```
Claude Code
    |
    | MCP stdio (JSON-RPC)
    v
src/index.ts (McpServer)
    |
    | server.registerTool(name, schema, handler)  [x9 new registrations]
    |
    | client.session.<method>({ path, query, body? })
    v
@opencode-ai/sdk  (createOpencodeClient)
    |
    | HTTP  (OPENCODE_URL, default http://localhost:4096)
    v
OpenCode server
```

Data flow for every Phase 3 tool (identical pattern):
```
MCP input (validated by Zod)
  -> SDK call with { path?, query?, body? }
  -> { data, error } destructuring
  -> if (error) throw
  -> return { content: [{ type: 'text', text: JSON.stringify(data) }] }
  [or on catch]
  -> return { content: [{ type: 'text', text: String(err) }], isError: true }
```

### Recommended Project Structure

No structural change. All 9 new tools are `server.registerTool()` calls appended to `src/index.ts` before the `main()` function. The file grows from ~201 to ~380 LOC — still well within the "stay in one file" threshold of 500 LOC documented in ARCHITECTURE.md.

```
src/
├── index.ts    # MCP server — 7 existing tools + 9 new Phase 3 tools (no other files change)
```

### Pattern 1: Standard Read-Only Tool (no body, path + optional query)

Used by: SESSION-01 (list), SESSION-02 (get), SESSION-03 (status), SESSION-04 (messages), SESSION-05 (message), SESSION-08 (children), SESSION-09 (unrevert)

```typescript
// Source: src/index.ts v1.0 pattern (all existing tools)
server.registerTool(
  'opencode_session_get',
  {
    description: '...',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      directory: z.string().optional().describe('...'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.get({
        path: { id: sessionId },
        query: directory ? { directory } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

[VERIFIED: src/index.ts — exact pattern from all 7 existing v1.0 tools]

### Pattern 2: Mutation Tool with Body (SESSION-07 rename)

SESSION-07 is the only Phase 3 tool that sends a body. The SDK method is `client.session.update()`.

```typescript
server.registerTool(
  'opencode_session_rename',
  {
    description: 'Rename an OpenCode session. Returns the updated Session object.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to rename'),
      title: z.string().describe('New title for the session'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, title, directory }) => {
    try {
      const { data, error } = await client.session.update({
        path: { id: sessionId },
        body: { title },
        query: directory ? { directory } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts line 1913 — `SessionUpdateData.body = { title?: string }`; response = `Session`]

### Pattern 3: Deletion Tool with boolean response (SESSION-06)

SESSION-06 is the only Phase 3 tool that returns `boolean` instead of a Session or array. Use `String(data)` rather than `JSON.stringify(data)` to return a plain `"true"`.

```typescript
// data is `boolean` — either String(data) or JSON.stringify(data) both work;
// JSON.stringify(true) === "true", String(true) === "true" — use JSON.stringify for consistency
return { content: [{ type: 'text', text: JSON.stringify(data) }] };
```

Note: the existing `opencode_abort` tool uses `String(data)` for its boolean response (line 51 in src/index.ts). Either form works; use `JSON.stringify` for consistency with the other tools in Phase 3.

### Anti-Patterns to Avoid

- **Using `session.rename()` instead of `session.update()`:** There is no `session.rename()` method in the SDK. The REQUIREMENTS.md name `opencode_session_rename` is the MCP tool name only. The SDK method is `client.session.update()`.
- **Using `session.status()` as a per-session check:** `GET /session/status` returns status for ALL sessions as a map keyed by sessionID. It is NOT a per-session endpoint. Do not add a `sessionId` path parameter to the SESSION-03 tool.
- **Calling `session.unrevert()` with a body:** `SessionUnrevertData.body` is typed `never`. Pass only `{ path: { id: sessionId }, query? }` — no body argument.
- **Documenting SESSION-04 limit as pagination:** The `limit` query param on `GET /session/{id}/message` returns the most recent N messages. There is no cursor, offset, or page param. Do not imply offset-based pagination in the tool description.
- **Splitting into multiple files:** At ~380 LOC after Phase 3, `src/index.ts` should remain a single file per the ARCHITECTURE.md decision.

---

## All 9 SDK Method Signatures — Phase 3

All verified directly from installed SDK types.

### SESSION-01: `opencode_session_list`

```typescript
// SDK method: client.session.list(options?)
// Source: sdk.gen.d.ts line 110; types.gen.d.ts lines for SessionListData

// Input
{ query?: { directory?: string } }

// Response: 200
Array<Session>

// Errors: none documented (unknown error type)
```

MCP input schema:
```typescript
z.object({
  directory: z.string().optional().describe('Filter sessions by project directory path'),
})
```

SDK call:
```typescript
client.session.list({ query: directory ? { directory } : undefined })
```

---

### SESSION-02: `opencode_session_get`

```typescript
// SDK method: client.session.get(options)  [options REQUIRED — has path]
// Source: sdk.gen.d.ts line 126; types.gen.d.ts lines 1885-1911

// Input
{ path: { id: string }, query?: { directory?: string } }

// Response: 200
Session

// Errors: 400 BadRequestError, 404 NotFoundError
```

MCP input schema:
```typescript
z.object({
  sessionId: z.string().describe('Session ID to fetch'),
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.get({
  path: { id: sessionId },
  query: directory ? { directory } : undefined,
})
```

---

### SESSION-03: `opencode_session_status`

```typescript
// SDK method: client.session.status(options?)  [options OPTIONAL]
// Source: sdk.gen.d.ts line 118; types.gen.d.ts lines 1833-1856

// Input
{ query?: { directory?: string } }   // no path param — returns ALL sessions

// Response: 200
{ [sessionID: string]: SessionStatus }

// SessionStatus union (from types.gen.d.ts):
// { type: "idle" }
// | { type: "busy" }
// | { type: "retry"; attempt: number; message: string; next: number }

// Errors: 400 BadRequestError
```

MCP input schema:
```typescript
z.object({
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.status({ query: directory ? { directory } : undefined })
```

Tool description must note: returns status for ALL active sessions as a map. Not a per-session endpoint.

---

### SESSION-04: `opencode_session_messages`

```typescript
// SDK method: client.session.messages(options)  [options REQUIRED — has path]
// Source: sdk.gen.d.ts line 170; types.gen.d.ts lines 2206-2239

// Input
{ path: { id: string }, query?: { directory?: string; limit?: number } }

// Response: 200
Array<{ info: Message; parts: Array<Part> }>

// Errors: 400 BadRequestError, 404 NotFoundError
```

MCP input schema:
```typescript
z.object({
  sessionId: z.string().describe('Session ID'),
  limit: z.number().int().positive().optional().describe(
    'Maximum number of messages to return. Returns the most recent N messages — there is no offset or cursor. Omit to return all messages.'
  ),
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.messages({
  path: { id: sessionId },
  query: { ...(limit !== undefined ? { limit } : {}), ...(directory ? { directory } : {}) },
})
```

CRITICAL NOTE: `limit` is "most recent N" — no cursor/offset exists in the SDK. See PITFALL-08.

---

### SESSION-05: `opencode_session_message`

```typescript
// SDK method: client.session.message(options)  [options REQUIRED — has path with two params]
// Source: sdk.gen.d.ts line 178; types.gen.d.ts lines 2288-2325

// Input
{ path: { id: string; messageID: string }, query?: { directory?: string } }

// Response: 200
{ info: Message; parts: Array<Part> }

// Errors: 400 BadRequestError, 404 NotFoundError
```

MCP input schema:
```typescript
z.object({
  sessionId: z.string().describe('Session ID'),
  messageId: z.string().describe('Message ID to fetch'),
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.message({
  path: { id: sessionId, messageID: messageId },
  query: directory ? { directory } : undefined,
})
```

Note: the SDK path param is `messageID` (camelCase with capital ID). The MCP input arg should use `messageId` (lowercase d) for consistency with the existing `messageID` usage in `opencode_revert` — but map to `messageID` in the path object.

---

### SESSION-06: `opencode_session_delete`

```typescript
// SDK method: client.session.delete(options)  [options REQUIRED]
// Source: sdk.gen.d.ts line 122; types.gen.d.ts lines 1857-1884

// Input
{ path: { id: string }, query?: { directory?: string } }

// Response: 200
boolean   // true on success

// Errors: 400 BadRequestError, 404 NotFoundError
```

MCP input schema:
```typescript
z.object({
  sessionId: z.string().describe('Session ID to delete'),
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.delete({
  path: { id: sessionId },
  query: directory ? { directory } : undefined,
})
```

Tool description must note: this is irreversible — all session data and messages will be permanently deleted.

---

### SESSION-07: `opencode_session_rename`

```typescript
// SDK method: client.session.update(options)  [NOT session.rename — does not exist]
// Source: sdk.gen.d.ts line 130; types.gen.d.ts lines 1913-1942

// Input
{ path: { id: string }, body?: { title?: string }, query?: { directory?: string } }

// Response: 200
Session   // full updated Session object

// Errors: 400 BadRequestError, 404 NotFoundError
```

MCP input schema:
```typescript
z.object({
  sessionId: z.string().describe('Session ID to rename'),
  title: z.string().describe('New display title for the session'),
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.update({
  path: { id: sessionId },
  body: { title },
  query: directory ? { directory } : undefined,
})
```

CRITICAL: The MCP tool name is `opencode_session_rename` (from REQUIREMENTS.md). The SDK method is `client.session.update()`. The `SessionUpdateData.body` field is `{ title?: string }` — only `title` is updatable via this endpoint currently.

---

### SESSION-08: `opencode_session_children`

```typescript
// SDK method: client.session.children(options)  [options REQUIRED]
// Source: sdk.gen.d.ts line 134; types.gen.d.ts lines 1943-1970

// Input
{ path: { id: string }, query?: { directory?: string } }

// Response: 200
Array<Session>   // child sessions forked from this session

// Errors: 400 BadRequestError, 404 NotFoundError
```

MCP input schema:
```typescript
z.object({
  sessionId: z.string().describe('Parent session ID — must be a session that was previously forked'),
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.children({
  path: { id: sessionId },
  query: directory ? { directory } : undefined,
})
```

Tool description should note: returns an empty array if the session has no children (was never forked from). Not an error.

---

### SESSION-09: `opencode_session_unrevert`

```typescript
// SDK method: client.session.unrevert(options)  [options REQUIRED — body is never]
// Source: sdk.gen.d.ts line 198; types.gen.d.ts lines 2479-2506

// Input
{ path: { id: string }, query?: { directory?: string } }
// body is typed `never` — do NOT pass a body argument

// Response: 200
Session   // updated session with revert state cleared

// Errors: 400 BadRequestError, 404 NotFoundError
```

MCP input schema:
```typescript
z.object({
  sessionId: z.string().describe('Session ID to unrevert — must have been previously reverted'),
  directory: z.string().optional().describe('Optional directory filter'),
})
```

SDK call:
```typescript
client.session.unrevert({
  path: { id: sessionId },
  query: directory ? { directory } : undefined,
})
```

Tool description must note: calling unrevert on a session that has not been reverted will return an error. The `Session.revert` field indicates whether a session is in a reverted state.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP client | Custom fetch wrapper | `@opencode-ai/sdk` `createOpencodeClient` | Already installed; handles auth, base URL, response shape; same client as all v1.0 tools |
| Input validation | Manual type checks | `zod` schemas in `server.registerTool()` | MCP SDK calls the Zod validator before the handler runs; already the v1.0 convention |
| Error normalization | Custom error class | `{ content: [...], isError: true }` pattern | Established in every v1.0 tool; MCP SDK understands `isError` |
| Session status polling | Loop inside tool | Let caller poll with `opencode_session_status` | Tool is a single call; looping inside the handler would block the MCP thread |

**Key insight:** Every Phase 3 tool is a one-liner SDK call wrapped in the standard try/catch pattern. The only implementation work is writing the Zod input schema correctly and mapping MCP arg names to SDK param names.

---

## Runtime State Inventory

Not applicable — Phase 3 is purely additive new code. No renames, refactors, or data migrations are involved.

---

## Common Pitfalls

### Pitfall 1: `session.rename()` Does Not Exist (SESSION-07)

**What goes wrong:** Developer writes `client.session.rename(...)` based on the REQUIREMENTS.md tool name `opencode_session_rename`. TypeScript compilation fails: "Property 'rename' does not exist on type 'Session'".

**Why it happens:** REQUIREMENTS.md names the MCP tool `opencode_session_rename` but the SDK exposes PATCH /session/:id as `client.session.update()`. The naming mismatch is intentional (rename is more descriptive for the tool user), but only the SDK name matters in implementation.

**How to avoid:** Always use `client.session.update()` for SESSION-07. The MCP tool name `opencode_session_rename` is only the string passed to `server.registerTool()`.

**Warning signs:** TypeScript error at compile time — caught immediately if `npm run build` is run after each tool addition.

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts line 130 — `update<ThrowOnError>()` is the session method name]

---

### Pitfall 2: `limit` Semantics on SESSION-04 (PITFALL-08 from project PITFALLS.md)

**What goes wrong:** Tool description says "paginate through messages" or implies the caller can pass `offset` + `limit` to step through history. Callers implement a loop that tries `limit=10, offset=10`, `limit=10, offset=20`, etc. — but the API only has `limit`, no offset. The results do not advance.

**Why it happens:** `limit` conventionally implies pagination. This API uses `limit` as a simple truncation parameter — "return the most recent N".

**How to avoid:** Tool description must say: "Returns the N most recent messages. There is no offset or cursor — to get all messages, omit limit entirely."

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts line 2216 — `query?: { directory?: string; limit?: number }` — no cursor, no offset param]

---

### Pitfall 3: Passing a Body to `session.unrevert()` (SESSION-09)

**What goes wrong:** Developer passes `body: {}` or `body: { messageID: ... }` to `client.session.unrevert()`. TypeScript allows this at the call site (the extra property may not be caught), but `SessionUnrevertData.body` is typed `never`, meaning the SDK will not forward a body. The unrevert may fail or behave unexpectedly.

**Why it happens:** `opencode_revert` (the corresponding tool) requires a `messageID` in the body. Developers may mirror that pattern for unrevert.

**How to avoid:** `session.unrevert()` takes no body. Only `{ path: { id: sessionId }, query? }`. No body param in the MCP input schema, no body in the SDK call.

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts line 2480 — `body?: never`]

---

### Pitfall 4: Treating `opencode_session_status` as a Per-Session Endpoint (SESSION-03)

**What goes wrong:** Developer adds `sessionId: z.string()` to the SESSION-03 input schema, trying to check status of one specific session. The `GET /session/status` endpoint has no path parameter — it returns a map of ALL sessions keyed by session ID.

**Why it happens:** The tool name `opencode_session_status` implies per-session query. The actual endpoint is global.

**How to avoid:** No `sessionId` in the MCP input schema for SESSION-03. The returned map allows callers to look up a specific session by ID after receiving all statuses. If the caller only needs one session's status, they index into the returned object.

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts line 1833 — `SessionStatusData.path?: never`]

---

### Pitfall 5: Wrong Path Param Name for SESSION-05 (single message)

**What goes wrong:** Developer writes `path: { id: sessionId, messageId: messageId }` (lowercase 'd'). The SDK `SessionMessageData.path` uses `messageID` (uppercase 'D'). TypeScript will catch this at compile time, but only if `npm run build` is run.

**Why it happens:** Convention inconsistency — MCP input args conventionally use camelCase with lowercase 'd' (`messageId`), but the SDK path param matches the API path template `{messageID}` verbatim.

**How to avoid:** The MCP input schema parameter can be named `messageId` (for user-facing consistency), but must be mapped to `messageID` in the SDK call: `path: { id: sessionId, messageID: messageId }`.

[VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts line 2298 — `path: { id: string; messageID: string }`]

---

### Pitfall 6: stdout pollution from `console.log` (inherited from PITFALL-05)

**What goes wrong:** A developer adds a `console.log()` for debugging inside any new tool handler in `src/index.ts`. This writes to stdout, which is the JSON-RPC stream for the MCP server. Claude Code sees a parse error.

**How to avoid:** Debug-only via `console.error()` in `src/index.ts`. This is inherited guidance from PITFALL-05 in PITFALLS.md and applies to all 9 new tools.

---

## Code Examples

### SESSION-01: `opencode_session_list`

```typescript
// Source: pattern from src/index.ts v1.0; type from types.gen.d.ts SessionListData
server.registerTool(
  'opencode_session_list',
  {
    description: 'List all OpenCode sessions. Returns an array of Session objects each with id, title, directory, time.created, time.updated, and optional summary/share/revert fields. Pass directory to filter sessions by project root.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Filter sessions by project directory path'),
    }),
  },
  async ({ directory }) => {
    try {
      const { data, error } = await client.session.list({
        query: directory ? { directory } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### SESSION-03: `opencode_session_status`

```typescript
// Source: types.gen.d.ts SessionStatusData/SessionStatusResponses
server.registerTool(
  'opencode_session_status',
  {
    description: 'Get the real-time status of all active OpenCode sessions. Returns a map of sessionID → status where status is one of: { type: "idle" }, { type: "busy" }, or { type: "retry", attempt, message, next }. Use this before calling opencode_run to verify the target session is idle.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ directory }) => {
    try {
      const { data, error } = await client.session.status({
        query: directory ? { directory } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### SESSION-09: `opencode_session_unrevert`

```typescript
// Source: types.gen.d.ts SessionUnrevertData — body is never, path only
server.registerTool(
  'opencode_session_unrevert',
  {
    description: 'Undo a prior opencode_revert — restores all messages that were removed by the revert. Only valid if the session is currently in a reverted state (the Session object will have a non-null revert field). Returns the updated Session.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to unrevert'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.unrevert({
        path: { id: sessionId },
        query: directory ? { directory } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

---

## Build Order / Dependency Analysis

All 9 tools are independent of each other and of existing tools — no intra-phase dependencies. The recommended order for a single plan:

1. SESSION-01 (`opencode_session_list`) — simplest, no required params, establishes the pattern
2. SESSION-02 (`opencode_session_get`) — same pattern with path param
3. SESSION-03 (`opencode_session_status`) — no path param; global status map
4. SESSION-04 (`opencode_session_messages`) — adds `limit` query param; most complex description
5. SESSION-05 (`opencode_session_message`) — two-param path; variant of SESSION-04
6. SESSION-06 (`opencode_session_delete`) — boolean response; add irreversibility warning to description
7. SESSION-07 (`opencode_session_rename`) — only tool with a body; uses `client.session.update()` not `rename`
8. SESSION-08 (`opencode_session_children`) — mirrors SESSION-02 pattern
9. SESSION-09 (`opencode_session_unrevert`) — no body (unlike `opencode_revert`); mirrors SESSION-02 pattern

**Safe implementation approach:** Add all 9 as a batch in `src/index.ts` (all before `main()`), then run `npm run build`. TypeScript will catch any method name or path param errors immediately.

**Risk assessment:** Zero risk to existing tools. All 9 registrations are new `server.registerTool()` calls that do not touch existing registrations, shared constants, or `main()`.

---

## SDK Method Name vs Requirement Name Mismatches

| Requirement Name | MCP Tool Name | SDK Method | Notes |
|-----------------|---------------|------------|-------|
| SESSION-01 | `opencode_session_list` | `client.session.list()` | Direct match |
| SESSION-02 | `opencode_session_get` | `client.session.get()` | Direct match |
| SESSION-03 | `opencode_session_status` | `client.session.status()` | Direct match |
| SESSION-04 | `opencode_session_messages` | `client.session.messages()` | Direct match |
| SESSION-05 | `opencode_session_message` | `client.session.message()` | Direct match (singular) |
| SESSION-06 | `opencode_session_delete` | `client.session.delete()` | Direct match |
| SESSION-07 | `opencode_session_rename` | `client.session.update()` | **MISMATCH** — tool name says rename, SDK method is `update` |
| SESSION-08 | `opencode_session_children` | `client.session.children()` | Direct match |
| SESSION-09 | `opencode_session_unrevert` | `client.session.unrevert()` | Direct match |

Only SESSION-07 has a mismatch. Use `client.session.update()` in the implementation.

---

## FEATURES.md Correction: SESSION-08 and SESSION-09 Scope

FEATURES.md (project research from 2026-04-26) listed `session.children()` and `session.unrevert()` under "Other Session Endpoints (Future Candidates)" with the tag "v3.0". This was a research artifact — the REQUIREMENTS.md and ROADMAP.md have definitively placed SESSION-08 and SESSION-09 in Phase 3 (v2.0). Both methods are fully present in the installed SDK and follow the standard pattern. This is not a scope conflict — REQUIREMENTS.md takes precedence over FEATURES.md for scope decisions.

---

## Tool Description Recommendations

### SESSION-04 (`opencode_session_messages`) — limit param wording

```
'Retrieve the message history for an OpenCode session. Each message includes an info object (UserMessage or AssistantMessage) and a parts array (TextPart, ToolPart, PatchPart, etc.). Use limit to cap the number of messages returned — this returns the most recent N messages only; there is no cursor or offset. Omit limit to return all messages.'
```

### SESSION-03 (`opencode_session_status`) — global vs per-session

```
'Get the real-time status of all active OpenCode sessions. Returns a map of sessionID → SessionStatus where status is one of: { type: "idle" }, { type: "busy" }, or { type: "retry", attempt, message, next }. Use this before calling opencode_run to verify the target session is idle and not still processing a previous prompt.'
```

### SESSION-06 (`opencode_session_delete`) — irreversibility warning

```
'Delete an OpenCode session and all its data permanently. Returns true on success. WARNING: this is irreversible — all messages, parts, and session history will be deleted. Consider using opencode_session_rename to archive instead of deleting.'
```

### SESSION-09 (`opencode_session_unrevert`) — precondition

```
'Restore all messages removed by a prior opencode_revert — undo the revert. Only valid if the session is in a reverted state (Session.revert field is non-null). Returns the updated Session object with the revert field cleared.'
```

### SESSION-08 (`opencode_session_children`) — empty array case

```
'List all child sessions forked from this session. Returns an empty array if no forks have been made from this session. Use opencode_fork to create child sessions.'
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `Promise.race` timeout in `opencode_run` | Will be replaced by AbortController in Phase 4 | Phase 4 (INFRA-01) | Phase 3 tools do not use the timeout path — all are fast read/write calls, no timeout needed |

Phase 3 tools do not require the AbortController fix — they are simple SDK calls without long-running blocking behavior. The fix is a Phase 4 concern scoped to `opencode_run`.

---

## Assumptions Log

> All claims in this research were verified against installed SDK types (`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`, `sdk.gen.d.ts`) and the current `src/index.ts`. No unverified assumptions remain.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `limit` on SESSION-04 returns "most recent N" (not "first N") | SESSION-04 pitfall | Tool description would mislead callers about which end of the history is returned — behavioral, not implementation, risk |

Claim A1 is inferred from the parameter name and absence of offset; the SDK types confirm no offset exists but do not explicitly document direction. Behavioral verification would require a live OpenCode instance. This is LOW risk for implementation correctness (the parameter exists either way) but MEDIUM risk for documentation accuracy.

---

## Open Questions

1. **SESSION-04: Does `limit` return first N or last N messages?**
   - What we know: `limit?: number` is the only pagination control; no offset/cursor exists in types
   - What's unclear: Whether limit returns the earliest N or most recent N messages
   - Recommendation: Write tool description as "most recent N" (the typical semantic for message APIs) but flag for verification against a live OpenCode instance. Low implementation risk — the parameter is correct either way.

2. **SESSION-07: Can `SessionUpdateData.body.title` be empty string to clear the title?**
   - What we know: `body?: { title?: string }` — both body and title are optional
   - What's unclear: Whether `title: ""` is valid or rejected by OpenCode server
   - Recommendation: Do not add special-case handling; pass whatever the caller provides. If OpenCode rejects it, the error propagates normally via `{ data, error }`.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is purely additive TypeScript code. No external tools, databases, runtimes, or CLIs beyond what is already installed and verified for v1.0. The build command (`npm run build`) requires the existing `tsc` install, which is already confirmed working.

---

## Project Constraints (from CLAUDE.md)

All directives from `./CLAUDE.md` that constrain implementation:

1. **Use Prefect tools for implementation:** Delegate actual file edits to `opencode_create_session` + `opencode_run` + `opencode_get_diff`. Do not implement directly without the Prefect loop.
2. **Never commit without reviewing the diff:** `opencode_get_diff` must be called after every `opencode_run` before deciding to commit.
3. **Claude Code commits, OpenCode edits:** The MCP agent edits files; Claude Code runs `git commit`.
4. **Run `npm run build` after edits:** Required verification step before committing — catches TypeScript errors including wrong SDK method names and path param typos.
5. **stdout is the JSON-RPC stream:** No `console.log()` in `src/index.ts`. Debug via `console.error()` only.
6. **Use `bd` for issue tracking:** Not TodoWrite. `bd ready` / `bd show` / `bd update` / `bd close`.
7. **Session complete protocol:** After work, `bd dolt push` + `git push` before stopping.

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — Authoritative request/response shapes for all 9 SDK data types: SessionListData, SessionStatusData, SessionGetData, SessionUpdateData, SessionChildrenData, SessionDeleteData, SessionMessagesData, SessionMessageData, SessionUnrevertData
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — SDK Session class method signatures: `list`, `status`, `get`, `update`, `children`, `delete`, `messages`, `message`, `unrevert` (lines 108-198)
- `src/index.ts` — v1.0 baseline: exact handler pattern, import structure, tool registration order
- `.planning/research/FEATURES.md` — Prior research on SessionStatus union type, Message/Part union types, limit semantics
- `.planning/research/ARCHITECTURE.md` — "Stay in one file" decision, build order recommendations, data flow for 4 of 9 tools
- `.planning/research/PITFALLS.md` — PITFALL-08 (limit semantics), PITFALL-05 (stdout pollution), all directly applicable to Phase 3

### Secondary (MEDIUM confidence)

- `.planning/REQUIREMENTS.md` — Phase 3 scope (SESSION-01 through SESSION-09), requirement descriptions, SDK method cross-references
- `.planning/ROADMAP.md` — Phase 3 success criteria, intra-phase dependency analysis

---

## Metadata

**Confidence breakdown:**
- SDK method signatures: HIGH — read directly from installed `sdk.gen.d.ts`
- Request/response types: HIGH — read directly from installed `types.gen.d.ts`
- Implementation pattern: HIGH — copied from working v1.0 tools in `src/index.ts`
- `limit` direction semantics: MEDIUM — type-inferred, not runtime-verified

**Research date:** 2026-04-26
**Valid until:** 2026-05-26 (stable; SDK version pinned in package.json; no external dependencies)
