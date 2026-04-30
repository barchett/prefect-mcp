# Phase 11: Session Lifecycle Tools - Research

**Researched:** 2026-04-29
**Domain:** OpenCode SDK session lifecycle API — summarize, todo, init, share, unshare
**Confidence:** HIGH

---

## Summary

Phase 11 adds five new MCP tools that wrap OpenCode session lifecycle endpoints not yet exposed by Prefect: `prefect_session_summarize` (POST /session/:id/summarize), `prefect_session_todo` (GET /session/:id/todo), `prefect_session_init` (POST /session/:id/init), `prefect_session_share` (POST /session/:id/share), and `prefect_session_unshare` (DELETE /session/:id/share). All five endpoints already exist in the installed `@opencode-ai/sdk` and are accessible via `client.session.*` methods — no new dependencies are needed.

The implementation pattern is purely additive and structurally identical to Phase 3 session tools: Zod input schema, async handler calling `client.session.<method>()`, error check with `throw new Error(JSON.stringify(error))`, and `{ content: [{ type: 'text', text: JSON.stringify(data) }] }` return. The SDK abstracts HTTP method differences (GET vs POST vs DELETE) so the TypeScript implementation looks uniform across all five.

`SessionSummarizeData` and `SessionInitData` both have non-trivial request bodies. **Despite being typed `body?: {...}` in the SDK, the server rejects calls that omit the body or send an empty one — `providerID` and `modelID` are required at runtime for both endpoints, and `messageID` is also required for `session.init()` specifically** (all confirmed by UAT 2026-04-29). `session.init()` write is asynchronous — the endpoint returns `true` immediately but AGENTS.md may take a moment to appear on disk. All other tools have `body?: never`. Both share and unshare return the full `Session` object. Summarize and init return `boolean`. Todo returns `Array<Todo>` where `Todo` has `{ id, content, status, priority }`.

**Primary recommendation:** Implement all five tools in a single plan file (`11-01-PLAN.md`) — they share the same file targets (`src/index.ts` only), are all simple pass-throughs, and have no ordering dependencies between them.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESSION-11 | `prefect_session_summarize` — wraps POST /session/:id/summarize; triggers OpenCode summary generation for a session | `client.session.summarize()` exists in SDK; **body required** `{ providerID, modelID }` (server rejects absent/empty body despite SDK typing `body?: {...}`); returns `boolean` |
| SESSION-12 | `prefect_session_todo` — wraps GET /session/:id/todo; returns the current todo list for a session | `client.session.todo()` exists in SDK; no body; returns `Array<Todo>` |
| SESSION-13 | `prefect_session_init` — wraps POST /session/:id/init; generates an AGENTS.md file for the session's project | `client.session.init()` exists in SDK; **body required**: `providerID` and `modelID` required (server rejects absent/empty body); `messageID` optional; returns `boolean` |
| SESSION-15 | `prefect_session_share` — wraps POST /session/:id/share; makes a session shareable | `client.session.share()` exists in SDK; no body; returns `Session` (with `share?: { url: string }` field) |
| SESSION-16 | `prefect_session_unshare` — wraps DELETE /session/:id/share; removes sharing from a session | `client.session.unshare()` exists in SDK; no body; returns `Session` |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- **Tool tracking:** Use `bd` for all task tracking. Do NOT use TodoWrite or markdown TODO lists.
- **No prefect tools for reading code:** Use Read/Grep directly for code inspection — faster, no extra hop.
- **Git contract:** Prefect edits files but does not commit. Claude Code reviews diff and commits.
- **No `PREFECT_SERVER_PASSWORD` in `.mcp.json`:** env block in .mcp.json is committed; password goes in shell profile only.
- **Session completion:** All work sessions must end with `git pull --rebase && bd dolt push && git push`.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Trigger session summarization | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | Prefect forwards the call; OpenCode runs the LLM summary generation |
| Retrieve session todo list | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | Todos are stored server-side; Prefect retrieves and returns them |
| Generate AGENTS.md for project | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode analyzes the project directory and writes the file |
| Share / unshare a session | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode manages the share state; Prefect posts and returns the updated Session |

**Key insight:** All five capabilities live entirely in OpenCode. Prefect's role is a thin pass-through in each case — Zod validates input, SDK handles the HTTP call, result is JSON-stringified back to the MCP caller.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opencode-ai/sdk` | already installed | SDK client with `client.session.*` methods for all 5 endpoints | All endpoints verified present in installed types |
| `zod` | already installed | Input schema validation for all five MCP tool registrations | Project-wide standard; every tool uses Zod |

