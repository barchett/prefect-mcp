---
phase: 09-npm-distribution
reviewed: 2026-04-29T00:00:00Z
depth: standard
files_reviewed: 14
files_reviewed_list:
  - src/index.ts
  - src/auth.ts
  - src/config.ts
  - src/autostart.ts
  - src/handlers.ts
  - src/diff-patch.test.ts
  - src/session-command.test.ts
  - src/auth.test.ts
  - src/autostart.test.ts
  - package.json
  - src/cli.ts
  - CLAUDE.md
  - README.md
  - examples/test-task.md
findings:
  critical: 0
  warning: 4
  info: 5
  total: 9
status: issues_found
---

# Phase 09: Code Review Report

**Reviewed:** 2026-04-29T00:00:00Z
**Depth:** standard
**Files Reviewed:** 14
**Status:** issues_found

## Summary

Reviewed the full Prefect MCP server codebase scoped to the npm-distribution phase. The core server logic in `src/index.ts`, `src/handlers.ts`, `src/auth.ts`, `src/config.ts`, and `src/autostart.ts` is generally sound. The `prefect init` CLI in `src/cli.ts` introduces new functionality with one notable reliability gap on pnpm global installs. Tests cover the main behaviors but have isolation gaps. Documentation has two stale counts. No security vulnerabilities found.

## Warnings

### WR-01: `isGlobal` detection in `cli.ts` breaks on pnpm global installs

**File:** `src/cli.ts:14`
**Issue:** Global-install detection uses a path-segment check for `/node_modules/prefect-mcp/`. npm places globally installed packages at `.../lib/node_modules/prefect-mcp/build/`, which matches. However pnpm global installs use `.pnpm/prefect-mcp@x.y.z/node_modules/prefect-mcp/`, which also matches. But Yarn Berry (PnP) uses a completely different directory layout with no `node_modules/` at all, and `volta` installs to `~/.volta/tools/image/packages/...` — neither would contain the `/node_modules/prefect-mcp/` segment. In those environments `isGlobal` evaluates to `false`, so `prefect init` writes an absolute path to a non-existent build artifact rather than the PATH-based `prefect-mcp` command.

The wrong entry silently "works" in the sense that `prefect init` exits 0, but the resulting `.mcp.json` will fail to spawn the server on any machine that doesn't have the same absolute path.

**Fix:** Either document supported package managers (npm/pnpm only) in the README, or detect global install more robustly. One reliable approach: check whether `process.execPath` and the resolved `__dirname` share a common install root, or simply check for `node_modules` as a segment rather than `node_modules/prefect-mcp/`:
```typescript
const isGlobal = __dirname.replace(/\\/g, '/').includes('/node_modules/');
```
This is still heuristic but wider-catching. Alternatively, embed a `PREFECT_IS_GLOBAL_INSTALL=true` env var at publish time via a `postinstall` script and use that as the signal.

---

### WR-02: Module-level `warnedPassword` / `warnedUsername` flags leak between tests

**File:** `src/auth.ts:5-6` / `src/auth.test.ts`
**Issue:** `warnedPassword` and `warnedUsername` are module-level singletons. If any test in the process exercises the `OPENCODE_SERVER_PASSWORD` deprecated path, subsequent test runs (even in the same file) will not see the deprecation warning fire again. More importantly, if `auth.test.ts` were extended to test the deprecated-name path, the test ordering would determine whether the warning fires — a hidden ordering dependency.

The same pattern exists in `config.ts` (`warnedDefaultProject`). These flags are not reset between tests, and the test files have no mechanism to reset them.

**Fix:** Export a `_resetWarnFlags()` helper from `auth.ts` (analogous to `_resetStartPromise()` in `autostart.ts`) and call it in `beforeEach` in the test file:
```typescript
// auth.ts — add:
export function _resetWarnFlags(): void {
  warnedPassword = false;
  warnedUsername = false;
}
```
```typescript
// auth.test.ts — add:
import { _resetWarnFlags } from './auth.js';
beforeEach(() => _resetWarnFlags());
```

---

### WR-03: `isConnRefused` uses locale-sensitive string matching

**File:** `src/fetch.ts:10`
**Issue:** `String(cause).includes('ECONNREFUSED')` matches the error description string emitted by Node.js on Linux/macOS. On Windows, the equivalent error is `WSAECONNREFUSED` (though Node.js normalizes this to `ECONNREFUSED` in most versions). The deeper concern is that `String(err).includes('ECONNREFUSED')` checks the top-level `TypeError` message, which on some Node.js builds is just `"fetch failed"` — the real code is only in `cause`. The two-pronged check (`String(err)` OR `String(cause)`) mitigates this, but a non-Node environment or a future change to how Node wraps fetch errors could silently break auto-start (auto-start would stop triggering on connection refused, and the error would propagate as an uncaught connection error).

