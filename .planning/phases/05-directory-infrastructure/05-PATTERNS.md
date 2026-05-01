# Phase 5: Directory Infrastructure - Pattern Map

**Mapped:** 2026-04-27
**Files analyzed:** 1 (src/index.ts — single-file refactor)
**Analogs found:** 1 / 1 (the file is its own analog — all 18 tool patterns live there)

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/index.ts` | utility + 18 tool handlers | request-response | `src/index.ts` (self) | exact — all existing tool handler patterns are the authoritative source |

No new files are being created. `resolveDirectory()` is added as a module-level helper inside `src/index.ts`. No `src/utils.ts` needed.

---

## Pattern Assignments

### `resolveDirectory()` helper — new function in `src/index.ts`

**Placement:** After the constants block (lines 10–12), before `const server = ...` (line 14).

**Constants block to follow** (`src/index.ts` lines 10–12):
```typescript
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '', 10) || 120_000;
const client = createOpencodeClient({ baseUrl: BASE_URL });
```

**New function to insert after line 12:**
```typescript
/**
 * Resolves which OpenCode project directory to target for a tool call.
 * Priority: per-tool `directory` param → OPENCODE_DEFAULT_PROJECT env var → undefined.
 * Returns undefined (not process.cwd()) so OpenCode uses its own session-level
 * directory tracking when no directory is explicitly provided.
 * Read at request time (inside the function body) so env changes take effect
 * without server restart (INFRA-03).
 */
