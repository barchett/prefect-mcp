# Pitfalls Research

**Domain:** MCP server wrapping OpenCode HTTP API (Prefect v2.0)
**Researched:** 2026-04-26
**Confidence:** HIGH — sourced from SDK type inspection, v1.0 post-mortem, and research agent findings

---

## Critical Pitfalls

### PITFALL-01: Wrong Part type discriminator strings (SURF-02)

**What goes wrong:** The `Part` union has 12 variants discriminated by a `type` string field. If any discriminator is wrong in the Zod schema, the tool silently returns mistyped data — Claude Code will see the raw object but the tagged union will be wrong, making navigation by `type` unreliable. This is the same class of bug as the `once`/`always`/`reject` permission enum in v1.0, where REQUIREMENTS.md had the wrong values and it only surfaced during implementation.

**Correct discriminators (from `@opencode-ai/sdk` types):**
```
"text" | "subtask" | "reasoning" | "file" | "tool" |
"step-start" | "step-finish" | "snapshot" | "patch" |
"agent" | "retry" | "compaction"
```
Note the hyphenated values: `"step-start"`, `"step-finish"` — not `"stepStart"` or `"step_start"`.

**Prevention:** Before writing any Zod schema for parts, read `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` and confirm each discriminator string verbatim. If unsure, also check `GET /doc` at runtime.

**Phase:** SURF-02 in Phase 4.

---

### PITFALL-02: noReply vs prompt_async conflation

**What goes wrong:** `noReply` is a body field on `POST /session/:id/message` (the synchronous prompt endpoint). When `noReply: true`, the model doesn't reply but the HTTP call still blocks. `POST /session/:id/prompt_async` is a separate endpoint that returns 204 immediately and runs the agent in the background — that is the actual fire-and-forget. Implementing RUN-04 on the wrong endpoint produces a tool that appears to work but still blocks.

**Prevention:** `opencode_prompt_async` must call `client.session.promptAsync(...)`, not `client.session.prompt({ body: { noReply: true } })`. The SDK has separate methods for these. Do not implement RUN-04 by adding a `noReply` param to `opencode_run`.

**Phase:** RUN-04 in Phase 4.

---

### PITFALL-03: Promise.race orphans the in-flight HTTP connection

**What goes wrong:** The v1.0 `opencode_run` races the SDK call against a timeout promise. When the timeout wins, the fetch continues running in the background — the TCP connection to OpenCode stays open and the model keeps processing. This can cause the *next* `opencode_run` call to compete with the orphaned request.

**Prevention:** Replace `Promise.race` with `AbortController`. Pass `signal: controller.signal` as a top-level option on the SDK call (the SDK's `RequestOptions` extends `RequestInit`, so `signal` passes through to the underlying `fetch`). Call `controller.abort()` in the timeout. Catch `AbortError` explicitly in the catch block and distinguish it from other errors.

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
try {
  const result = await client.session.prompt({ ..., signal: controller.signal });
  clearTimeout(timer);
  return result;
} catch (err) {
  if ((err as Error).name === 'AbortError') { /* timeout path */ }
  throw err;
}
```

**Phase:** INFRA-01 in Phase 4 — must be implemented in the same atomic change as RUN-04 and RUN-01/02/03 since all touch the `opencode_run` handler block.

---

### PITFALL-04: model override requires both providerID AND modelID together

**What goes wrong:** The SDK's `model` field on the prompt body is `{ providerID: string; modelID: string }` — both are required as a nested object. A Zod schema that makes them independent optional top-level fields allows callers to pass only one, which the API will reject with a 400.

**Prevention:** In the `opencode_run` Zod schema, model override must be expressed as an optional object with both fields required inside:
```typescript
model: z.object({ providerID: z.string(), modelID: z.string() }).optional()
```
Never expose `providerID` and `modelID` as separate top-level optional fields.

**Phase:** RUN-01 in Phase 4.

---

## Moderate Pitfalls

### PITFALL-05: stdout pollution corrupts the JSON-RPC stream

**What goes wrong:** The MCP server communicates with Claude Code over stdout using JSON-RPC. Any `console.log()` or `process.stdout.write()` in `src/index.ts` or any module it imports corrupts the stream. This produces cryptic parse errors on the Claude Code side that look like server crashes.

**Prevention:** `console.error()` only in the MCP server. When adding `src/init.ts` (INFRA-02), keep it as a completely separate entry point — do not import it from `index.ts`. The CLI can use `console.log()` freely since it is not running as an MCP stdio server.

**Phase:** INFRA-02 in Phase 4.

---

### PITFALL-06: ESM `__dirname` is not available — use `import.meta.url`

**What goes wrong:** `src/init.ts` needs to resolve the path to `build/index.js` relative to its own installed location (not relative to `process.cwd()`). Using `__dirname` fails with `ReferenceError` in ESM modules.

**Prevention:** Resolve paths using `import.meta.url`:
```typescript
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, 'index.js');
```

**Phase:** INFRA-02 in Phase 4.

---

### PITFALL-07: AbortError catch must come before generic error handling

**What goes wrong:** If the catch block uses `String(err)` or `err.message` without first checking `err.name === 'AbortError'`, a timeout produces an unhelpful error message like "AbortError" or "The operation was aborted" with no indication that it was a timeout. Callers cannot distinguish timeout from a genuine API error.

**Prevention:** Always check `err.name === 'AbortError'` first and return a timeout-specific message that includes the timeout duration and a hint to check `PREFECT_TIMEOUT_MS`.

**Phase:** INFRA-01 in Phase 4.

---

### PITFALL-08: session.messages pagination — limit param vs cursor

**What goes wrong:** The SDK exposes a `limit` query param on `GET /session/:id/message`, but there is no cursor/offset param — it returns the most recent N messages, not a paginated slice. Documenting this as "pagination" implies offset-based navigation that doesn't exist.

**Prevention:** SESSION-04 should describe this as "limit the number of messages returned (most recent N)" not "paginate through message history". The tool description must set this expectation clearly so callers don't try to implement offset-based pagination.

**Phase:** SESSION-04 in Phase 3.

---

## Low-Risk / Watch List

### PITFALL-09: opencode_prompt_async response when agent is still running

**What goes wrong:** `POST /session/:id/prompt_async` returns 204 immediately. If the caller then immediately calls `opencode_session_messages` to see what happened, the parts array will be empty or incomplete. There is no push notification — the caller must poll.

**Prevention:** The `opencode_prompt_async` tool description must explicitly state "returns immediately — use `opencode_session_status` or `opencode_session_messages` to poll for completion." Do not imply the result is available synchronously.

**Phase:** RUN-04 in Phase 4.

---

### PITFALL-10: ToolPart state is a union — not just a string

**What goes wrong:** `ToolPart.state` is a `ToolState` union (`ToolStatePending | ToolStateRunning | ToolStateCompleted | ToolStateError`), discriminated by a `status` field. Surfacing it as a raw object in SURF-02 without documenting the status values means callers cannot reliably check whether a tool call succeeded.

**Prevention:** SURF-02's Zod schema should either (a) pass through `ToolPart.state` as a typed discriminated union, or (b) flatten `status` to the part level. Document the four status values: `"pending" | "running" | "completed" | "error"`.

**Phase:** SURF-02 in Phase 4.
