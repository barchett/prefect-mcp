---
phase: 01-mcp-server
reviewed: 2026-04-26T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - package.json
  - tsconfig.json
  - .gitignore
  - src/index.ts
findings:
  critical: 0
  warning: 3
  info: 2
  total: 5
status: issues_found
---

# Phase 01: Code Review Report

**Reviewed:** 2026-04-26
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the initial MCP server implementation: `src/index.ts` plus project configuration files. The overall structure is sound — correct stdio transport usage, no console.log on stdout, proper error wrapping, and consistent try/catch coverage across all 7 tools.

Three warnings are raised: a Zod v4 / MCP SDK compatibility risk that could cause runtime failures, an inconsistent `String(data)` serialization pattern that silently drops structured response data in two tools, and a potential empty-object body issue in `opencode_fork`. Two info items cover a floating `@types/node` dependency and an unnecessary `undefined` property in the `create_session` body.

No security issues found. No hardcoded secrets. Stdio hygiene is correct throughout.

## Warnings

### WR-01: Zod v4 incompatibility with MCP SDK 1.x

**File:** `package.json:13`
**Issue:** `"zod": "4.3.6"` installs Zod v4, which introduced breaking API changes. The MCP SDK (`@modelcontextprotocol/sdk@1.29.0`) internally imports from `zod` and was built against Zod v3. If the SDK uses APIs that changed between v3 and v4 (e.g., `z.object().shape`, `ZodObject`, `.parse` error shape), tool registration or schema validation will throw at runtime in ways that are hard to trace.

**Fix:** Pin Zod to the v3 line until MCP SDK explicitly declares v4 support:
```json
"zod": "^3.23.8"
```
Verify by checking `@modelcontextprotocol/sdk`'s `peerDependencies` or `dependencies` field in `node_modules/@modelcontextprotocol/sdk/package.json` after install.

---

### WR-02: `String(data)` silently drops structured response objects

**File:** `src/index.ts:126` (opencode_approve_permission), `src/index.ts:175` (opencode_revert)
**Issue:** Both tools call `String(data)` to serialize the API response. `String()` on a plain object produces `"[object Object]"` — all response content is silently discarded. The pattern is used correctly for `opencode_abort` at line 46 (where the API is documented to return a boolean and `String(true)` = `"true"`), but the approve-permission and revert endpoints are not documented as returning bare booleans, and the OpenCode SDK may return structured objects.

This is an information-loss bug: the tool appears to succeed (no `isError`), but the caller receives an opaque string instead of the actual response.

**Fix:** Use `JSON.stringify(data)` consistently, matching the pattern used by all other tools:
```typescript
// line 126
return { content: [{ type: 'text', text: JSON.stringify(data) }] };

// line 175
return { content: [{ type: 'text', text: JSON.stringify(data) }] };
```
If the API is confirmed to return a bare boolean for both endpoints, `String(data)` is safe but `JSON.stringify(data)` still works correctly (`JSON.stringify(true)` = `"true"`), so there is no downside to using it.

---

### WR-03: `opencode_fork` passes empty object body instead of omitting body

**File:** `src/index.ts:147`
**Issue:** When `messageID` is absent, the fork call sends `body: {}`:
```typescript
body: messageID ? { messageID } : {},
```
If the OpenCode API's POST `/session/{id}/fork` schema marks the body as optional and treats an empty object differently from an absent body — or if it requires the body to be omitted entirely when no `messageID` is provided — this will produce a 400 or unexpected behavior. The OpenCode SDK may also perform body validation before sending.

**Fix:** Pass `undefined` instead of `{}` when there is no `messageID`:
```typescript
body: messageID ? { messageID } : undefined,
```
This signals to the SDK that no body should be sent, which is consistent with how `opencode_get_diff` handles its optional `query` parameter at line 93.

---

## Info

### IN-01: Floating `@types/node` dependency produces non-deterministic builds

**File:** `package.json:17`
**Issue:** `"@types/node": "latest"` resolves to whatever is newest at install time. Different developers or CI runs may get different type definitions, causing builds to fail or behave differently across environments.

**Fix:** Pin to a specific major version matching the target Node.js runtime:
```json
"@types/node": "^20.0.0"
```

---

### IN-02: `undefined` title property included in session create body

**File:** `src/index.ts:24`
**Issue:** When `title` is not provided, `{ title: undefined }` is passed as the request body. Most HTTP clients serialize this as `{}` (JSON.stringify drops undefined values), so it is harmless in practice. However, some SDK implementations may send `{"title": null}` or fail schema validation on an explicit undefined key.

**Fix:** Conditionally include `title` only when defined:
```typescript
const { data, error } = await client.session.create({
  body: title !== undefined ? { title } : {},
});
```
Or rely on optional chaining if the SDK's TypeScript types accept `title?: string` in the body type, in which case passing `{ title }` is fine and this is a non-issue.

---

_Reviewed: 2026-04-26_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
