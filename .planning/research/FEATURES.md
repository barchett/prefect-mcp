# Feature Research — OpenCode API Surface

**Domain:** MCP server wrapping OpenCode HTTP API (Prefect v2.0)
**Researched:** 2026-04-26
**Confidence:** HIGH (sourced directly from `@opencode-ai/sdk` TypeScript types in node_modules)
**Source files:**
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — authoritative request/response shapes
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — SDK method signatures
- `src/index.ts` — current v1.0 implementation

---

## Session Management Endpoints

### GET /session (list) — `SessionListData`

**SDK method:** `client.session.list(options?)`

**Query params:**
| Param | Type | Required |
|-------|------|----------|
| directory | string | no |

**Response:** `Array<Session>` (200)

**Session type — full shape:**
```typescript
Session = {
  id: string;
  projectID: string;
  directory: string;
  parentID?: string;
  summary?: {
    additions: number;
    deletions: number;
    files: number;
    diffs?: Array<FileDiff>;
  };
  share?: {
    url: string;
  };
  title: string;
  version: string;
  time: {
    created: number;   // Unix ms
    updated: number;   // Unix ms
    compacting?: number;
  };
  revert?: {
    messageID: string;
    partID?: string;
    snapshot?: string;
    diff?: string;
  };
}
```

**Errors:** None documented (no 4xx variants in type).

---

### GET /session/:id (get) — `SessionGetData`

**SDK method:** `client.session.get(options)`

**Path params:**
| Param | Type | Required |
|-------|------|----------|
| id | string | yes |

**Query params:**
| Param | Type | Required |
|-------|------|----------|
| directory | string | no |

**Response:** `Session` (200) — same shape as above.

**Errors:**
- 400: `BadRequestError`
- 404: `NotFoundError`

---

### GET /session/:id/message (messages) — `SessionMessagesData`

**SDK method:** `client.session.messages(options)`

**Path params:**
| Param | Type | Required |
|-------|------|----------|
| id | string | yes (Session ID) |

**Query params:**
| Param | Type | Required | Notes |
|-------|------|----------|-------|
| directory | string | no | |
| limit | number | no | Only pagination control available — no cursor/offset |

**Response:** `Array<{ info: Message; parts: Array<Part> }>` (200)

**Message union type:**
```typescript
Message = UserMessage | AssistantMessage

UserMessage = {
  id: string;
  sessionID: string;
  role: "user";
  time: { created: number };
  summary?: { title?: string; body?: string; diffs: Array<FileDiff> };
  agent: string;
  model: { providerID: string; modelID: string };
  system?: string;
  tools?: { [key: string]: boolean };
}

AssistantMessage = {
  id: string;
  sessionID: string;
  role: "assistant";
  time: { created: number; completed?: number };
  error?: ProviderAuthError | UnknownError | MessageOutputLengthError | MessageAbortedError | ApiError;
  parentID: string;
  modelID: string;
  providerID: string;
  mode: string;
  path: { cwd: string; root: string };
  summary?: boolean;
  cost: number;
  tokens: {
    input: number;
    output: number;
    reasoning: number;
    cache: { read: number; write: number };
  };
  finish?: string;
}
```

**Part union type (complete):**
```typescript
Part = TextPart | SubtaskPart | ReasoningPart | FilePart | ToolPart |
       StepStartPart | StepFinishPart | SnapshotPart | PatchPart |
       AgentPart | RetryPart | CompactionPart

// All parts share: id, sessionID, messageID, type

TextPart:       { type:"text"; text:string; synthetic?:boolean; ignored?:boolean; time?:{start,end?}; metadata? }
SubtaskPart:    { type:"subtask"; prompt:string; description:string; agent:string }
ReasoningPart:  { type:"reasoning"; text:string; time:{start,end?}; metadata? }
FilePart:       { type:"file"; mime:string; filename?:string; url:string; source?:FilePartSource }
ToolPart:       { type:"tool"; callID:string; tool:string; state:ToolState; metadata? }
StepStartPart:  { type:"step-start"; snapshot?:string }
StepFinishPart: { type:"step-finish"; reason:string; snapshot?:string; cost:number; tokens:{...} }
SnapshotPart:   { type:"snapshot"; snapshot:string }
PatchPart:      { type:"patch"; hash:string; files:Array<string> }
AgentPart:      { type:"agent"; name:string; source?:{value,start,end} }
RetryPart:      { type:"retry"; attempt:number; error:ApiError; time:{created:number} }
CompactionPart: { type:"compaction"; auto:boolean }
```

