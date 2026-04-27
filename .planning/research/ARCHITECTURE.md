# Architecture Patterns

**Domain:** TypeScript MCP server wrapping OpenCode's HTTP API
**Researched:** 2026-04-26
**Confidence:** HIGH — all findings from direct SDK type inspection and source code

---

## Existing Architecture (v1.0 baseline)

Single file `src/index.ts` (~201 LOC) with this structure:

```
top-level constants (BASE_URL, TIMEOUT_MS, client)
server = new McpServer(...)
7 x server.registerTool(name, schema, handler)
main() → StdioServerTransport → server.connect(transport)
```

Every tool handler follows the same pattern:
```typescript
async (args) => {
  try {
    const { data, error } = await client.session.<method>({ ... });
    if (error) throw new Error(JSON.stringify(error));
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

`opencode_run` deviates with a `Promise.race` wrapping `client.session.prompt(...)` against a timeout timer.

---

## v2.0 Changes — What Touches What

### Changes vs Additions

| Feature | Nature | Touches existing code |
|---------|--------|----------------------|
| `opencode_session_list` | Purely additive | No |
| `opencode_session_get` | Purely additive | No |
| `opencode_session_messages` | Purely additive | No |
| `opencode_session_delete` | Purely additive | No |
| `opencode_run` model/agent/noReply/system params | Modifies existing tool | Yes — opencode_run inputSchema and handler |
| AbortController timeout fix | Modifies existing tool | Yes — opencode_run handler only |
| Install script | New file, no TS | No |
| `prefect init` CLI | New entry point | Yes — package.json bin field |

**Only `opencode_run` requires changes to existing code.** Everything else is additive.

---

## Single File vs Split

At ~300 LOC after v2.0 additions, **stay in one file.**

Rationale:
- All 11 tools are structurally identical: one SDK call, same error wrapper, same return shape.
- There is no shared logic worth extracting — the try/catch wrapper is 4 lines and repeating it is clearer than indirecting it.
- The single exception is `opencode_run`'s AbortController block, which is ~10 lines of local logic.
- Splitting at this size creates navigation overhead with zero abstraction benefit.
- `src/cli.ts` is the correct split point — a second entry point for `prefect init`, not a refactor of the existing MCP server.

Revisit splitting when/if v3.0 adds enough tools to push beyond ~500 LOC and a common helper (e.g. a shared `withAbort` wrapper) emerges organically.

---

## Component Boundaries

| Component | File | Responsibility | Communicates With |
|-----------|------|---------------|-------------------|
| MCP server | `src/index.ts` | All 11 tools, transport lifecycle | OpenCode HTTP API via SDK |
| CLI entry | `src/cli.ts` | `prefect init` command — writes `.mcp.json` | Filesystem only |
| Install script | `install.sh` | `curl \| bash` setup — git clone, npm install, build | Shell, git, npm |

`src/cli.ts` is a standalone Node script. It has no dependency on `McpServer` or `StdioServerTransport`. It reads `process.argv`, checks for the `init` subcommand, and writes `.mcp.json` to the target directory.

---

## Data Flow: New Session Management Tools

All four new tools follow the standard pattern with no new complexity:

**`opencode_session_list`**
```
input: { directory?: string }
SDK call: client.session.list({ query: directory ? { directory } : undefined })
response type: Array<Session>
  Session fields: id, projectID, directory, parentID?, title, version,
                  time.{created, updated}, summary?, share?, revert?
```

**`opencode_session_get`**
```
input: { sessionId: string, directory?: string }
SDK call: client.session.get({ path: { id: sessionId }, query: ... })
response type: Session (same shape as above)
error cases: 400 BadRequestError, 404 NotFoundError
```

**`opencode_session_messages`**
```
input: { sessionId: string, limit?: number, directory?: string }
SDK call: client.session.messages({ path: { id: sessionId }, query: { limit?, directory? } })
response type: Array<{ info: Message, parts: Array<Part> }>
  Message = UserMessage | AssistantMessage
  Part = TextPart | ReasoningPart | FilePart | ToolPart | StepStartPart |
         StepFinishPart | SnapshotPart | PatchPart | AgentPart | RetryPart | CompactionPart
