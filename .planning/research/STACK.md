# Technology Stack

**Project:** Prefect v2.0 (stack additions)
**Researched:** 2026-04-26
**Confidence:** HIGH — all findings verified directly from installed SDK types and Node.js docs

---

## Verdict: No New Runtime Dependencies Required

Every v2.0 feature can be implemented with the packages already installed. The analysis below explains why, and documents the exact API patterns to use.

---

## Existing Stack (unchanged)

| Technology | Version | Purpose |
|------------|---------|---------|
| TypeScript | 6.0.3 | Language |
| Node.js | 20.x (runtime) | Process host |
| @modelcontextprotocol/sdk | 1.29.0 | MCP server + StdioServerTransport |
| @opencode-ai/sdk | 1.14.25 | OpenCode HTTP client |
| zod | 4.3.6 | Tool input schema validation |

---

## Feature-by-Feature Analysis

### 1. Session Management Tools (list, get, messages, delete)

**No new dependencies.** All four operations are already in the installed SDK.

Verified from `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts`:

```typescript
client.session.list(options?)            // GET /session
client.session.get({ path: { id } })     // GET /session/{id}
client.session.messages({ path: { id }, query?: { limit? } })  // GET /session/{id}/message
client.session.delete({ path: { id } })  // DELETE /session/{id}
```

Response shapes (from `types.gen.d.ts`):
- `list` → `Array<Session>`
- `get` → `Session`
- `messages` → `Array<{ info: Message; parts: Array<Part> }>`
- `delete` → `boolean`

All follow the same `{ data, error }` destructuring pattern already used in v1.0.

---

### 2. opencode_run Enhancements

**No new dependencies.** All new fields are already accepted by `session.prompt()`.

Verified `SessionPromptData.body` type from `types.gen.d.ts` line 2241:

```typescript
body?: {
  messageID?: string;
  model?: {
    providerID: string;  // provider override
    modelID: string;     // model override
  };
  agent?: string;        // agent selection (e.g. "build", "research")
  noReply?: boolean;     // fire-and-forget async mode
  system?: string;       // system prompt override
  tools?: { [key: string]: boolean };  // v3.0 target
  parts: Array<TextPartInput | FilePartInput | AgentPartInput | SubtaskPartInput>;
}
```

`noReply` warrants a note: when `true`, the server starts the session and returns immediately without waiting for completion. This changes `opencode_run` semantics from blocking to fire-and-forget. The existing `Promise.race` / AbortController timeout should be bypassed or set very short when `noReply: true` is passed, since the response returns quickly.

---

### 3. Timeout Fix: AbortController

**No new dependencies.** `AbortController` is built into Node.js since v15; running on Node 20.

**Key finding:** The `@opencode-ai/sdk` `Config` interface extends `Omit<RequestInit, "body" | "headers" | "method">`. `RequestInit` includes `signal?: AbortSignal | null`. This means `signal` passes through to the underlying `fetch` call — AbortController works at the SDK call level, not just at the Promise level.

Correct pattern for `opencode_run`:

```typescript
async ({ sessionId, prompt }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await client.session.prompt({
      path: { id: sessionId },
      body: { parts: [{ type: 'text', text: prompt }] },
      signal: controller.signal,  // passes through RequestInit.signal
    });
    clearTimeout(timer);
    if (error) throw new Error(JSON.stringify(error));
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (err) {
    clearTimeout(timer);
    if ((err as Error).name === 'AbortError') {
      return {
        content: [{ type: 'text', text: `opencode_run timed out after ${TIMEOUT_MS / 1000}s` }],
        isError: true,
      };
    }
    return { content: [{ type: 'text', text: String(err) }], isError: true };
  }
}
```

Why AbortController over `Promise.race`: `Promise.race` leaves the underlying HTTP request open (the fetch continues consuming the connection even after the race resolves). AbortController actually cancels the in-flight HTTP request, freeing the TCP connection to OpenCode. This matters for the long-lived `/session/{id}/message` endpoint.

---

### 4. prefect init CLI

**No new dependencies.** Use a separate entry point; `process.argv` is sufficient.

**Approach: separate entry point `src/init.ts` → `build/init.js`**

Rationale:
- `src/index.ts` starts an MCP server on stdio. If `prefect init` were added as a subcommand inside index.ts, Claude Code would have to detect the invocation context and branch — awkward for a stdio server that communicates via JSON-RPC.
- A separate file keeps concerns separated: `index.js` = MCP server, `init.js` = one-shot CLI.
- No need for commander or yargs. The only argument is the target directory (optional, default `process.cwd()`). Raw `process.argv[2]` is enough.

CLI contract:
```
prefect-init [directory]   # writes .mcp.json in directory (default: cwd)
```