**ToolState union:**
```typescript
ToolState = ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError
// status: "pending" | "running" | "completed" | "error"
// completed has: output, title, metadata, time.{start,end,compacted?}, attachments?: FilePart[]
```

**Errors:**
- 400: `BadRequestError`
- 404: `NotFoundError`

---

### GET /session/:id/message/:messageID (single message) — `SessionMessageData`

**SDK method:** `client.session.message(options)`

**Path params:**
| Param | Type | Required |
|-------|------|----------|
| id | string | yes (Session ID) |
| messageID | string | yes |

**Query params:** `directory?` only.

**Response:** `{ info: Message; parts: Array<Part> }` (200)

**Errors:** 400, 404.

---

### DELETE /session/:id — `SessionDeleteData`

**SDK method:** `client.session.delete(options)`

**Path params:**
| Param | Type | Required |
|-------|------|----------|
| id | string | yes |

**Query params:** `directory?` only.

**Response:** `boolean` (200) — `true` on success.

**Errors:**
- 400: `BadRequestError`
- 404: `NotFoundError`

---

## opencode_run (session.prompt) — Full API Audit

### Endpoint

`POST /session/:id/message` — `SessionPromptData`

**SDK method:** `client.session.prompt(options)`

**Path params:**
| Param | Type | Required |
|-------|------|----------|
| id | string | yes (Session ID) |

**Query params:** `directory?` only.

---

### Request Body — All Fields

```typescript
SessionPromptData.body = {
  messageID?: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
  tools?: { [key: string]: boolean };
  parts: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>;
}
```

| Field | Type | Required | Currently Implemented | v2.0 Plan |
|-------|------|----------|-----------------------|-----------|
| `parts` | `Array<TextPartInput \| FilePartInput \| AgentPartInput \| SubtaskPartInput>` | yes (at least one part) | YES — TextPartInput only (`[{type:"text", text:prompt}]`) | — (TextPartInput sufficient for all v2.0 use cases) |
| `model` | `{ providerID: string; modelID: string }` | no | NO | IMPLEMENT — expose as optional `providerID` + `modelID` params |
| `agent` | `string` | no | NO | IMPLEMENT — expose as optional `agent` param (e.g. "build", "plan", "general") |
| `noReply` | `boolean` | no | NO | IMPLEMENT — expose as optional `noReply` boolean; changes response contract (see below) |
| `system` | `string` | no | NO | IMPLEMENT — expose as optional `systemPrompt` param |
| `tools` | `{ [key: string]: boolean }` | no | NO | DEFER to v3.0 (map of toolID→enabled; requires knowing tool IDs) |
| `messageID` | `string` | no | NO | DEFER to v3.0 (resume from specific message in conversation thread) |

**TextPartInput fields (complete):**
```typescript
TextPartInput = {
  id?: string;
  type: "text";
  text: string;
  synthetic?: boolean;
  ignored?: boolean;
  time?: { start: number; end?: number };
  metadata?: { [key: string]: unknown };
}
```
Only `type` and `text` are needed for normal prompting. The other fields (`id`, `synthetic`, `ignored`, `time`, `metadata`) are internal/replay fields — do not expose.

**FilePartInput fields (deferred to v3.0):**
```typescript
FilePartInput = {
  id?: string;
  type: "file";
  mime: string;
  filename?: string;
  url: string;
  source?: FilePartSource;  // FileSource | SymbolSource
}
```

**AgentPartInput (deferred to v3.0):**
```typescript
AgentPartInput = {
  id?: string;
  type: "agent";
  name: string;
  source?: { value: string; start: number; end: number };
}
```

