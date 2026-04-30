# Phase 12: Shell + Workspace API Wrappers - Research

**Researched:** 2026-04-30
**Domain:** OpenCode SDK shell execution + workspace-level API endpoints
**Confidence:** HIGH

---

## Summary

Phase 12 adds ten new MCP tools wrapping the remaining OpenCode HTTP endpoints not yet exposed by Prefect: `prefect_session_shell` (POST /session/:id/shell), `prefect_vcs_info` (GET /vcs), `prefect_file_status` (GET /file/status), `prefect_list_mcp_servers` (GET /mcp), `prefect_inject_mcp_server` (POST /mcp), `prefect_list_tools` (GET /experimental/tool/ids + GET /experimental/tool), `prefect_find_file` (GET /find/file), `prefect_get_file_content` (GET /file/content), `prefect_get_config` (GET /config), and `prefect_list_commands` (GET /command). All ten endpoints exist in the installed `@opencode-ai/sdk` and are accessible via typed client methods — no new dependencies are needed.

Nine of the ten tools are simple pass-throughs following the established Phase 3/8/11 pattern: Zod input schema → `resolveDirectory()` → `client.<namespace>.<method>()` → error check → `JSON.stringify(data)` return. Two tools require extra attention: `prefect_session_shell` executes shell commands inside a session (elevated risk — requires `agent` + `command` in the body, returns `AssistantMessage`) and `prefect_inject_mcp_server` (API-07) modifies live OpenCode configuration (the POST /mcp body requires `name` + `config` where config is a `McpLocalConfig | McpRemoteConfig` discriminated union). `prefect_list_tools` (API-08) is the only multi-endpoint tool — it calls both `client.tool.ids()` and `client.tool.list()` as two separate tools since they have different required query params and distinct return types; the requirement is satisfied by one combined MCP tool that calls `client.tool.list()` for a specific model (requiring `provider` + `model` query params) and returns `Array<ToolListItem>`.

The seven workspace-level tools (API-04 through API-12 except API-07) are all workspace-level endpoints — they do NOT require a `sessionId` param. They use `client.vcs`, `client.file`, `client.mcp`, `client.tool`, `client.find`, `client.config`, and `client.command` namespaces respectively. SESSION-14 (`prefect_session_shell`) uses `client.session.shell()` and requires a `sessionId`.

**Primary recommendation:** Implement all ten tools in a single plan file (`12-01-PLAN.md`) — they share the same file target (`src/index.ts` only), follow the same structural pattern, and have no ordering dependencies. The two elevated-risk tools (SESSION-14 and API-07) are isolated in the plan with explicit schema and body documentation drawn from verified SDK types.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SESSION-14 | `prefect_session_shell` — wraps POST /session/:id/shell; executes a shell command within the session's context | `client.session.shell()` exists in SDK; body requires `agent: string` and `command: string`; optional `model: { providerID, modelID }`; returns `AssistantMessage` (same shape as `prefect_run` response `info` field) |
| API-04 | `prefect_vcs_info` — wraps GET /vcs; returns structured VCS/git info for the workspace | `client.vcs.get()` exists; no body, optional directory query; returns `VcsInfo: { branch: string }` |
| API-05 | `prefect_file_status` — wraps GET /file/status; returns git-tracked file status for the workspace | `client.file.status()` exists; no body, optional directory query; returns `Array<File>` where `File = { path, added, removed, status: "added"/"deleted"/"modified" }` |
| API-06 | `prefect_list_mcp_servers` — wraps GET /mcp; returns list of MCP servers configured in the OpenCode instance | `client.mcp.status()` exists; no body, optional directory query; returns `{ [key: string]: McpStatus }` |
| API-07 | `prefect_inject_mcp_server` — wraps POST /mcp; adds/configures an MCP server in OpenCode at runtime | `client.mcp.add()` exists; body requires `name: string` + `config: McpLocalConfig | McpRemoteConfig`; returns `{ [key: string]: McpStatus }` — the updated full MCP map |
| API-08 | `prefect_list_tools` — wraps GET /experimental/tool/ids + GET /experimental/tool; returns available tools per model | Two distinct SDK calls: `client.tool.ids()` (no required params, returns `Array<string>`) and `client.tool.list()` (requires `provider: string` + `model: string` query params, returns `Array<ToolListItem>`); implement as ONE MCP tool that accepts optional `provider` + `model` — call `.ids()` when both absent, call `.list()` when both present |
| API-09 | `prefect_find_file` — wraps GET /find/file; finds a file in the workspace by name or pattern, returns matching paths | `client.find.files()` exists (NOT `client.find.file`); query requires `query: string`; optional `directory`, optional `dirs: "true"/"false"`; returns `Array<string>` (paths) |
| API-10 | `prefect_get_file_content` — wraps GET /file/content; returns the content of a specific file in the workspace | `client.file.read()` exists; query requires `path: string`; optional `directory`; returns `FileContent: { type: "text"/"binary", content: string, diff?, patch?, encoding?, mimeType? }` |
| API-11 | `prefect_get_config` — wraps GET /config; returns the current OpenCode configuration object | `client.config.get()` exists; no body, optional directory query; returns full `Config` object (large, complex) — return as-is via `JSON.stringify(data)` |
| API-12 | `prefect_list_commands` — wraps GET /command; returns available slash commands | `client.command.list()` exists; no body, optional directory query; returns `Array<Command>` where `Command = { name, description?, agent?, model?, template, subtask? }` |
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
| Shell command execution in session context | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode runs the command in the session's environment; Prefect forwards call and returns AssistantMessage |
| VCS / git info retrieval | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode reads git state from the workspace; Prefect thin-wraps |
| File git-status listing | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode tracks workspace file changes; Prefect exposes as tool |
| MCP server inspection | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode manages its own MCP registry; Prefect queries it |
| MCP server injection at runtime | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode adds MCP server to its live config; Prefect sends the request |
| Tool introspection (available tools per model) | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode tracks which tools each model supports; Prefect queries two endpoints |
| File search by name/pattern | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode searches the workspace index; Prefect forwards query |
| File content retrieval | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode reads the file from disk; Prefect thin-wraps |
| Config inspection | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode holds its own config; Prefect exposes read-only view |
| Slash command enumeration | API / Backend (OpenCode) | MCP thin-wrapper (Prefect) | OpenCode manages available commands; Prefect surfaces the list |