export function resolveDirectory(perToolParam: string | undefined): string | undefined {
  return perToolParam ?? process.env.OPENCODE_DEFAULT_PROJECT ?? undefined;
}
```

**Why exported:** Phase 6 (auto-start) needs `resolveDirectory()` for `OPENCODE_DEFAULT_PROJECT` as the child-process cwd. Exporting from `src/index.ts` is safe because `package.json` uses `"type": "module"`.

---

### Tools with `directory` already in schema — update inline pattern to `resolveDirectory()`

These 11 tools already accept `directory` in their Zod schema but use the inline `directory ? { directory } : undefined` pattern directly, bypassing `OPENCODE_DEFAULT_PROJECT`. All must be updated to route through `resolveDirectory()`.

**Affected tools and their current handler lines:**

| Tool | Current handler line(s) | Current inline pattern |
|------|-------------------------|------------------------|
| `opencode_create_session` | line 30 | `query: directory ? { directory } : undefined` |
| `opencode_session_list` | line 298 | `query: directory ? { directory } : undefined` |
| `opencode_session_get` | line 321 | `query: directory ? { directory } : undefined` |
| `opencode_session_status` | line 343 | `query: directory ? { directory } : undefined` |
| `opencode_session_message` | line 396 | `query: directory ? { directory } : undefined` |
| `opencode_session_delete` | line 420 | `query: directory ? { directory } : undefined` |
| `opencode_session_rename` | line 447 | `query: directory ? { directory } : undefined` |
| `opencode_session_children` | line 470 | `query: directory ? { directory } : undefined` |
| `opencode_session_unrevert` | line 493 | `query: directory ? { directory } : undefined` |
| `opencode_session_messages` | line 371 | multi-param spread (see special case below) |

**Standard update pattern — copy from `opencode_session_get` (lines 318–329):**
```typescript
// BEFORE (lines 318–329):
async ({ sessionId, directory }) => {
  try {
    const { data, error } = await client.session.get({
      path: { id: sessionId },
      query: directory ? { directory } : undefined,
    });

// AFTER:
async ({ sessionId, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.session.get({
      path: { id: sessionId },
      query: dir ? { directory: dir } : undefined,
    });
```

**The two-step rule for all 11 existing tools:**
1. Add `const dir = resolveDirectory(directory);` as the first line of the handler body (before `try`)
2. Replace `directory ? { directory } : undefined` with `dir ? { directory: dir } : undefined`

---

### Tools missing `directory` entirely — add schema field + `resolveDirectory()` call

These 7 tools need both a Zod schema addition and handler update.

**Affected tools:**

| Tool | Current inputSchema ending | Handler signature |
|------|---------------------------|-------------------|
| `opencode_abort` | lines 45–47 | `async ({ sessionId })` |
| `opencode_run` | lines 73–87 | `async ({ sessionId, prompt, model, agent, system })` |
| `opencode_prompt_async` | lines 143–154 | `async ({ sessionId, prompt, model, agent, system })` |
| `opencode_get_diff` | lines 185–188 | `async ({ sessionId, messageID })` |
| `opencode_approve_permission` | lines 215–221 | `async ({ sessionId, permissionId, response })` |
| `opencode_fork` | lines 243–246 | `async ({ sessionId, messageID })` |
| `opencode_revert` | lines 265–270 | `async ({ sessionId, messageID, partID })` |
| `opencode_session_command` | lines 517–526 | `async ({ sessionId, command, arguments: args, messageID, agent, model })` |

**Schema field to add (copy verbatim to all 7):**
```typescript
directory: z.string().optional().describe(
  'Absolute path to the project root. Routes this call to the OpenCode project at the specified path. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'
),
```

**Description note for prompt-type tools** (`opencode_run`, `opencode_prompt_async`, `opencode_session_command`): The description should say "Routes this call to the OpenCode project at the specified path. Does not change the session's working directory." — not "sets working directory."

**Standard handler update (copy from `opencode_abort` analog pattern — simplest case):**

The simplest case to copy is the standard query pattern from `opencode_session_get` (lines 318–329). For tools like `opencode_abort` that have no existing query at all:

```typescript
// BEFORE (lines 49–57):
async ({ sessionId }) => {
  try {
    const { data, error } = await client.session.abort({ path: { id: sessionId } });

// AFTER:
async ({ sessionId, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.session.abort({
      path: { id: sessionId },
      query: dir ? { directory: dir } : undefined,
    });
```

**`opencode_approve_permission` special case** — uses top-level client method, not `client.session`:
```typescript
// BEFORE (lines 222–229):
async ({ sessionId, permissionId, response }) => {
  try {
    const { data, error } = await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response },
    });

// AFTER:
async ({ sessionId, permissionId, response, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.postSessionIdPermissionsPermissionId({
      path: { id: sessionId, permissionID: permissionId },
      body: { response },
      query: dir ? { directory: dir } : undefined,
    });
```

---

### Special Cases — Multiple Query Params

Two tools have additional query params alongside `directory` and must use the spread pattern.

**`opencode_session_messages` — preserves `limit` alongside `directory`**

Current pattern (`src/index.ts` lines 367–378):
```typescript
async ({ sessionId, limit, directory }) => {
  try {
    const { data, error } = await client.session.messages({
      path: { id: sessionId },
      query: { ...(limit !== undefined ? { limit } : {}), ...(directory ? { directory } : {}) },
    });
```

Updated pattern:
```typescript
async ({ sessionId, limit, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.session.messages({
      path: { id: sessionId },
      query: {
        ...(limit !== undefined ? { limit } : {}),
        ...(dir ? { directory: dir } : {}),
      },
    });
```

**`opencode_get_diff` — preserves `messageID` alongside `directory`**

Current pattern (`src/index.ts` lines 189–204):
```typescript
async ({ sessionId, messageID }) => {
  try {
    const { data, error } = await client.session.diff({
      path: { id: sessionId },
      query: messageID ? { messageID } : undefined,
    });
```

Updated pattern (after adding `directory` to schema):
```typescript
async ({ sessionId, messageID, directory }) => {
  const dir = resolveDirectory(directory);
  try {
    const { data, error } = await client.session.diff({
      path: { id: sessionId },
      query: {
        ...(messageID ? { messageID } : {}),
        ...(dir ? { directory: dir } : {}),
      },
    });
```

**`opencode_run` — preserves AbortController signal, no query currently**

Current pattern (`src/index.ts` lines 89–130) — AbortController must be preserved:
```typescript
async ({ sessionId, prompt, model, agent, system }) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await client.session.prompt({
      path: { id: sessionId },
      body: { ... },
      signal: controller.signal,
    });
```

Updated pattern:
```typescript
async ({ sessionId, prompt, model, agent, system, directory }) => {
  const dir = resolveDirectory(directory);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const { data, error } = await client.session.prompt({
      path: { id: sessionId },
      body: { ... },
      signal: controller.signal,
      query: dir ? { directory: dir } : undefined,
    });
```

---

## Shared Patterns

### Error Handling
**Source:** `src/index.ts` — consistent across all 18 tools
**Apply to:** All 18 tool handlers (no change needed — this is already uniform)
```typescript
try {
  const { data, error } = await client.session.<method>({ ... });
  if (error) throw new Error(JSON.stringify(error));
  return { content: [{ type: 'text', text: JSON.stringify(data) }] };
} catch (err) {
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

### Query Param — Standard (single directory param)
**Source:** `src/index.ts` lines 320–322 (`opencode_session_get`)
**Apply to:** 15 of the 18 tools (all except the 3 multi-param special cases)
```typescript
const dir = resolveDirectory(directory);
// ...
query: dir ? { directory: dir } : undefined,
```

### Query Param — Spread (directory + additional query params)
**Source:** `src/index.ts` lines 370–372 (`opencode_session_messages`)
**Apply to:** `opencode_session_messages`, `opencode_get_diff`
```typescript
const dir = resolveDirectory(directory);
// ...
query: {
  ...(otherParam !== undefined ? { otherParam } : {}),
  ...(dir ? { directory: dir } : {}),
},
```

### Zod Schema — directory field
**Source:** `src/index.ts` lines 22–23 (`opencode_create_session`) and lines 314–315 (`opencode_session_get`)
**Apply to:** The 7 tools currently missing the field
```typescript
directory: z.string().optional().describe(
  'Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'
),
```

---

## No Analog Found

None. All patterns are sourced directly from `src/index.ts`. This is a pure refactor of an existing single-file codebase.

---

## Anti-Patterns (Do Not Copy)

These patterns appear in the current `src/index.ts` and must NOT be carried forward after Phase 5:

| Anti-Pattern | Location in current file | Why to avoid |
|--------------|--------------------------|--------------|
| `directory ? { directory } : undefined` inline | 11 tool handlers | Bypasses `OPENCODE_DEFAULT_PROJECT`; replace with `resolveDirectory()` |
| No `directory` param in schema | 7 tool handlers | Inconsistent tool surface; breaks env-var fallback |
| `const DEFAULT_DIR = process.env.OPENCODE_DEFAULT_PROJECT` at module scope | (does not exist — avoid adding) | Violates INFRA-03; env changes require server restart |

---

## Metadata

**Analog search scope:** `src/index.ts` (559 lines, read in full — single file codebase for MCP tools)
**Files scanned:** 1
**Pattern extraction date:** 2026-04-27