**SubtaskPartInput (deferred to v3.0):**
```typescript
SubtaskPartInput = {
  id?: string;
  type: "subtask";
  prompt: string;
  description: string;
  agent: string;
}
```

---

### Response Shape

**Synchronous (noReply omitted or false):**
```typescript
// 200
{
  info: AssistantMessage;   // full AssistantMessage — see type above
  parts: Array<Part>;       // all parts produced during the run
}
```

**async variant — `POST /session/:id/prompt_async` — `SessionPromptAsyncData`:**

Same body shape as `session.prompt`. Returns `204 void` immediately — agent runs asynchronously. This is the native async endpoint; it is NOT the same as `noReply: true`. Both exist.

`noReply: true` on the synchronous endpoint (`/session/:id/message`) — the type annotation does not document an altered 200 shape when noReply is used. The response is still typed as `{ info: AssistantMessage; parts: Array<Part> }`. In practice `noReply` likely causes the model to skip generating a reply text part, but the HTTP response still returns 200 with the message object.

**Errors:**
- 400: `BadRequestError` — `{ data: unknown; errors: Array<{...}>; success: false }`
- 404: `NotFoundError` — `{ name: "NotFoundError"; data: { message: string } }`

---

### noReply vs prompt_async: Important Distinction

There are **two different async mechanisms** in the API:

| Mechanism | Endpoint | When to use |
|-----------|----------|-------------|
| `noReply: true` in body | `POST /session/:id/message` | Sends a user message but tells the model not to generate a reply. Blocks until the user message is stored. Returns 200 with the (empty/stub) assistant message object. |
| `session.promptAsync()` | `POST /session/:id/prompt_async` | Identical body; returns `204 void` immediately. Agent loop runs in background. Monitor via SSE or poll `session.messages()`. |

For Prefect v2.0, `noReply: true` on the synchronous endpoint is what PROJECT.md calls "fire-and-forget" — but the actual fire-and-forget without waiting is `promptAsync`. Recommend exposing `noReply` as documented, but also note in the tool description that `promptAsync` exists if true non-blocking is needed.

---

## Session Update Endpoint (already partially adjacent to v1.0)

### PATCH /session/:id — `SessionUpdateData`

**SDK method:** `client.session.update(options)`

Allows updating session title. Not in v2.0 scope but trivially addable.

**Body:** `{ title?: string }`
**Response:** `Session` (200)

---

## SessionStatus Endpoint

### GET /session/status — `SessionStatusData`

**SDK method:** `client.session.status(options?)`

**Response:** `{ [sessionID: string]: SessionStatus }` (200)

```typescript
SessionStatus = { type: "idle" }
              | { type: "retry"; attempt: number; message: string; next: number }
              | { type: "busy" }
```

Useful for checking whether a session is still running before calling opencode_run. Not in v2.0 scope but useful for future timeout logic.

---

## Other Session Endpoints (Future Candidates)

These exist in the SDK and are NOT targeted in v2.0. Listed for completeness and future planning.

| Endpoint | SDK Method | v3.0 / Future |
|----------|-----------|---------------|
| `GET /session/:id/children` | `session.children()` | v3.0 — session hierarchies (when parentID used at create) |
| `GET /session/:id/todo` | `session.todo()` | future — OpenCode todo tracking per session |
| `POST /session/:id/summarize` | `session.summarize()` | future — trigger context compaction with specific model |
| `POST /session/:id/init` | `session.init()` | future — analyzes app and creates AGENTS.md |
| `DELETE /session/:id` + `POST /session/:id/unrevert` | `session.unrevert()` | v3.0 — redo reverted messages |
| `POST /session/:id/share` / `DELETE /session/:id/share` | `session.share()` / `session.unshare()` | future — session sharing |
| `POST /session/:id/shell` | `session.shell()` | future — run shell commands within session context |
| `POST /session/:id/command` | `session.command()` | future — run named slash commands |
| `GET /session/:id/diff?messageID=` | already wrapped in `opencode_get_diff` | — |