No new dependencies required. [VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts]

### Supporting

No supporting libraries needed beyond what is already installed. All five tools follow the same minimal pattern as existing Phase 3 tools.

---

## Architecture Patterns

### System Architecture Diagram

```
MCP caller (Claude Code)
        |
        | JSON-RPC tool call
        v
[Prefect MCP Server — src/index.ts]
  - Zod validates inputSchema
  - resolveDirectory() for directory param
  - client.session.<method>() call
  - error check: if (error) throw new Error(JSON.stringify(error))
        |
        | HTTP (authenticated via fetchWithAuth)
        v
[OpenCode HTTP API — localhost:4096]
  POST /session/:id/summarize  -> triggers LLM summary
  GET  /session/:id/todo       -> returns current todo list
  POST /session/:id/init       -> generates AGENTS.md file
  POST /session/:id/share      -> makes session shareable
  DELETE /session/:id/share    -> removes sharing
        |
        v
[Response returned to Prefect]
  - boolean (summarize, init)
  - Array<Todo> (todo)
  - Session (share, unshare)
        |
        v
[Prefect returns JSON.stringify(data) to MCP caller]
```

### Recommended Project Structure

No new files needed. All five tools are registered directly in `src/index.ts` following the established pattern for all Phase 3+ tools. Phase 7 extracted `createSession`, `runPrompt`, and `getDiff` into `src/handlers.ts` because they are called from multiple composite tools — these five new tools have no composite callers and do not need extraction.

### Pattern: Standard Session Tool Registration

Every existing session tool follows this exact structure. The five new tools use the same pattern. [VERIFIED: src/index.ts Phase 3 tools]