note: `limit` query param is optional; omitting returns all messages
```

**`opencode_session_delete`**
```
input: { sessionId: string, directory?: string }
SDK call: client.session.delete({ path: { id: sessionId }, query: ... })
response type: boolean (true on success)
error cases: 400 BadRequestError, 404 NotFoundError
```

---

## Data Flow: opencode_run Enhancements

The `SessionPromptData.body` type (verified from SDK `types.gen.d.ts` lines 2241-2266) exposes these fields:

```typescript
body?: {
  messageID?: string;
  model?: { providerID: string; modelID: string };
  agent?: string;
  noReply?: boolean;
  system?: string;
  tools?: { [key: string]: boolean };
  parts: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>;
}
```

v2.0 adds `model`, `agent`, `noReply`, and `system` to the existing tool. `messageID` and `tools` are deferred to v3.0 per PROJECT.md.

Updated inputSchema additions (all optional):
```typescript
model: z.object({
  providerID: z.string(),
  modelID: z.string(),
}).optional().describe('Override model for this prompt. Format: { providerID: "ollama", modelID: "qwen2.5-coder:32b" }'),
agent: z.string().optional().describe('Agent to use: "build", "plan", "general", "explore", or a custom agent name'),
noReply: z.boolean().optional().describe('Fire-and-forget mode — returns immediately without waiting for the agent response'),
system: z.string().optional().describe('Override the system prompt for this message'),
```

Updated body construction in the handler:
```typescript
body: {
  parts: [{ type: 'text', text: prompt }],
  ...(model ? { model } : {}),
  ...(agent ? { agent } : {}),
  ...(noReply !== undefined ? { noReply } : {}),
  ...(system ? { system } : {}),
},
```

**noReply behavioural note:** When `noReply: true` is set, the correct endpoint is `client.session.promptAsync(...)` (maps to `POST /session/{id}/prompt_async`), which returns `204 void` immediately. The regular `client.session.prompt(...)` endpoint blocks until the agent finishes. Do not pass `noReply: true` to `session.prompt` — use `session.promptAsync` instead and skip the AbortController timeout entirely for that path.

---

## AbortController Timeout Fix

The current implementation:

```typescript
const timeout = new Promise<never>((_, reject) =>
  setTimeout(() => reject(new Error(`...`)), TIMEOUT_MS)
);
const { data, error } = await Promise.race([
  client.session.prompt({ ... }),
  timeout,
]);
```

The problem: `Promise.race` rejects the outer promise but does not cancel the underlying HTTP request. The fetch continues running in the background, consuming resources and potentially corrupting session state if the model responds after the timeout.

The fix replaces `Promise.race` with an `AbortController` signal threaded through the SDK call:

```typescript
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
try {
  const { data, error } = await client.session.prompt({
    path: { id: sessionId },
    body: { parts: [{ type: 'text', text: prompt }], ... },
    signal: controller.signal,   // SDK Config extends RequestInit which includes signal
  });
  if (error) throw new Error(JSON.stringify(error));
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
} finally {
  clearTimeout(timer);
}
```

**Why `signal` works here:** `RequestOptions` in the SDK extends `Config`, which extends `Omit<RequestInit, "body" | "headers" | "method">`. `RequestInit` includes `signal?: AbortSignal | null`. The SDK passes the full options object to the underlying fetch call, so `signal` is forwarded to the network layer automatically. Verified by tracing the type chain: `types.gen.d.ts` `Config` interface → `client/types.gen.d.ts` `Config` extends `RequestInit`.

**Abort error shape:** When the signal fires, the SDK will throw a `DOMException` with `name: "AbortError"`. The existing `catch (err)` block handles this correctly via `String(err)` — the error message will read `AbortError: The operation was aborted.` rather than the previous timeout message. Update the timeout error message to be explicit:

```typescript
const timer = setTimeout(() => {
  controller.abort(new Error(`opencode_run timed out after ${TIMEOUT_MS / 1000}s`));
}, TIMEOUT_MS);
```

Node 17.3+ supports passing a reason to `abort()`. Since the target is ES2022/Node16, use a plain `controller.abort()` and keep the timeout message in the error handling.

---

## prefect init CLI

**Build target:** `src/cli.ts` compiles to `build/cli.js` via the existing `tsconfig.json` (`rootDir: src`, `outDir: build`). No tsconfig changes needed — TypeScript includes all files under `src/**/*`.

**package.json bin field** needs a second entry:
```json
"bin": {
  "prefect": "./build/index.js",
  "prefect-init": "./build/cli.js"
}
```

Alternatively, keep a single `prefect` binary and dispatch on `process.argv[2] === 'init'` inside `src/index.ts`. This is cleaner for users (`prefect init` vs `prefect-init`) but requires the MCP server entry point to handle CLI dispatch before entering `main()`. Recommended approach: keep them separate binaries to avoid coupling the MCP server startup path with CLI argument parsing.

**prefect init behaviour:**
```
1. Parse argv: target directory (default: process.cwd())
2. Resolve absolute path
3. Check if .mcp.json already exists — warn but overwrite (or --force flag)
4. Write .mcp.json with:
   { "mcpServers": { "prefect": { "type": "stdio", "command": "node",
     "args": ["<absolute-path-to-build/index.js>"], "env": {} } } }