**Fix:** Additionally check `(err as {cause?: {code?: string}}).cause?.code === 'ECONNREFUSED'` for a structural check alongside the string check:
```typescript
function isConnRefused(err: unknown): boolean {
  if (!(err instanceof TypeError)) return false;
  const cause = (err as { cause?: unknown }).cause;
  const causeCode = (cause as { code?: string } | undefined)?.code;
  return (
    causeCode === 'ECONNREFUSED' ||
    String(err).includes('ECONNREFUSED') ||
    String(cause).includes('ECONNREFUSED')
  );
}
```

---

### WR-04: `prefect_find_symbol` filter does not narrow TypeScript type

**File:** `src/index.ts:840`
**Issue:** The `.filter((sym) => sym !== null)` call on an array typed `(object | null)[]` does not narrow the type to `object[]` in TypeScript without a type predicate. The resulting array's inferred type still includes `null`, meaning TypeScript would not catch code downstream that accesses properties without a null check. The code is correct at runtime (nulls are removed), but the type unsafety could cause silent issues if callers of this logic are refactored.

**Fix:** Add an explicit type predicate to the filter:
```typescript
.filter((sym): sym is NonNullable<typeof sym> => sym !== null)
```

---

## Info

### IN-01: README tool count is stale

**File:** `README.md:9` and `README.md:250`
**Issue:** The README states "7 MCP tools" in two places (line 9 and the project layout comment), but `src/index.ts` registers 17 tools. The list of tools on lines 10-16 of the README also only enumerates the original 7.

**Fix:** Update the tool count to 17 and expand or summarize the tool list in the README to reflect the current set.

---

### IN-02: `engines` field conflicts with README's stated minimum Node version

**File:** `package.json:6` / `README.md:79`
**Issue:** `package.json` declares `"engines": { "node": ">=20" }`, but `README.md` says "Node.js >= 18 (tested on Node 20)". npm enforces the `engines` field during `npm install` and `npx` invocations — users on Node 18 will get a warning (or error with `--engine-strict`) even though the README promises support.

**Fix:** Align the two. If Node 18 is not intentionally supported (Node 18 reached EOL in April 2025), remove the claim from the README. If Node 18 is supported, change `package.json` to `">=18"`.

---

### IN-03: `autostart.ts` uses `?v=` ESM cache-bust in production test code

**File:** `src/autostart.test.ts:45`
**Issue:** The remote-guard test imports `./autostart.js?v=remote-guard-test` to force a fresh module load with a different `BASE_URL`. The test's own comment (lines 34-38) acknowledges this is undocumented Node.js behavior. This pattern is fragile — it depends on Node's module loader treating query strings as cache keys, which is not guaranteed and has been known to break between Node.js minor versions.

**Fix:** Refactor `autostart.ts` to accept `BASE_URL` as a dependency-injected parameter (or read it via a getter function tested at call time rather than module init), so the test can control the value without a module reload trick. The `autostartTimeoutMs()` getter pattern already used in the same file (line 19) is the right model.

---

### IN-04: `spawn` on Windows may require `.cmd` suffix

**File:** `src/autostart.ts:100`
**Issue:** `spawn('opencode', ...)` on Windows typically requires `spawn('opencode.cmd', ...)` for Node-based CLIs installed via npm, because Windows does not look up `.cmd` extensions when spawning via `child_process.spawn` without the shell option. The MCP server is likely running on WSL2 (per the README's WSL note), where this is not an issue, but if the server runs natively on Windows it could fail silently.

**Fix:** If Windows native support is in scope for the npm distribution, use `spawn(process.platform === 'win32' ? 'opencode.cmd' : 'opencode', ...)`. If Windows native is out of scope, document it explicitly.

---

### IN-05: Commented-out old tool names in CLAUDE.md system prompt context

**File:** `CLAUDE.md` (injected as system context)
**Issue:** The system-level `CLAUDE.md` injected by the project (visible in the session context) references old `opencode_*` tool names (`opencode_create_session`, `opencode_run`, etc.) while the checked-in `CLAUDE.md` correctly uses `prefect_*` names. This is not a source code issue — the system prompt context comes from a different location than the committed file — but it means Claude Code sessions may attempt to call non-existent tools until the system prompt is refreshed.

**Fix:** Ensure the system-level `CLAUDE.md` context source is updated to match the committed file. This is likely a configuration/deployment step, not a code change.

---

_Reviewed: 2026-04-29T00:00:00Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