**Key insight:** All ten capabilities are workspace-level or session-level operations that live in OpenCode. Prefect's role in every case is a thin pass-through. No new architectural tiers are introduced.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@opencode-ai/sdk` | already installed | SDK client with all 10 new endpoint methods | All methods verified present in installed types |
| `zod` | already installed | Input schema validation for all ten MCP tool registrations | Project-wide standard; every tool uses Zod |

No new dependencies required. [VERIFIED: node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts]

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
  - client.<namespace>.<method>() call
  - error check: if (error) throw new Error(JSON.stringify(error))
        |
        | HTTP (authenticated via fetchWithAuth)
        v
[OpenCode HTTP API — localhost:4096]
  POST /session/:id/shell      -> executes shell command, returns AssistantMessage
  GET  /vcs                    -> returns { branch: string }
  GET  /file/status            -> returns Array<{ path, added, removed, status }>
  GET  /mcp                    -> returns { [name]: McpStatus }
  POST /mcp                    -> adds MCP server, returns updated { [name]: McpStatus }
  GET  /experimental/tool/ids  -> returns Array<string> (all tool IDs)
  GET  /experimental/tool      -> returns Array<ToolListItem> (provider+model scoped)
  GET  /find/file              -> returns Array<string> (matching file paths)
  GET  /file/content           -> returns FileContent { type, content, ... }
  GET  /config                 -> returns Config (full config object)
  GET  /command                -> returns Array<Command>
        |
        v