`package.json` bin addition:
```json
"bin": {
  "prefect": "./build/index.js",
  "prefect-init": "./build/init.js"
}
```

`init.ts` writes `.mcp.json` into the target directory with the canonical content and exits. It only needs `node:fs`, `node:path`, `node:url` — all built in.

What `.mcp.json` should contain:
```json
{
  "mcpServers": {
    "prefect": {
      "type": "stdio",
      "command": "node",
      "args": ["<absolute-path-to-build/index.js>"]
    }
  }
}
```

The `init.ts` script needs to resolve the path to `build/index.js` relative to its own file location (using `import.meta.url`), not relative to cwd. This is the one tricky ESM detail — `__dirname` is not available; use `new URL('../build/index.js', import.meta.url)`.

---

### 5. Install Script (curl | bash)

**No new dependencies.** Pure shell.

**Recommended pattern: `git clone` + local `npm install` + symlink**

For a personal tool that is not published to npm, the idiomatic approach is:

```bash
#!/usr/bin/env bash
set -euo pipefail

INSTALL_DIR="${PREFECT_HOME:-$HOME/.prefect}"
REPO="https://github.com/<user>/supervisor.git"

git clone --depth 1 "$REPO" "$INSTALL_DIR"
cd "$INSTALL_DIR"
npm install
npm run build

# Make binaries available on PATH
mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL_DIR/build/index.js" "$HOME/.local/bin/prefect"
ln -sf "$INSTALL_DIR/build/init.js" "$HOME/.local/bin/prefect-init"

echo "Prefect installed. Run: prefect-init  (in any project)"
```

Why not `npm install -g`: global npm installs (`npm install -g .`) require the package to be published or use a local path. For a personal repo with a git URL, `git clone` + local build avoids npm publish friction. It also leaves the source editable in place — useful when iterating.

Why not npx: `npx github:<user>/supervisor` would work but requires the package to have a `prepublish` / `prepare` build step and the `main` field set correctly. For a personal tool this is more ceremony than value.

The install script should go in `scripts/install.sh`. The curl invocation in the README becomes:
```
curl -fsSL https://raw.githubusercontent.com/<user>/supervisor/main/scripts/install.sh | bash
```

---

## tsconfig.json Changes Required

**One change needed:** `rootDir` currently points to `src/`. Adding `src/init.ts` requires no change. However, `build` will output `build/init.js` alongside `build/index.js` automatically — this is correct.

No change to `include`, `outDir`, or `rootDir` is needed. TypeScript will compile both files in `src/` by default since `include` is `src/**/*`.

The `build` script in `package.json` currently runs `tsc && chmod 755 build/index.js`. Update to also chmod the init binary:
```json
"build": "tsc && chmod 755 build/index.js build/init.js"
```

---

## package.json Changes Required

```json
{
  "scripts": {
    "build": "tsc && chmod 755 build/index.js build/init.js"
  },
  "bin": {
    "prefect": "./build/index.js",
    "prefect-init": "./build/init.js"
  }
}
```

That's the only change needed.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| CLI arg parsing | Raw process.argv | commander / yargs | Single optional arg; no subcommands; no need for a 50KB dependency |
| Timeout mechanism | AbortController | Promise.race (current) | AbortController actually cancels the HTTP request; Promise.race leaves the connection open |
| Install mechanism | git clone + local build | npm install -g | Avoids npm publish; source stays editable; works with private repos |
| CLI entry point | Separate src/init.ts | Extend src/index.ts | MCP server starts on stdio; mixing init logic into the server creates awkward branching |

---

## Confidence Assessment

| Area | Confidence | Basis |
|------|------------|-------|
| SDK AbortController support | HIGH | `Config extends Omit<RequestInit, ...>` verified in installed types |
| SessionPromptData body fields | HIGH | `types.gen.d.ts` line 2241 directly examined |
| Session management SDK methods | HIGH | `sdk.gen.d.ts` Session class verified |
| noReply semantics change | HIGH | Type is `boolean` optional; "return immediately" confirmed from `sessionPromptAsync` parallel |
| tsconfig multi-entry | HIGH | Standard TypeScript behavior; `src/**/*` glob covers both files |
| install script approach | MEDIUM | Pattern is standard; specific paths depend on repo being public |

---

## Sources

- Installed package: `node_modules/@opencode-ai/sdk/dist/gen/types.gen.d.ts` (SessionPromptData)
- Installed package: `node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts` (Session class methods)
- Installed package: `node_modules/@opencode-ai/sdk/dist/gen/client/types.gen.d.ts` (Config extends RequestInit)
- Node.js 20 docs: AbortController global since Node 15, stable since Node 16