**Non-session endpoints that may be useful (workspace inspection, v3.0+):**
| Endpoint | Purpose |
|----------|---------|
| `GET /agent` | List available agents — needed to validate agent names before passing to opencode_run |
| `GET /provider` | List providers/models — needed to validate model IDs |
| `GET /vcs` | Get current git branch |
| `GET /file/status` | Get modified files |
| `GET /find/symbol?query=` | LSP symbol search |
| `GET /experimental/tool/ids` | List all tool IDs (useful for tools override) |
| `GET /experimental/tool?provider=&model=` | List tool schemas for a model |
| `GET /session/status` | Poll all session statuses |
| `POST /session/:id/prompt_async` | True non-blocking prompt |

---

## SessionCreate Clarification (v1.0 gap)

`SessionCreateData.body` accepts a `parentID` field that is NOT currently exposed in `opencode_create_session`:

```typescript
SessionCreateData.body = {
  parentID?: string;   // NOT exposed in v1.0
  title?: string;      // exposed in v1.0
}
```

`parentID` is deferred to v3.0 (session hierarchies).

---

## Feature Dependencies

```
opencode_session_list        — no deps
opencode_session_get         — no deps
opencode_session_delete      — no deps
opencode_session_messages    — no deps (but `limit` param is useful after understanding message volume)
opencode_run model override  — no deps (providerID + modelID are plain strings; no validation needed)
opencode_run agent selection — GET /agent endpoint exists for validation but not required
opencode_run noReply         — no deps
opencode_run system override — no deps
```

All v2.0 features are independent of each other. They can be implemented in any order. The only soft dependency: if implementing `agent` param, calling `GET /agent` first to know valid names is helpful for documentation but not a blocker.

---

## Implementation Notes for v2.0

### opencode_run signature change

Current (v1.0) inputSchema for `opencode_run`:
```typescript
z.object({
  sessionId: z.string(),
  prompt: z.string(),
})
```

Required v2.0 inputSchema:
```typescript
z.object({
  sessionId: z.string(),
  prompt: z.string(),
  providerID: z.string().optional(),   // paired with modelID
  modelID: z.string().optional(),      // paired with providerID
  agent: z.string().optional(),        // e.g. "build", "plan", "general", "explore"
  noReply: z.boolean().optional(),
  systemPrompt: z.string().optional(), // maps to body.system
})
```

The body construction becomes:
```typescript
body: {
  parts: [{ type: 'text', text: prompt }],
  ...(providerID && modelID ? { model: { providerID, modelID } } : {}),
  ...(agent ? { agent } : {}),
  ...(noReply !== undefined ? { noReply } : {}),
  ...(systemPrompt ? { system: systemPrompt } : {}),
}
```

Note: `model` requires BOTH `providerID` and `modelID`. Validation should reject if only one is provided.

### AbortController upgrade

The v1.0 `Promise.race` timeout does not cancel the in-flight HTTP request — the fetch continues running after the race resolves with the timeout error. The correct fix uses `AbortController`:

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
try {
  const { data, error } = await client.session.prompt({
    path: { id: sessionId },
    body: { ... },
    signal: controller.signal,  // hey-api client passes signal to fetch
  });
  clearTimeout(timer);
  ...
} catch (err) {
  if (err.name === 'AbortError') throw new Error(`timed out after ${TIMEOUT_MS}ms`);
  throw err;
}
```

The `@hey-api/client` Config interface inherits from `RequestInit` which includes `signal?: AbortSignal`. This is supported by the SDK.

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| All endpoint shapes | HIGH | Read directly from `types.gen.d.ts` in node_modules |
| SDK method names | HIGH | Read directly from `sdk.gen.d.ts` |
| noReply semantics | MEDIUM | Type shows field exists and response type unchanged; exact runtime behavior not verified against live server |
| promptAsync vs noReply distinction | MEDIUM | Types confirm both exist with different response shapes (200 with body vs 204 void); behavioral semantics inferred from naming |
| Agent name values | MEDIUM | `AgentConfig` type shows "plan", "build", "general", "explore" as keys in `Config.agent`; actual registered agents depend on OpenCode config |
| AbortController signal support | HIGH | `RequestOptions` extends `RequestInit` which includes `signal`; standard fetch API |
