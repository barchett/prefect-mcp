---
phase: 12-shell-workspace-api-wrappers
reviewed: 2026-04-30T14:04:36Z
depth: standard
files_reviewed: 1
files_reviewed_list:
  - src/index.ts
findings:
  critical: 0
  warning: 2
  info: 2
  total: 4
status: issues_found
---

# Phase 12: Code Review Report

**Reviewed:** 2026-04-30T14:04:36Z
**Depth:** standard
**Files Reviewed:** 1
**Status:** issues_found

## Summary

Phase 12 adds ten new MCP tool registrations to `src/index.ts`: `prefect_vcs_info`, `prefect_file_status`, `prefect_list_mcp_servers`, `prefect_get_config`, `prefect_list_commands`, `prefect_session_shell`, `prefect_inject_mcp_server`, `prefect_list_tools`, `prefect_find_file`, and `prefect_get_file_content`.

The tools follow the established patterns from `src/config.ts` and prior phases correctly: `resolveDirectory()` is always the first handler line, all SDK calls use the `dir ? { directory: dir } : undefined` conditional, and every handler has a try/catch that returns `isError: true`. No security vulnerabilities were found.

Two warnings stand out: `prefect_inject_mcp_server` silently swallows two required-but-marked-optional params (`commandArgs` and `url`) by falling back to empty values rather than returning a validation error, and `prefect_list_tools` silently discards a lone `provider` or `model` param instead of returning an error. Both will produce confusing OpenCode server errors with no actionable message at the Prefect layer.

## Warnings

### WR-01: `prefect_inject_mcp_server` — silent fallback for required `commandArgs` and `url` fields

**File:** `src/index.ts:1239-1252`
**Issue:** When `configType === "local"`, `commandArgs` is Zod-typed `.optional()` but is functionally required. The code uses `commandArgs ?? []` (line 1243) to fall back to an empty array. An empty `command` array will be forwarded to OpenCode and fail server-side with a cryptic error. The caller receives no validation feedback at the Prefect layer. The same applies to `url ?? ''` (line 1248) when `configType === "remote"` and `url` is omitted. Both fields are documented as required in their descriptions but not enforced in code.

**Fix:** Add explicit runtime guards before the SDK call:
```typescript
async ({ name, configType, commandArgs, environment, url, headers, enabled, timeout, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    if (configType === 'local' && (!commandArgs || commandArgs.length === 0)) {
      throw new Error('prefect_inject_mcp_server: commandArgs is required when configType is "local"');
    }
    if (configType === 'remote' && !url) {
      throw new Error('prefect_inject_mcp_server: url is required when configType is "remote"');
    }
    const config: import('@opencode-ai/sdk').McpLocalConfig | import('@opencode-ai/sdk').McpRemoteConfig =
      configType === 'local'
        ? {
            type: 'local',
            command: commandArgs!,   // safe after guard above
            ...
          }
        : {
            type: 'remote',
            url: url!,               // safe after guard above
            ...
          };
    ...
```

Alternatively, model the schema as a discriminated union so Zod enforces the constraint before execution:
```typescript
inputSchema: z.discriminatedUnion('configType', [
  z.object({
    name: z.string()...,
    configType: z.literal('local'),
    commandArgs: z.array(z.string()).min(1),
    ...
  }),
  z.object({
    name: z.string()...,
    configType: z.literal('remote'),
    url: z.string().url(),
    ...
  }),
]),
```

---

### WR-02: `prefect_list_tools` — lone `provider` or `model` param silently ignored

**File:** `src/index.ts:1279`
**Issue:** The guard `if (provider && model)` routes to the detailed endpoint only when both are present. If a caller passes `provider` but omits `model` (or vice versa), the condition is false and the code silently falls through to the `ids` endpoint — discarding the provided param with no error or warning. The description says "Both provider and model are required together when using the detailed endpoint," but a caller who passes only one gets a misleading success response from the wrong endpoint.

**Fix:** Add an explicit half-populated check before the branch:
```typescript
async ({ provider, model, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    if ((provider && !model) || (!provider && model)) {
      throw new Error('prefect_list_tools: provider and model must be supplied together; omit both for tool IDs only');
    }
    if (provider && model) {
      // detailed endpoint
      ...
    } else {
      // ids endpoint
      ...
    }
```

## Info

### IN-01: Comment numbering inconsistency — tools inserted out of declared API order

**File:** `src/index.ts:1067-1361`
**Issue:** The ten tools are inserted in the order: API-04, API-05, API-06, API-11, API-12, SESSION-14, API-07, API-08, API-09, API-10. The requirement ID comments jump from API-06 to API-11, skipping API-07 through API-10, which appear later in the block. This does not affect runtime behavior but makes it harder to find a tool by scanning comments sequentially.

**Fix:** Either reorder the registrations to match requirement ID sequence (API-04 → API-05 → API-06 → API-07 → ... → API-12 → SESSION-14), or add a brief note in the leading comment explaining the insertion order (e.g., grouped by pattern type).

---

### IN-02: `prefect_get_config` returns raw credentials without any redaction hint in the MCP response

**File:** `src/index.ts:1136-1157`
**Issue:** The tool description correctly warns "The response may contain API keys or provider credentials — treat as sensitive." However, the MCP response content type is `"text"` with no annotation, and the MCP protocol has no built-in mechanism to mark a response as sensitive. Any MCP client that logs tool responses will persist credentials. This is a documentation and operational gap, not a code bug per se.

**Fix:** Consider adding `// NOTE: This endpoint returns credentials. Do not log or cache the response.` as an inline comment in the handler, and ensure the warning in the description is prominent enough for callers. If the SDK ever supports response metadata (e.g., `isSensitive` flag), apply it here.

---

_Reviewed: 2026-04-30T14:04:36Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