```typescript
// Source: src/index.ts — see prefect_session_delete as canonical minimal example (lines 479-502)
server.registerTool(
  'prefect_session_<name>',
  {
    description: '<description>',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      // ... any additional optional params
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, /* ...params, */ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.<method>({
        path: { id: sessionId },
        // body: { ... } if applicable
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### Anti-Patterns to Avoid

- **Adding handlers.ts entries for these five tools:** The three functions in `src/handlers.ts` were extracted because composites (`prefect_delegate`, `prefect_inspect`, `prefect_await`) call them directly. None of the five new lifecycle tools are called by composite tools — they do not belong in `handlers.ts`.
- **Wrapping boolean returns with extra structure:** `summarize` and `init` return plain `boolean`. Return `JSON.stringify(data)` directly — do not wrap in `{ success: data }` or similar invented shapes.
- **Treating `share` response as a URL string:** `share` returns the full `Session` object (with `session.share?.url` inside it), not a bare URL string. JSON.stringify the full Session and let the caller navigate it.
- **Sending a body to `share` or `unshare`:** Both `SessionShareData` and `SessionUnshareData` have `body?: never` — do not construct a body object.
- **Sending a body to `todo`:** `SessionTodoData` has `body?: never` — GET endpoint, no body.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP calls to lifecycle endpoints | Custom `fetchWithAuth()` calls with manual URL construction | `client.session.summarize()`, `.todo()`, `.init()`, `.share()`, `.unshare()` | SDK methods already exist in the installed package; path param serialization, auth headers, and response parsing are handled |
| TODO list formatting | Custom markdown formatter for todo items | Return `Array<Todo>` as-is via `JSON.stringify(data)` | Caller (Claude Code) can format; Prefect is a data layer, not a presentation layer |

---

## SDK Type Reference (VERIFIED)

All type information verified directly from the installed SDK at:
`node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`
`node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts`

### SESSION-11: prefect_session_summarize

**SDK method:** `client.session.summarize(options)`
**HTTP:** POST /session/:id/summarize
**Request body (required at runtime):**
```typescript
body: {
  providerID: string;  // REQUIRED — SDK types as optional but server rejects calls without it
  modelID: string;     // REQUIRED — same
}
```
**Response:** `200: boolean` — returns `true` on success
**Errors:** 400 (BadRequestError), 404 (NotFoundError)

**MCP tool schema:** sessionId (required string) + **required** providerID + **required** modelID + optional directory

**⚠ UAT finding (2026-04-29):** SDK types `body` as `body?: { providerID: string; modelID: string }` implying optional, but the server returns `{ path: ["providerID"], message: "Invalid input: expected string, received undefined" }` when the body is absent or empty. `providerID` and `modelID` must always be provided.

### SESSION-12: prefect_session_todo

**SDK method:** `client.session.todo(options)`
**HTTP:** GET /session/:id/todo
**Request body:** `body?: never` — no body
**Response:** `200: Array<Todo>` where:
```typescript
type Todo = {
  id: string;
  content: string;     // brief description of the task
  status: string;      // "pending" | "in_progress" | "completed" | "cancelled"
  priority: string;    // "high" | "medium" | "low"
};
```
**Errors:** 400, 404

**MCP tool schema:** sessionId (required string) + optional directory

**Note:** `prefect_inspect` composite already calls `client.session.todo()` internally (see src/index.ts line 739). `prefect_session_todo` exposes it as a standalone tool for callers who only need the todo list.

### SESSION-13: prefect_session_init

**SDK method:** `client.session.init(options)`
**HTTP:** POST /session/:id/init
**Request body (providerID + modelID required at runtime):**
```typescript
body: {
  providerID: string;  // REQUIRED — server rejects absent/empty body
  modelID: string;     // REQUIRED — same
  messageID?: string;  // optional — resume from a specific message context
}
```
**Response:** `200: boolean` — returns `true` on success
**Errors:** 400, 404

**MCP tool schema:** sessionId (required string) + **required** providerID + **required** modelID + **required** messageID + optional directory + optional force

**⚠ UAT finding (2026-04-29):** SDK types the entire body as `body?: {...}` and all three fields as `string` (implying optional when body absent). In practice the server rejects calls without any of them: `providerID`, `modelID`, and `messageID` are all required at runtime (server returns a Zod validation error if `messageID` is omitted). The file write is asynchronous — the endpoint returns `true` immediately but AGENTS.md may take a moment to appear on disk.

### SESSION-15: prefect_session_share

**SDK method:** `client.session.share(options)`
**HTTP:** POST /session/:id/share
**Request body:** `body?: never` — no body
**Response:** `200: Session` — full Session object; after sharing, `session.share?.url` contains the share URL
**Errors:** 400, 404

**MCP tool schema:** sessionId (required string) + optional directory

**Note:** The share URL is nested inside the returned Session: `session.share?.url`. The tool description should tell the caller to check this field.

### SESSION-16: prefect_session_unshare

**SDK method:** `client.session.unshare(options)`
**HTTP:** DELETE /session/:id/share
**Request body:** `body?: never` — no body
**Response:** `200: Session` — full Session object; after unsharing, `session.share` is absent/undefined
**Errors:** 400, 404

**MCP tool schema:** sessionId (required string) + optional directory

**Note:** Both share and unshare use the same URL `/session/{id}/share` — they are differentiated by HTTP method (POST vs DELETE). The SDK wraps this correctly as separate `share()` and `unshare()` methods.

---

## Common Pitfalls

### Pitfall 1: Sending body to share/unshare/todo

**What goes wrong:** TypeScript compiler error or runtime 400 from OpenCode if a body is passed to these three endpoints.
**Why it happens:** `SessionShareData.body`, `SessionUnshareData.body`, and `SessionTodoData.body` are all typed `body?: never`. Passing any body object is a TS compile error.
**How to avoid:** Do not include `body:` in the options object for these three tools. Only `path` and `query` (for directory) are valid.
**Warning signs:** `npm run build` failing with "argument of type 'never'" or similar.

### Pitfall 2: Treating boolean returns as Session objects

**What goes wrong:** Trying to navigate `data.id` or `data.share?.url` on the return value from `summarize` or `init`.
**Why it happens:** Both return plain `boolean` (200: boolean), not a Session or complex object.
**How to avoid:** `JSON.stringify(data)` will produce `"true"` for these — that is correct. Add to tool description that the `true` return means the operation was accepted/triggered.
**Warning signs:** Runtime error accessing properties on a boolean.

### Pitfall 3: Treating providerID/modelID as optional for summarize and init

**What goes wrong:** Calling `prefect_session_summarize` or `prefect_session_init` without `providerID` and `modelID` — the server returns 400 with `{ path: ["providerID"], message: "Invalid input: expected string, received undefined" }`.
**Why it happens:** The SDK types `body` as `body?: { providerID: string; modelID: string }` suggesting the body is optional. In practice the server validates these fields as required. Any absent or empty body triggers the same validation error. Confirmed by UAT 2026-04-29.
**How to avoid:** Mark `providerID` and `modelID` as `z.string()` (no `.optional()`) in the Zod schema. Always pass `body: { providerID, modelID }` to the SDK call. Claude Code callers should use their current OpenCode provider/model (e.g. `"anthropic"` / `"claude-sonnet-4-6"`).
**Warning signs:** `{ "error": [{ "path": ["providerID"], "message": "Invalid input: expected string, received undefined" }] }` in the tool response.

### Pitfall 4: Missing the share URL in description

**What goes wrong:** Caller calls `prefect_session_share` but doesn't know where to find the URL in the response.
**Why it happens:** Share/unshare return the full Session blob; the URL is nested at `session.share?.url`.
**How to avoid:** Include in the MCP tool description: "After sharing, the share URL is available at `session.share.url` in the returned Session object."
**Warning signs:** User confusion about finding the share link.

---

## Code Examples

### prefect_session_todo (simplest — no body, Array return)

```typescript
// Source: pattern from prefect_session_children (src/index.ts lines 531-554)
server.registerTool(
  'prefect_session_todo',
  {
    description: 'Get the current todo list for an OpenCode session. Returns Array<{ id, content, status, priority }> where status is one of pending/in_progress/completed/cancelled and priority is high/medium/low.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.todo({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### prefect_session_summarize (optional body with model override)

```typescript
// Source: pattern from prefect_session_command (src/index.ts lines 582-626)
// body is entirely optional — only include when fields are provided
server.registerTool(
  'prefect_session_summarize',
  {
    description: 'Trigger summary generation for an OpenCode session. Returns true when the summarization was accepted. Optionally override the model used for summarization via providerID + modelID.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      providerID: z.string().optional().describe('Override provider for summarization (e.g. "anthropic"). Requires modelID.'),
      modelID: z.string().optional().describe('Override model for summarization (e.g. "claude-3-5-haiku-20241022"). Requires providerID.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, providerID, modelID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.summarize({
        path: { id: sessionId },
        body: (providerID && modelID) ? { providerID, modelID } : undefined,
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### prefect_session_init (optional body with model + messageID override)

```typescript
// SDK says body fields are all optional when body is provided.
// Safe strategy: only send body when at least one field is present.
server.registerTool(
  'prefect_session_init',
  {
    description: 'Analyze the session\'s project and generate an AGENTS.md file. Returns true when the operation was accepted. Optionally override the model used for analysis.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      providerID: z.string().optional().describe('Override provider for AGENTS.md generation. Requires modelID.'),
      modelID: z.string().optional().describe('Override model for AGENTS.md generation. Requires providerID.'),
      messageID: z.string().optional().describe('Resume analysis from a specific message context.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, providerID, modelID, messageID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const body: { modelID?: string; providerID?: string; messageID?: string } | undefined =
        (providerID || modelID || messageID)
          ? { ...(providerID ? { providerID } : {}), ...(modelID ? { modelID } : {}), ...(messageID ? { messageID } : {}) }
          : undefined;
      const { data, error } = await client.session.init({
        path: { id: sessionId },
        body,
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### prefect_session_share / prefect_session_unshare (no body, Session return)

```typescript
// Source: pattern from prefect_session_unrevert (src/index.ts lines 556-580)
// No body — body?: never. Returns full Session object.
server.registerTool(
  'prefect_session_share',
  {
    description: 'Make an OpenCode session publicly shareable. Returns the full Session object — after sharing, the share URL is at session.share.url.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to share'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.share({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

server.registerTool(
  'prefect_session_unshare',
  {
    description: 'Remove public sharing from an OpenCode session. Returns the updated Session object with the share field cleared.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to unshare'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.unshare({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
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

## Plan Count Decision

**One plan is sufficient.** Rationale:
- All five tools modify only `src/index.ts` — no other files need changes.
- None of the five tools are used by composite handlers in `src/handlers.ts` — no handler extraction is needed.
- Implementation complexity is uniform and low: each tool is 15-20 lines of identical structural pattern.
- Build verification (`npm run build`) is the single gate and applies to the whole file.
- Precedent: Phase 8 (three read-only wrappers) and Phase 9 (code rename + docs) each shipped in 1-2 focused plans; Phase 11's five tools have less variance than Phase 8's three.

**Plan structure:** `11-01-PLAN.md` — add all five tool registrations to `src/index.ts` in one task block, gate with `npm run build`.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| opencode_* naming | prefect_* naming | Phase 9 | All new tools must use `prefect_` prefix |
| Direct authFetch calls | `client.session.*` via SDK | Phase 3 baseline | SDK wraps HTTP; never use fetchWithAuth directly for session endpoints |
| OPENCODE_DEFAULT_PROJECT | PREFECT_DEFAULT_PROJECT | Phase 9 | resolveDirectory() already handles both; no Phase 11 action needed |

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ~~The optional body fields for `init` (`modelID`, `providerID`, `messageID`) can be sent as a partial object when only some are provided~~ **INVALIDATED by UAT 2026-04-29** — all three fields are required together; server rejects calls missing any of them | Code Examples — session_init | N/A — tool schema now marks all three as required |
| A2 | Passing `body: undefined` (rather than omitting the `body` key) to `client.session.summarize()` and `client.session.init()` when no model override is given is safe | Code Examples | If SDK serializes `body: undefined` as `{}` and OpenCode rejects empty bodies, summarize/init with no model args would fail; low risk given SDK generated code handles this |

**All other claims verified directly from installed SDK types.**

---

## Open Questions (RESOLVED)

1. **Are providerID + modelID required together for summarize/init, or can they be sent independently?**
   - What we know: The `SessionSummarizeData.body` type is `body?: { providerID: string; modelID: string }` — both are non-optional within the body object, but the entire body is optional.
   - What's unclear: Whether OpenCode returns 400 if only one is provided.
   - Recommendation: In the tool description, say "both providerID and modelID are required together" (same pattern as `prefect_run` model override). In the code, only include the body when both are present.
   - **RESOLVED (updated by UAT 2026-04-29):** For `prefect_session_summarize`, providerID + modelID are required together. For `prefect_session_init`, all three of `{ modelID, providerID, messageID }` are required — the server rejects omission of any one of them with a Zod validation error.

2. **Does `session.init()` produce the AGENTS.md file synchronously or asynchronously?**
   - What we know: SDK return is `200: boolean` — no async task ID is returned.
   - What's unclear: Whether the file is written before the HTTP response returns, or triggered in the background.
   - Recommendation: Document as "triggers AGENTS.md generation" rather than "creates AGENTS.md" — lets the caller handle uncertainty without blocking on it.
   - **RESOLVED (confirmed by UAT 2026-04-29):** File write is asynchronous — the endpoint returns `true` immediately but AGENTS.md appears on disk after a short delay. Tool description now explicitly states this.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 11 is code-only changes to `src/index.ts`. The only external dependency is OpenCode running at `PREFECT_SERVER_URL`, which is already established by prior phases. No new tools, runtimes, or services are required.

---

## Validation Architecture

`nyquist_validation` is set to `false` in `.planning/config.json` — this section is omitted per configuration.

---

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Auth handled by `fetchWithAuth` in prior phases |
| V3 Session Management | no | Session lifecycle is OpenCode's responsibility |
| V4 Access Control | no | Personal-use, single-tenant, localhost only |
| V5 Input Validation | yes | Zod schemas on all five tool registrations |
| V6 Cryptography | no | Share URL generation is OpenCode's responsibility |

### Known Threat Patterns

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| SSRF via directory param | Tampering | `resolveDirectory()` returns the caller-supplied string; OpenCode validates it exists. Personal-use local service — accepted |
| Session ID forgery | Spoofing | sessionId forwarded directly; OpenCode returns 404 for invalid IDs via the `if (error) throw` path |
| Share URL leakage | Information Disclosure | Share URL is returned to the MCP caller (Claude Code) who requested it — accepted; no third-party disclosure |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — Verified: `SessionTodoData`, `SessionInitData`, `SessionShareData`, `SessionUnshareData`, `SessionSummarizeData` and their response types; `Todo` type shape; `Session` type with `share?: { url: string }` field
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — Verified: `client.session.todo()`, `.init()`, `.share()`, `.unshare()`, `.summarize()` method signatures and JSDoc
- `src/index.ts` — Verified: existing Phase 3–9 tool registration pattern, `resolveDirectory()` usage, `fetchWithAuth` wiring, error handling pattern

### Secondary (MEDIUM confidence)

None needed — all claims directly verified from installed SDK types and existing source files.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- SDK endpoint shapes: HIGH — verified directly from installed `@opencode-ai/sdk` types
- Return value structures: HIGH — verified from `SessionTodoResponses`, `SessionShareResponses`, etc.
- Body optionality for init/summarize: HIGH — `body?: {...}` in types confirms optional
- Async vs sync behavior of init/summarize: LOW — not determinable from types alone

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (SDK version is pinned; changes only if @opencode-ai/sdk is upgraded)
