# Confirmed @opencode-ai/sdk Method Names

Source file: node_modules/@opencode-ai/sdk/dist/gen/sdk.gen.d.ts
Confirmed: 2026-04-26

## IMPORTANT: Method Names Differ from RESEARCH.md Assumptions

The research assumed `session{Verb}` naming (e.g., `sessionCreate`, `sessionPrompt`). The actual SDK
uses short verb names on the `session` sub-client, with ONE exception: the permissions endpoint is
on the TOP-LEVEL client as `postSessionIdPermissionsPermissionId`, NOT on `client.session`.

| OpenCode Endpoint | SDK Call | MCP Tool That Uses It |
|-------------------|----------|-----------------------|
| POST /session | `client.session.create({ body: { title?, parentID? } })` | opencode_create_session |
| POST /session/{id}/message | `client.session.prompt({ path: { id }, body: { parts: [...] } })` | opencode_run |
| GET /session/{id}/diff | `client.session.diff({ path: { id }, query: { messageID? } })` | opencode_get_diff |
| POST /session/{id}/permissions/{permId} | `client.postSessionIdPermissionsPermissionId({ path: { id, permissionID }, body: { response } })` | opencode_approve_permission |
| POST /session/{id}/fork | `client.session.fork({ path: { id }, body: { messageID? } })` | opencode_fork |
| POST /session/{id}/revert | `client.session.revert({ path: { id }, body: { messageID, partID? } })` | opencode_revert |
| POST /session/{id}/abort | `client.session.abort({ path: { id } })` | opencode_abort |

## Notes

- Permission response enum (POST /session/{id}/permissions/{permId}): `"once" | "always" | "reject"` — confirmed at types.gen.d.ts line 2509. NOT `allow/deny/allow_always`.
- opencode_run: use `client.session.prompt(...)` — blocks until the agent loop completes. No AbortController/timeout.
- opencode_approve_permission: CRITICAL — the permissions method is on the TOP-LEVEL client (`client.postSessionIdPermissionsPermissionId`), NOT on `client.session`. RESEARCH.md and PATTERNS.md incorrectly showed this as `client.session.postSessionIdPermissionsPermissionId`.
- Importable types confirmed in types.gen.d.ts: `Session`, `FileDiff`, `AssistantMessage`, `Part`, `TextPart`, `ToolPart`
- Client factory: `createOpencodeClient(config?: Config & { directory?: string }): OpencodeClient` from `@opencode-ai/sdk`
- The naming is NOT `session{Verb}` — it uses short verbs: `create`, `prompt`, `abort`, `diff`, `fork`, `revert`

## RESEARCH.md Assumption Resolution

| Assumption | Status | Actual |
|------------|--------|--------|
| A1: `createOpencodeClient` is correct factory | CONFIRMED | `createOpencodeClient({ baseUrl })` from `@opencode-ai/sdk` works |
| A2: `client.session.sessionPrompt` is the run method | CORRECTED | Actual: `client.session.prompt(...)` |
| A3: Methods follow `session{Verb}` convention | CORRECTED | Actual: short verbs on `client.session.*`; one exception: permissions on top-level client |
