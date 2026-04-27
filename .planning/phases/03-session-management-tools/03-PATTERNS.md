# Phase 3: Session Management Tools — Pattern Map

**Mapped:** 2026-04-26
**Files analyzed:** 1 (src/index.ts — modified with 9 additive registerTool calls)
**Analogs found:** 9 / 9 (all from within src/index.ts itself)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` (SESSION-01 `opencode_session_list`) | tool-registration | request-response | `opencode_abort` (lines 39-56) — simplest pattern, no body | exact |
| `src/index.ts` (SESSION-02 `opencode_session_get`) | tool-registration | request-response | `opencode_get_diff` (lines 89-110) — path param + optional query | exact |
| `src/index.ts` (SESSION-03 `opencode_session_status`) | tool-registration | request-response | `opencode_abort` (lines 39-56) — no path param, optional query only | exact |
| `src/index.ts` (SESSION-04 `opencode_session_messages`) | tool-registration | request-response | `opencode_get_diff` (lines 89-110) — path param + optional multi-key query | exact |
| `src/index.ts` (SESSION-05 `opencode_session_message`) | tool-registration | request-response | `opencode_get_diff` (lines 89-110) — path param + optional query | exact |
| `src/index.ts` (SESSION-06 `opencode_session_delete`) | tool-registration | request-response | `opencode_abort` (lines 39-56) — boolean response, path param | exact |
| `src/index.ts` (SESSION-07 `opencode_session_rename`) | tool-registration | request-response | `opencode_create_session` (lines 15-36) — has body; uses `client.session.update()` | exact |
| `src/index.ts` (SESSION-08 `opencode_session_children`) | tool-registration | request-response | `opencode_get_diff` (lines 89-110) — path param + optional query, array response | exact |
| `src/index.ts` (SESSION-09 `opencode_session_unrevert`) | tool-registration | request-response | `opencode_abort` (lines 39-56) — path param, no body (unlike opencode_revert) | exact |

All 9 tools are purely additive `server.registerTool()` calls inserted before `main()` in `src/index.ts`.

---

## Pattern Assignments

### Universal Handler Pattern

Every tool in v1.0 and every Phase 3 tool uses exactly this structure. The only variation is in the SDK call arguments.

**Source:** `src/index.ts` — `opencode_abort` (lines 39-56), the simplest example

```typescript
server.registerTool(
  '<tool_name>',
  {
    description: '<description>',
    inputSchema: z.object({
      // ... zod fields
    }),
  },
  async ({ /* destructured MCP args */ }) => {
    try {
      const { data, error } = await client.session.<method>({ /* path, query, body */ });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

---

### SESSION-01: `opencode_session_list` (no required params)

**Analog:** `opencode_create_session` (lines 15-36) for the query-only call shape; `opencode_abort` (lines 39-56) for simplicity

**Imports pattern** — no new imports needed (lines 1-10 of src/index.ts):
```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';
```

**Core pattern** — optional query, array response:
```typescript
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

SDK call: `client.session.list({ query?: { directory? } })`
Response type: `Array<Session>`

---

### SESSION-02: `opencode_session_get` (path param + optional query)

**Analog:** `opencode_get_diff` (lines 89-110) — identical shape: path param + optional query param

**Core pattern** (copy `opencode_get_diff` lines 89-110, substitute method):
```typescript
server.registerTool(
  'opencode_session_get',
  {
    description: 'Fetch a single OpenCode session by ID. Returns the full Session object including id, title, directory, parentID (if forked), and revert state.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to fetch'),
      directory: z.string().optional().describe('Optional directory filter'),
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

SDK call: `client.session.get({ path: { id: sessionId }, query?: { directory? } })`
Response type: `Session`
Errors: 400, 404

---

### SESSION-03: `opencode_session_status` (global endpoint, no path param)

**Analog:** `opencode_abort` (lines 39-56) — no body needed; `opencode_create_session` (lines 15-36) for the query-only shape

**Critical constraint:** No `sessionId` in the input schema. This is a global endpoint returning a map keyed by session ID.

**Core pattern:**
```typescript
server.registerTool(
  'opencode_session_status',
  {
    description: 'Get the real-time status of all active OpenCode sessions. Returns a map of sessionID → SessionStatus where status is one of: { type: "idle" }, { type: "busy" }, or { type: "retry", attempt, message, next }. Use this before calling opencode_run to verify the target session is idle and not still processing a previous prompt.',
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

SDK call: `client.session.status({ query?: { directory? } })`
Response type: `{ [sessionID: string]: SessionStatus }`
Errors: 400

---

### SESSION-04: `opencode_session_messages` (path + multi-key query)

**Analog:** `opencode_get_diff` (lines 89-110) — same path + query shape; `opencode_revert` (lines 167-189) for the spread-based optional body pattern (apply same technique to query)

**Special:** `limit` is a second query key alongside `directory`. Use spread to build the query object conditionally.

**Core pattern:**
```typescript
server.registerTool(
  'opencode_session_messages',
  {
    description: 'Retrieve the message history for an OpenCode session. Each message includes an info object (UserMessage or AssistantMessage) and a parts array (TextPart, ToolPart, PatchPart, etc.). Use limit to cap the number of messages returned — this returns the most recent N messages only; there is no cursor or offset. Omit limit to return all messages.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      limit: z.number().int().positive().optional().describe(
        'Maximum number of messages to return. Returns the most recent N messages — there is no offset or cursor. Omit to return all messages.'
      ),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, limit, directory }) => {
    try {
      const { data, error } = await client.session.messages({
        path: { id: sessionId },
        query: { ...(limit !== undefined ? { limit } : {}), ...(directory ? { directory } : {}) },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Spread pattern for optional query keys** — derived from `opencode_revert` lines 179-182:
```typescript
// opencode_revert analog for conditional object spread:
body: { messageID, ...(partID ? { partID } : {}) }
// Apply same pattern to query in SESSION-04:
query: { ...(limit !== undefined ? { limit } : {}), ...(directory ? { directory } : {}) }
```

SDK call: `client.session.messages({ path: { id }, query?: { directory?, limit? } })`
Response type: `Array<{ info: Message; parts: Array<Part> }>`
Errors: 400, 404

---

### SESSION-05: `opencode_session_message` (two-param path)

**Analog:** `opencode_get_diff` (lines 89-110) — path + optional query; extended to two-key path

**Critical:** SDK path param is `messageID` (capital D). MCP input uses `messageId` (lowercase d) for user-facing consistency, mapped to `messageID` in the SDK call.

**Core pattern:**
```typescript
server.registerTool(
  'opencode_session_message',
  {
    description: 'Fetch a single message by ID within an OpenCode session. Returns the message info and all its parts (TextPart, ToolPart, PatchPart, etc.).',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageId: z.string().describe('Message ID to fetch'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, messageId, directory }) => {
    try {
      const { data, error } = await client.session.message({
        path: { id: sessionId, messageID: messageId },  // note: messageID (capital D) in SDK
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

**Two-path-param pattern reference** — `opencode_approve_permission` (lines 115-140):
```typescript
// src/index.ts lines 130-133
const { data, error } = await client.postSessionIdPermissionsPermissionId({
  path: { id: sessionId, permissionID: permissionId },
  body: { response },
});
```

SDK call: `client.session.message({ path: { id: string; messageID: string }, query?: { directory? } })`
Response type: `{ info: Message; parts: Array<Part> }`
Errors: 400, 404

---

### SESSION-06: `opencode_session_delete` (boolean response)

**Analog:** `opencode_abort` (lines 39-56) — boolean response; but `JSON.stringify(data)` is preferred over `String(data)` for consistency with other Phase 3 tools

**Core pattern:**
```typescript
server.registerTool(
  'opencode_session_delete',
  {
    description: 'Delete an OpenCode session and all its data permanently. Returns true on success. WARNING: this is irreversible — all messages, parts, and session history will be deleted. Consider using opencode_session_rename to archive instead of deleting.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to delete'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.delete({
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

**Boolean response reference** — `opencode_abort` lines 49-51:
```typescript
const { data, error } = await client.session.abort({ path: { id: sessionId } });
if (error) throw new Error(JSON.stringify(error));
return { content: [{ type: 'text', text: String(data) }] };
// Phase 3 uses JSON.stringify(data) for consistency — both produce "true"
```

SDK call: `client.session.delete({ path: { id }, query?: { directory? } })`
Response type: `boolean` — `JSON.stringify(true)` === `"true"`
Errors: 400, 404

---

### SESSION-07: `opencode_session_rename` (body mutation — uses client.session.update())

**Analog:** `opencode_create_session` (lines 15-36) — only existing v1.0 tool that sends a request body with a simple object shape

**Critical:** MCP tool name is `opencode_session_rename`. SDK method is `client.session.update()` — NOT `client.session.rename()` (does not exist).

**Core pattern:**
```typescript
server.registerTool(
  'opencode_session_rename',
  {
    description: 'Rename an OpenCode session. Returns the full updated Session object.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to rename'),
      title: z.string().describe('New display title for the session'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, title, directory }) => {
    try {
      const { data, error } = await client.session.update({  // NOT client.session.rename
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

**Body pattern reference** — `opencode_create_session` lines 24-31:
```typescript
const { data, error } = await client.session.create({
  body: { title },
  query: directory ? { directory } : undefined,
});
```

SDK call: `client.session.update({ path: { id }, body: { title? }, query?: { directory? } })`
Response type: `Session`
Errors: 400, 404

---

### SESSION-08: `opencode_session_children` (path + optional query, array response)

**Analog:** `opencode_get_diff` (lines 89-110) — identical call shape to SESSION-02; returns array

**Core pattern:**
```typescript
server.registerTool(
  'opencode_session_children',
  {
    description: 'List all child sessions forked from this session. Returns an empty array if no forks have been made from this session. Use opencode_fork to create child sessions.',
    inputSchema: z.object({
      sessionId: z.string().describe('Parent session ID — must be a session that was previously forked from'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.children({
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

SDK call: `client.session.children({ path: { id }, query?: { directory? } })`
Response type: `Array<Session>`
Errors: 400, 404

---

### SESSION-09: `opencode_session_unrevert` (path only, no body)

**Analog:** `opencode_abort` (lines 39-56) — path param only, no body; contrast with `opencode_revert` (lines 167-189) which DOES have a body — do NOT mirror that pattern here

**Critical:** `SessionUnrevertData.body` is typed `never`. Do not pass a body argument. Do not add `messageID` to the input schema (a common mistake from mirroring `opencode_revert`).

**Core pattern:**
```typescript
server.registerTool(
  'opencode_session_unrevert',
  {
    description: 'Restore all messages removed by a prior opencode_revert — undo the revert. Only valid if the session is in a reverted state (Session.revert field is non-null). Returns the updated Session object with the revert field cleared.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to unrevert — must have been previously reverted'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.unrevert({
        path: { id: sessionId },
        query: directory ? { directory } : undefined,
        // NO body — SessionUnrevertData.body is typed `never`
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

**Contrast with opencode_revert** (lines 179-182) — do NOT follow this body pattern for SESSION-09:
```typescript
// opencode_revert has a body — SESSION-09 must NOT:
const { data, error } = await client.session.revert({
  path: { id: sessionId },
  body: { messageID, ...(partID ? { partID } : {}) },  // <-- SESSION-09 has NO body
});
```

SDK call: `client.session.unrevert({ path: { id }, query?: { directory? } })`
Response type: `Session`
Errors: 400, 404

---

## Shared Patterns

### Error Handling
**Source:** Every tool in `src/index.ts` (lines 30-34, 50-54, 80-84, 105-109, etc.)
**Apply to:** All 9 new tools
```typescript
try {
  const { data, error } = await client.session.<method>(...);
  if (error) throw new Error(JSON.stringify(error));
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

### Optional Query Pattern
**Source:** `opencode_get_diff` (lines 100-103), `opencode_create_session` (lines 26-29)
**Apply to:** SESSION-01, SESSION-02, SESSION-03, SESSION-06, SESSION-07, SESSION-08, SESSION-09
```typescript
query: directory ? { directory } : undefined,
```

### Multi-Key Optional Query (spread)
**Source:** `opencode_revert` lines 181 (spread pattern for optional body keys)
**Apply to:** SESSION-04 only (has both `limit` and `directory` as optional query keys)
```typescript
query: { ...(limit !== undefined ? { limit } : {}), ...(directory ? { directory } : {}) },
```

### Body Mutation Pattern
**Source:** `opencode_create_session` (lines 26-29), `opencode_revert` (lines 179-182)
**Apply to:** SESSION-07 only (the only Phase 3 tool with a request body)
```typescript
body: { title },
```

### stdout Safety Rule
**Source:** `src/index.ts` line 195
**Apply to:** All 9 new tools (any debugging added during implementation)
```typescript
// NEVER console.log() — corrupts JSON-RPC stream
console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);
```

### Insertion Point
**Source:** `src/index.ts` lines 167-198
**Apply to:** All 9 new tools — insert before `async function main()` at line 191
```typescript
// All new server.registerTool() calls go HERE, before main()

async function main() {
```

---

## No Analog Found

None. All 9 tools follow patterns already present in `src/index.ts` v1.0. The four sub-patterns (read-only, multi-key query, body mutation, boolean response) are all represented by existing tools.

---

## SDK Method Name Reference (Critical for Planner)

| MCP Tool Name | SDK Method | Anti-pattern to Avoid |
|---------------|-----------|----------------------|
| `opencode_session_list` | `client.session.list()` | — |
| `opencode_session_get` | `client.session.get()` | — |
| `opencode_session_status` | `client.session.status()` | Do NOT add `sessionId` to input schema |
| `opencode_session_messages` | `client.session.messages()` | `limit` is "most recent N", not offset-based |
| `opencode_session_message` | `client.session.message()` | MCP arg `messageId`, SDK path `messageID` (capital D) |
| `opencode_session_delete` | `client.session.delete()` | Add irreversibility warning to description |
| `opencode_session_rename` | `client.session.update()` | NOT `client.session.rename()` — does not exist |
| `opencode_session_children` | `client.session.children()` | — |
| `opencode_session_unrevert` | `client.session.unrevert()` | No body — do NOT mirror opencode_revert |

---

## Metadata

**Analog search scope:** `src/index.ts` (the only source file; all analogs internal)
**Files scanned:** 2 (`03-RESEARCH.md`, `src/index.ts`)
**Pattern extraction date:** 2026-04-26