5. Print confirmation to stdout
```

The `args` path should be the absolute path to the currently-running binary's `index.js`, derived from `import.meta.url` or `process.execPath` + relative resolution. Using `new URL('../build/index.js', import.meta.url).pathname` gives a reliable absolute path since cli.ts sits in `src/` and compiles to `build/`.

---

## Install Script

`install.sh` is a pure shell script (no TypeScript involvement). It needs:
1. `git clone <repo-url> <target-dir>` or `cd` to existing clone
2. `npm install`
3. `npm run build`
4. Print next steps (add to `.mcp.json` manually or run `prefect init`)

No changes to `package.json` or `tsconfig.json` for this feature.

---

## Build Order

### Independent (can be built in any order)

- **4 new session management tools** — purely additive `server.registerTool()` calls in `src/index.ts`. Zero risk of breaking existing tools.
- **Install script** — entirely in shell, no TypeScript dependency.

### Has dependency on opencode_run changes

- **AbortController fix** — modifies the `opencode_run` handler. Must be done alongside or before adding the new prompt body options, since both touch the same block of code.
- **opencode_run enhancements** (model/agent/noReply/system) — modifies `opencode_run`'s inputSchema and handler. The `noReply` path requires using `session.promptAsync` instead of `session.prompt`, which means this change and the AbortController fix are best implemented together in a single pass to avoid introducing a partially-correct intermediate state.

### Separate entry point (independent of server)

- **prefect init CLI** (`src/cli.ts`) — independent of all MCP server changes. Can be built first, last, or in parallel. Requires only a `package.json` bin field update.

### Recommended order

1. `opencode_run` AbortController fix + prompt body enhancements (single atomic change to the one tool that changes)
2. Four new session management tools (pure addition, zero risk)
3. `prefect init` CLI (new file + bin entry)
4. Install script (shell only)

This order front-loads the only risky change (modifying existing code) before adding new surface area, making each step independently verifiable with a build + smoke test.

---

## Breaking Changes

None. All changes are either:
- Additive new tools (no impact on existing tools)
- Optional new parameters on `opencode_run` (backward compatible — all new fields are optional, existing callers pass only `sessionId` and `prompt`)
- Internal implementation change to `opencode_run` (AbortController vs Promise.race — same external behaviour, better cancellation)

The only observable difference for existing users of `opencode_run` is that on timeout the abort error message changes from a custom string to `AbortError: This operation was aborted` (or similar platform wording). This is a cosmetic change and not a breaking API change.

---

## Tool Naming

`opencode_session_list`, `opencode_session_get`, `opencode_session_messages`, `opencode_session_delete` follow the established convention and are correct.

The convention is `opencode_<noun>_<verb>` where noun groups related tools. Existing tools use `opencode_create_session` (noun=create, which is awkward) — that is a v1.0 decision locked in. For new tools, the `opencode_session_*` grouping is more consistent and more ergonomic: Claude Code can autocomplete `opencode_session_` and see all session management tools together.

Do not introduce a variant like `opencode_list_sessions` — that would mix two naming conventions in the same server.

---

## Scalability Considerations

Not applicable — single user, personal tool, no scaling concerns. The architecture is intentionally minimal.

---

## Sources

- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/src/index.ts` — v1.0 implementation
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — SDK type definitions (SessionPromptData, SessionMessagesData, SessionDeleteData, SessionGetData, SessionListData)
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — SDK client class definitions (Session class methods)
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts` — Config extends RequestInit (signal passthrough mechanism)
- `/mnt/c/Users/larry/Documents/repos/personal/supervisor/.planning/PROJECT.md` — v2.0 feature scope and key decisions