[Prefect returns JSON.stringify(data) to MCP caller]
```

### Recommended Project Structure

No new files needed. All ten tools are registered directly in `src/index.ts` following the established pattern. The insertion point is immediately before `async function main()` (currently at line 1067), after the Phase 11 tool registrations ending around line 1065.

### Pattern 1: Standard Workspace Tool (no sessionId, optional directory)

Used by: API-04, API-05, API-06, API-11, API-12

```typescript
// Source: pattern from prefect_list_agents (src/index.ts lines 821-847)
server.registerTool(
  'prefect_<name>',
  {
    description: '<description>',
    inputSchema: z.object({
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.<namespace>.<method>({
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

### Pattern 2: Workspace Tool with Required Query Params

Used by: API-09 (query string), API-10 (path string)

```typescript
// Source: pattern from prefect_find_symbol (src/index.ts lines 877-911)
// API-09: prefect_find_file
server.registerTool(
  'prefect_find_file',
  {
    description: 'Find files in the OpenCode workspace matching a query string. Returns Array<string> of matching file paths. Optionally include directories in results via dirs param. Pass directory to scope the search to a project root.',
    inputSchema: z.object({
      query: z.string().describe('Filename or pattern to search for'),
      dirs: z.enum(['true', 'false']).optional().describe('Whether to include directory paths in results. Defaults to false.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ query: fileQuery, dirs, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.find.files({
        query: {
          query: fileQuery,
          ...(dirs ? { dirs } : {}),
          ...(dir ? { directory: dir } : {}),
        },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### Pattern 3: Session Tool with Required Body (SESSION-14 shell)

SESSION-14 requires `agent` + `command` in the body. The `body` in `SessionShellData` is typed as `body?: { agent: string; model?: {...}; command: string }` — SDK types body as optional, but `agent` and `command` are required strings within it. Model override follows the established pattern from `prefect_run`.

```typescript
// Source: body pattern from prefect_run (src/index.ts lines 84-159)
// SessionShellData.body fields: agent (required), command (required), model (optional)
server.registerTool(
  'prefect_session_shell',
  {
    description: 'Execute a shell command in the context of an OpenCode session. WARNING: Executes arbitrary shell commands in the session\'s working directory. Returns AssistantMessage containing command output. agent and command are required. model override is optional.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      command: z.string().describe('Shell command to execute'),
      agent: z.string().describe('Required. The agent context for command execution (e.g. "general").'),
      model: z.object({
        providerID: z.string(),
        modelID: z.string(),
      }).optional().describe('Optional model override. Both providerID and modelID required together.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, command, agent, model, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.shell({
        path: { id: sessionId },
        body: {
          agent,
          command,
          ...(model ? { model } : {}),
        },
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

### Pattern 4: POST with Complex Body (API-07 inject_mcp_server)

`McpAddData.body` requires `name: string` + `config: McpLocalConfig | McpRemoteConfig`. The config discriminated union uses a `type` field: `"local"` or `"remote"`.

```typescript
// API-07: prefect_inject_mcp_server
// McpLocalConfig: { type: "local", command: Array<string>, environment?: {...}, enabled?, timeout? }
// McpRemoteConfig: { type: "remote", url: string, enabled?, headers?: {...}, ... }
server.registerTool(
  'prefect_inject_mcp_server',
  {
    description: 'Add an MCP server to the OpenCode instance at runtime. For local servers, pass configType: "local" with commandArgs (the command + arguments array). For remote servers, pass configType: "remote" with url. Returns the updated MCP server map.',
    inputSchema: z.object({
      name: z.string().describe('Name for this MCP server (unique key in OpenCode\'s MCP registry)'),
      configType: z.enum(['local', 'remote']).describe('"local" for stdio subprocess MCP servers; "remote" for HTTP/SSE MCP servers'),
      // local fields
      commandArgs: z.array(z.string()).optional().describe('Required when configType is "local". Command and arguments to run the MCP server as an array (e.g. ["node", "/path/to/server.js"])'),
      environment: z.record(z.string(), z.string()).optional().describe('Environment variables to set when running a local MCP server'),
      // remote fields
      url: z.string().optional().describe('Required when configType is "remote". URL of the remote MCP server'),
      headers: z.record(z.string(), z.string()).optional().describe('Optional headers to include with remote MCP server requests'),
      // shared
      enabled: z.boolean().optional().describe('Whether to enable this MCP server on startup. Defaults to true.'),
      timeout: z.number().int().positive().optional().describe('Timeout in ms for fetching tools from the MCP server. Applies to local servers only. Default: 5000.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ name, configType, commandArgs, environment, url, headers, enabled, timeout, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const config: import('@opencode-ai/sdk').McpLocalConfig | import('@opencode-ai/sdk').McpRemoteConfig =
        configType === 'local'
          ? {
              type: 'local',
              command: commandArgs ?? [],
              ...(environment ? { environment } : {}),
              ...(enabled !== undefined ? { enabled } : {}),
              ...(timeout !== undefined ? { timeout } : {}),
            }
          : {
              type: 'remote',
              url: url ?? '',
              ...(headers ? { headers } : {}),
              ...(enabled !== undefined ? { enabled } : {}),
            };
      const { data, error } = await client.mcp.add({
        body: { name, config },
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

### Pattern 5: Dual-Endpoint Tool (API-08 list_tools)

`client.tool.ids()` takes no required params and returns `Array<string>`. `client.tool.list()` requires `provider: string` + `model: string` query params and returns `Array<ToolListItem>`. These are two different endpoints exposed as one MCP tool with optional params that determine which call is made.

```typescript
// API-08: prefect_list_tools — branches on whether provider + model are both supplied
server.registerTool(
  'prefect_list_tools',
  {
    description: 'List tools available in the OpenCode instance. When provider and model are both omitted, returns all tool IDs (Array<string>) via GET /experimental/tool/ids. When both provider and model are supplied, returns tool details (Array<{ id, description, parameters }>) for that specific model via GET /experimental/tool. Both provider and model are required together when using the detailed endpoint.',
    inputSchema: z.object({
      provider: z.string().optional().describe('Provider ID (e.g. "anthropic"). Required when model is provided.'),
      model: z.string().optional().describe('Model ID (e.g. "claude-sonnet-4-6"). Required when provider is provided.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ provider, model, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      if (provider && model) {
        // GET /experimental/tool — requires provider + model
        const { data, error } = await client.tool.list({
          query: {
            provider,
            model,
            ...(dir ? { directory: dir } : {}),
          },
        });
        if (error) throw new Error(JSON.stringify(error));
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      } else {
        // GET /experimental/tool/ids — no required params
        const { data, error } = await client.tool.ids({
          query: dir ? { directory: dir } : undefined,
        });
        if (error) throw new Error(JSON.stringify(error));
        return { content: [{ type: 'text', text: JSON.stringify(data) }] };
      }
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);
```

### Anti-Patterns to Avoid

- **Using `client.find.file()` (singular) for prefect_find_file:** The SDK method is `client.find.files()` (plural). There is no `client.find.file()` — that call does not exist.
- **Using `client.file.list()` for prefect_get_file_content:** `client.file.list()` lists directories (requires `path` query param pointing to a directory). The correct method for file content is `client.file.read()`. Do not confuse these.
- **Using `client.mcp.status()` for prefect_list_mcp_servers and `client.mcp.add()` for prefect_inject_mcp_server:** This is correct — but note the SDK method names differ from the tool names: "status" for the GET list, "add" for the POST inject.
- **Treating `SessionShellData.body` as optional:** The SDK types it as `body?: { agent: string; command: string; model?: {...} }`. However, `agent` and `command` within the body are non-optional strings — the server will reject calls without them. Mark them required in the Zod schema.
- **Using `client.tool.list()` without required query params:** `ToolListData.query` is typed as `query: { directory?: string; provider: string; model: string }` — `provider` and `model` are REQUIRED (no `?`). Do not call `client.tool.list()` without both present.
- **Sending null/empty string for McpLocalConfig.command:** `command: Array<string>` is required in `McpLocalConfig`. If `commandArgs` is not provided by the caller for a "local" type server, return an error or require it in the Zod schema validation (prefer marking required at Zod level).
- **Adding handlers.ts entries for these ten tools:** None of these tools are called by composite tools — they do not belong in `handlers.ts`.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| HTTP calls to /vcs, /mcp, etc. | Custom `fetchWithAuth()` calls with manual URL construction | `client.vcs.get()`, `client.mcp.status()`, etc. | SDK handles path serialization, auth headers, and response parsing |
| Shell command plumbing | Direct `child_process.exec()` or `fetch()` POST | `client.session.shell()` | OpenCode manages the shell context for the session; bypass breaks session tracking |
| MCP config object construction | Custom config format | `McpLocalConfig | McpRemoteConfig` discriminated union from SDK | SDK types define the exact accepted shape |
| File content decoding | Base64 decode logic | Return `FileContent` as-is via `JSON.stringify(data)` | Caller (Claude Code) handles the `type: "binary"` case; Prefect is a data layer |

---

## SDK Type Reference (VERIFIED)

All type information verified from:
- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts`
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts`

### SESSION-14: prefect_session_shell

**SDK client method:** `client.session.shell(options)` [VERIFIED: sdk.gen.d.ts line 188-190]
**HTTP:** POST /session/:id/shell
**Request body:**
```typescript
body?: {
  agent: string;            // REQUIRED within body — non-optional string
  model?: {
    providerID: string;
    modelID: string;
  };
  command: string;          // REQUIRED within body — non-optional string
}
```
**Path:** `{ id: sessionId }`
**Query:** `{ directory?: string }`
**Response:** `200: AssistantMessage` — same type as the `info` field returned by `prefect_run`. Callers can navigate it for session context.
**Errors:** 400 (BadRequestError), 404 (NotFoundError)

**MCP tool schema:** sessionId (required) + command (required) + agent (required) + model (optional object) + directory (optional)

**Safety note:** This tool executes arbitrary shell commands. The MCP tool description must explicitly warn callers of this. No additional sandboxing is possible at the Prefect layer — OpenCode manages the execution context.

### API-04: prefect_vcs_info

**SDK client method:** `client.vcs.get(options?)` [VERIFIED: sdk.gen.d.ts line 100-105]
**HTTP:** GET /vcs
**Request body:** `body?: never`
**Query:** `{ directory?: string }`
**Response:** `200: VcsInfo = { branch: string }` — only the current branch. No commit hash, no dirty status. [VERIFIED: types.gen.d.ts lines 1228-1230]

**MCP tool schema:** directory (optional only — no sessionId)

### API-05: prefect_file_status

**SDK client method:** `client.file.status(options?)` [VERIFIED: sdk.gen.d.ts line 253]
**HTTP:** GET /file/status
**Request body:** `body?: never`
**Query:** `{ directory?: string }`
**Response:** `200: Array<File>` where `File = { path: string; added: number; removed: number; status: "added" | "deleted" | "modified" }` [VERIFIED: types.gen.d.ts lines 1393-1398]

**MCP tool schema:** directory (optional only — no sessionId)

### API-06: prefect_list_mcp_servers

**SDK client method:** `client.mcp.status(options?)` [VERIFIED: sdk.gen.d.ts line 287-291]
**HTTP:** GET /mcp
**Request body:** `body?: never`
**Query:** `{ directory?: string }`
**Response:** `200: { [key: string]: McpStatus }` — a map from server name to status object.
`McpStatus` is a discriminated union: `McpStatusConnected | McpStatusDisabled | McpStatusFailed | McpStatusNeedsAuth | McpStatusNeedsClientRegistration` where each variant has a `status` field: `"connected" | "disabled" | "failed" | "needs_auth" | "needs_client_registration"`. [VERIFIED: types.gen.d.ts lines 1429-1446]

**MCP tool schema:** directory (optional only — no sessionId)

### API-07: prefect_inject_mcp_server

**SDK client method:** `client.mcp.add(options?)` [VERIFIED: sdk.gen.d.ts line 294-296]
**HTTP:** POST /mcp
**Request body:**
```typescript
body?: {
  name: string;
  config: McpLocalConfig | McpRemoteConfig;
}
```
Where:
```typescript
// McpLocalConfig (type: "local")
McpLocalConfig = {
  type: "local";
  command: Array<string>;        // command + args, e.g. ["node", "/path/server.js"]
  environment?: { [key: string]: string };
  enabled?: boolean;
  timeout?: number;              // ms, default 5000
}
// McpRemoteConfig (type: "remote")
McpRemoteConfig = {
  type: "remote";
  url: string;
  enabled?: boolean;
  headers?: { [key: string]: string };
  // oauth?: McpOAuthConfig — omit from MCP tool for simplicity
}
```
[VERIFIED: types.gen.d.ts lines 946-993]
**Response:** `200: { [key: string]: McpStatus }` — the full updated MCP server map
**Errors:** 400 (BadRequestError)

**MCP tool schema:** name (required) + configType ("local"/"remote" enum, required) + commandArgs (required for local) + url (required for remote) + optional: environment, headers, enabled, timeout, directory

**Note:** OAuth config (`McpOAuthConfig`) is part of `McpRemoteConfig` but is complex and rarely needed for CLI injection scenarios. Omit from the MCP tool's Zod schema to keep the interface manageable — callers who need OAuth-secured remote MCP servers should configure them via the OpenCode UI/config file.

### API-08: prefect_list_tools

**SDK client methods:**
- `client.tool.ids(options?)` — [VERIFIED: sdk.gen.d.ts line 78-80] — optional directory query, returns `ToolIds = Array<string>`
- `client.tool.list(options)` — [VERIFIED: sdk.gen.d.ts line 83-86] — **required** `query: { provider: string; model: string; directory?: string }`, returns `ToolList = Array<ToolListItem>`

```typescript
ToolListItem = {
  id: string;
  description: string;
  parameters: unknown;
}
```
[VERIFIED: types.gen.d.ts lines 1215-1223]

**Branching logic:** Call `.ids()` when `provider` + `model` are both absent. Call `.list()` when both are present. If only one is provided, return an error (same pattern as `prefect_run` model override — both required together).

**HTTP:** GET /experimental/tool/ids (ids path) and GET /experimental/tool (list path)

**MCP tool schema:** provider (optional) + model (optional) + directory (optional)

### API-09: prefect_find_file

**SDK client method:** `client.find.files(options)` [VERIFIED: sdk.gen.d.ts line 232-234]
**HTTP:** GET /find/file
**Request body:** `body?: never`
**Query (required):** `{ query: string; directory?: string; dirs?: "true" | "false" }`
[VERIFIED: types.gen.d.ts lines 2759-2768]
**Response:** `200: Array<string>` — array of file paths matching the query

**MCP tool schema:** query (required) + dirs (optional enum "true"/"false") + directory (optional)

**Note:** The `dirs` param uses string literals `"true"` / `"false"`, not boolean. Use `z.enum(['true', 'false'])` in Zod, not `z.boolean()`.

### API-10: prefect_get_file_content

**SDK client method:** `client.file.read(options)` [VERIFIED: sdk.gen.d.ts line 248-250]
**HTTP:** GET /file/content
**Request body:** `body?: never`
**Query (required):** `{ path: string; directory?: string }` — `path` is the file path to read
[VERIFIED: types.gen.d.ts lines 2806-2822]
**Response:** `200: FileContent`
```typescript
FileContent = {
  type: "text" | "binary";
  content: string;
  diff?: string;
  patch?: { oldFileName, newFileName, oldHeader?, newHeader?, hunks: Array<{...}>, index? };
  encoding?: "base64";
  mimeType?: string;
}
```
[VERIFIED: types.gen.d.ts lines 1372-1391]

**MCP tool schema:** path (required) + directory (optional)

**Note:** The `path` Zod param shadows the built-in `path` module import. Use `filePath` as the destructure name in the handler (same pattern as `prefect_find_symbol` uses `symbolQuery` for its `query` param): `const { path: filePath, directory } = args`.

### API-11: prefect_get_config

**SDK client method:** `client.config.get(options?)` [VERIFIED: sdk.gen.d.ts line 64-67]
**HTTP:** GET /config
**Request body:** `body?: never`
**Query:** `{ directory?: string }`
**Response:** `200: Config` — the full OpenCode configuration object (large, complex). Return via `JSON.stringify(data)` without modification.
[VERIFIED: types.gen.d.ts line 1016]

**MCP tool schema:** directory (optional only — no sessionId)

### API-12: prefect_list_commands

**SDK client method:** `client.command.list(options?)` [VERIFIED: sdk.gen.d.ts line 200-203]
**HTTP:** GET /command
**Request body:** `body?: never`
**Query:** `{ directory?: string }`
**Response:** `200: Array<Command>` where:
```typescript
Command = {
  name: string;
  description?: string;
  agent?: string;
  model?: string;
  template: string;
  subtask?: boolean;
}
```
[VERIFIED: types.gen.d.ts lines 1263-1273]

**MCP tool schema:** directory (optional only — no sessionId)

---

## Common Pitfalls

### Pitfall 1: Wrong SDK method name for find/file endpoint

**What goes wrong:** Using `client.find.file()` (singular) which does not exist in the SDK.
**Why it happens:** Natural language analogy with `client.find.symbols()`. The SDK pluralizes it: `client.find.files()`.
**How to avoid:** Verify against `sdk.gen.d.ts` — the `Find` class has `text()`, `files()`, and `symbols()` methods.
**Warning signs:** TypeScript error "Property 'file' does not exist on type 'Find'".

### Pitfall 2: Wrong SDK method name for file/content endpoint

**What goes wrong:** Using `client.file.content()` or `client.file.get()` which do not exist.
**Why it happens:** The endpoint URL is `/file/content` so `content()` seems natural. The SDK method is `client.file.read()`.
**How to avoid:** Use `client.file.read()` as verified from `sdk.gen.d.ts` line 248.
**Warning signs:** TypeScript error "Property 'content' does not exist on type 'File'".

### Pitfall 3: Confusing MCP namespace method names

**What goes wrong:** Using `client.mcp.list()` for GET /mcp or `client.mcp.create()` for POST /mcp.
**Why it happens:** Intuitive naming mismatch — the SDK uses `status()` for GET and `add()` for POST.
**How to avoid:** `client.mcp.status()` for GET /mcp (list), `client.mcp.add()` for POST /mcp (inject).
**Warning signs:** TypeScript error "Property 'list' does not exist on type 'Mcp'".

### Pitfall 4: Calling client.tool.list() without required provider+model params

**What goes wrong:** `ToolListData.query` has `provider: string` and `model: string` as non-optional — the TypeScript compiler rejects a call without them.
**Why it happens:** Treating the optional branching logic in the MCP tool as applying to the SDK call too.
**How to avoid:** Only call `client.tool.list()` inside the `if (provider && model)` branch. The `else` branch calls `client.tool.ids()`.
**Warning signs:** TypeScript error "Property 'provider' is missing in type '{ directory: string }'".

### Pitfall 5: `path` param shadowing `path` import in prefect_get_file_content

**What goes wrong:** The handler destructures `path` from args, shadowing the `import path from 'node:path'` at module scope.
**Why it happens:** The `FileReadData.query.path` field is named `path` — same as the Node module.
**How to avoid:** Rename the destructured param: `const { path: filePath, directory } = args`. Use `filePath` in the SDK call.
**Warning signs:** TypeScript error "This expression is not callable. Type 'typeof import("path")' has no call signatures."

### Pitfall 6: SESSION-14 agent field — treating it as truly optional at the API level

**What goes wrong:** Sending a shell request without the `agent` field because `SessionShellData.body` is typed `body?: {...}` suggesting the whole body is optional.
**Why it happens:** Same pattern as SESSION-11 and SESSION-13 where SDK typed bodies as optional but server rejected them.
**How to avoid:** Mark `agent` and `command` as required (`z.string()` without `.optional()`) in the Zod schema. Always include them in the body.
**Warning signs:** Server returns 400 with field validation error.

### Pitfall 7: McpLocalConfig.command is Array<string>, not a string

**What goes wrong:** Passing `command: "node /path/to/server.js"` (a single string) instead of `command: ["node", "/path/to/server.js"]` (an array).
**Why it happens:** Natural expectation that a shell command is a string.
**How to avoid:** `McpLocalConfig.command: Array<string>` — use `z.array(z.string())` in Zod. Describe in tool description: "pass as an array, e.g. `['node', '/path/to/server.js']`".
**Warning signs:** TypeScript error at compile time if passed as string; possible 400 from server at runtime.

---

## Code Examples

### prefect_vcs_info (simplest — no params except directory)

```typescript
// Source: pattern from prefect_list_agents (src/index.ts lines 821-847)
server.registerTool(
  'prefect_vcs_info',
  {
    description: 'Get VCS/git info for the OpenCode workspace. Returns { branch: string } with the current git branch. Pass directory to scope to a specific project root.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.vcs.get({
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

### prefect_get_file_content (required query param with rename to avoid shadowing)

```typescript
// Source: pattern from prefect_find_symbol (src/index.ts lines 877-911) — same destructure rename technique
server.registerTool(
  'prefect_get_file_content',
  {
    description: 'Get the content of a file in the OpenCode workspace. Returns { type: "text"|"binary", content: string, ... }. path is the file path — absolute or relative to directory if provided.',
    inputSchema: z.object({
      path: z.string().describe('File path to read (absolute, or relative to directory param)'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async (args) => {
    const { path: filePath, directory } = args;   // rename to avoid shadowing path module
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.file.read({
        query: {
          path: filePath,
          ...(dir ? { directory: dir } : {}),
        },
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

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| opencode_* naming | prefect_* naming | Phase 9 | All new tools use `prefect_` prefix |
| OPENCODE_DEFAULT_PROJECT | PREFECT_DEFAULT_PROJECT | Phase 9 | resolveDirectory() already handles both — no Phase 12 action needed |
| Direct authFetch calls | `client.<namespace>.<method>()` via SDK | Phase 3 baseline | SDK wraps HTTP; never use fetchWithAuth directly |

---

## Wave/Dependency Structure

All ten tools modify only `src/index.ts` and have no ordering dependencies between them. The plan can implement them as a single wave with sequential tasks:

**Recommended task order (single wave):**

1. SESSION-14: `prefect_session_shell` — elevated risk, document first, verify body schema
2. API-04: `prefect_vcs_info` — simplest workspace tool, confirms client.vcs.get() pattern
3. API-05: `prefect_file_status` — confirms client.file.status() pattern
4. API-06: `prefect_list_mcp_servers` — confirms client.mcp.status() pattern
5. API-07: `prefect_inject_mcp_server` — elevated risk, complex body
6. API-08: `prefect_list_tools` — dual-endpoint branching logic
7. API-09: `prefect_find_file` — required query param, dirs enum
8. API-10: `prefect_get_file_content` — required path param, rename technique
9. API-11: `prefect_get_config` — simple, returns large Config object
10. API-12: `prefect_list_commands` — simple, returns Array<Command>

**Gate:** `npm run build` after all 10 tasks. Tool count goes from 30 (after Phase 11's 5 tools are added to the current 25+5=30) to 40.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `SessionShellData.body.agent` and `SessionShellData.body.command` are required at runtime even though the whole `body?` is optional in the SDK type | CODE EXAMPLES — SESSION-14 | If wrong, `agent` could be omitted (lower risk); marking required in Zod schema is conservative and safe |
| A2 | Phase 11 tools will be in src/index.ts before Phase 12 execution (dependency: Phase 12 depends on Phase 11) | PLAN COUNT | If Phase 11 is not yet merged, the tool count calculation is off; not a blocking concern since Phase 12 appends tools |
| A3 | McpAddData.body.name + config fields are required at runtime (body typed as `body?: {...}`) | CODE EXAMPLES — API-07 | If wrong, the server would reject calls without name/config; marking required in Zod schema is conservative |

**All other claims were verified directly from installed SDK types.**

---

## Open Questions

1. **Does prefect_session_shell.body require agent to be a valid configured agent name, or any string?**
   - What we know: `SessionShellData.body.agent: string` — the type is just string, no enum.
   - What's unclear: Whether the server validates the agent name against configured agents.
   - Recommendation: Describe as "agent name (e.g. 'general')" in the tool description; let OpenCode return 400/404 if invalid — the `if (error) throw` path handles it.

2. **Does the McpAddData.body allow `body: undefined` (omitting body entirely) without 400 from server?**
   - What we know: `body?: { name: string; config: ... }` — body is optional in the type.
   - What's unclear: Whether the server would return 400 if no body is sent to POST /mcp.
   - Recommendation: Always include the body (name + config are required Zod fields) — safe behavior regardless.

---

## Environment Availability

Step 2.6: SKIPPED — Phase 12 is code-only changes to `src/index.ts`. The only external dependency is OpenCode running at `PREFECT_SERVER_URL`, which is already established by prior phases. No new tools, runtimes, or services are required.

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
| V5 Input Validation | yes | Zod schemas on all ten tool registrations |
| V6 Cryptography | no | Not applicable |

### Known Threat Patterns for Phase 12

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Arbitrary shell execution via `prefect_session_shell` | Elevation of Privilege | Personal-tool model: MCP caller (Claude Code) is trusted. OpenCode manages the execution context. Tool description explicitly warns callers. git is the safety net. |
| MCP server injection modifying live config | Tampering | `McpAddData` body validated by Zod. OpenCode validates the config shape server-side. Personal-use localhost — no remote injection vector. |
| Large Config response (API-11) exposing sensitive data | Information Disclosure | Config may contain API keys or credentials. Returned as-is to MCP caller (Claude Code). In personal-use model this is acceptable — Claude Code is the trusted orchestrator. |
| SSRF via directory param | Tampering | `resolveDirectory()` returns caller-supplied string; OpenCode validates it exists. Personal-use local service — accepted (same as all prior phases). |
| Session ID forgery in shell calls | Spoofing | sessionId forwarded directly; OpenCode returns 404 for invalid IDs via the `if (error) throw` path. |

---

## Sources

### Primary (HIGH confidence)

- `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` — Verified: `SessionShellData`, `VcsGetData`, `FileStatusData`, `McpStatusData`, `McpAddData`, `ToolIdsData`, `ToolListData`, `FindFilesData`, `FileReadData`, `ConfigGetData`, `CommandListData`; all response types; `McpLocalConfig`, `McpRemoteConfig`, `McpStatus`, `FileContent`, `File`, `VcsInfo`, `ToolIds`, `ToolListItem`, `Command` shapes
- `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` — Verified: `client.session.shell()`, `client.vcs.get()`, `client.file.status()`, `client.mcp.status()`, `client.mcp.add()`, `client.tool.ids()`, `client.tool.list()`, `client.find.files()`, `client.file.read()`, `client.config.get()`, `client.command.list()` method signatures and JSDoc
- `src/index.ts` — Verified: existing Phase 3–11 tool registration pattern, `resolveDirectory()` usage, `fetchWithAuth` wiring, error handling pattern, current insertion point (before `async function main()` at line 1067)

### Secondary (MEDIUM confidence)

None needed — all claims directly verified from installed SDK types and existing source files.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- SDK endpoint shapes: HIGH — verified directly from installed `@opencode-ai/sdk` types
- Return value structures: HIGH — verified from all response type definitions
- Body optionality runtime behavior: MEDIUM — SDK types are clear; UAT history from Phase 11 informs conservative approach of marking body fields required in Zod
- Multi-endpoint branching for API-08: HIGH — both SDK methods verified with distinct required params

**Research date:** 2026-04-30
**Valid until:** 2026-05-30 (SDK version is pinned; changes only if @opencode-ai/sdk is upgraded)
