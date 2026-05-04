---
phase: 15-onboarding-session-reuse
reviewed: 2026-05-03T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - src/cli.ts
  - src/cli.test.ts
  - src/index.ts
  - examples/test-task.md
findings:
  critical: 0
  warning: 2
  info: 3
  total: 5
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-05-03
**Depth:** standard
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This review covers the phase 15 changes: `prefect init` first-server onboarding guidance (MULTI-09), session reuse via `sessionId` in `prefect_delegate` and `prefect_dispatch` (D-08/D-09), and the reuse-path logic in `src/index.ts`.

The init onboarding path in `src/cli.ts` is correct and well-tested. The test suite (`src/cli.test.ts`) has thorough coverage of Cases 1-4 and MULTI-08/09/11 scenarios. The `examples/test-task.md` documentation is accurate and consistent with the implementation.

Two warnings were found in the reuse-path implementation in `src/index.ts`: both `prefect_delegate` and `prefect_dispatch` silently fall back to the registry/BASE_URL when `sessionId` is not present in `sessions.json`, which can route a reuse-mode call to the wrong server. Three lower-severity code quality issues are noted in `src/cli.ts`.

## Warnings

### WR-01: Reuse path silently routes to wrong server when sessionId is absent from sessions.json (`prefect_delegate`)

**File:** `src/index.ts:967-968`
**Issue:** In `prefect_delegate`'s reuse path, `resolveServerUrl(providedSessionId)` looks up the session in `sessions.json`. If the entry is missing — because sessions.json was cleared, the MCP server was restarted, or the session was created by a different instance — `resolveServerUrl` silently falls through to the registry first-entry or `BASE_URL` fallback (lines 59-64 of `resolveServerUrl`). The prompt is then sent to whatever server is at the top of the registry, which may be a completely different server than the one hosting the session. The caller receives a plausible-looking response (`{ sessionId, result, diff }`) but the prompt ran on a new anonymous session on the wrong server, not the intended existing session.

The same issue exists in `prefect_dispatch` reuse path at line 1057.

**Fix:** In `resolveServerUrl`, when `sessionId` is provided but not found in `sessions.json`, throw an explicit error instead of silently falling through. This makes the failure loud rather than silent:

```typescript
function resolveServerUrl(sessionId?: string, serverName?: string): string {
  if (sessionId) {
    const entry = lookupSession(sessionId);
    if (entry) return entry.url;
    // Session not in sessions.json — fail explicitly rather than routing to wrong server
    throw new Error(
      `Session ${sessionId} not found in local session registry (sessions.json may have been cleared). ` +
      `Use prefect_session_list to find active sessions, or prefect_create_session to start a new one.`
    );
  }
  // ... rest unchanged
}
```

Alternatively, scope the strict check to the reuse path only: in `prefect_delegate` and `prefect_dispatch`, call `lookupSession(providedSessionId)` directly and throw if absent before calling `resolveServerUrl`.

### WR-02: `prefect_dispatch` reuse path suppresses isNotFound stale-session detection

**File:** `src/index.ts:1068`
**Issue:** In `prefect_dispatch`'s reuse path (lines 1054-1073), when `promptAsync` returns an error, the code only does `throw new Error(JSON.stringify(error))`. Unlike the new-session path and other tools, there is no `isNotFound` check before throwing. This means a 404 from a stale session on the dispatch reuse path produces a raw JSON error string rather than the structured stale-session message with actionable guidance (`"Call prefect_session_list..."`, `removeSession`). The `prefect_delegate` reuse path (line 982) has the same omission — it catches all errors generically without 404 detection.

This is lower severity than WR-01 (the error still surfaces, just with a worse message), but it's inconsistent with the pattern used by every other tool that uses `isNotFound`.

**Fix:** Add `isNotFound` detection in both reuse paths, consistent with the new-session paths:

```typescript
// prefect_dispatch reuse path (line ~1068)
if (error) {
  if (isNotFound(error)) {
    const entry = lookupSession(providedSessionId);
    removeSession(providedSessionId);
    throw new Error(
      `Session ${providedSessionId} not found on server '${entry?.server ?? 'unknown'}' (${serverUrl}).\n` +
      `The session may have been deleted or the server restarted.\n` +
      `Call prefect_session_list to see active sessions, or prefect_create_session to start a new one.`
    );
  }
  throw new Error(JSON.stringify(error));
}
```

Apply the same pattern in `prefect_delegate`'s reuse catch block (currently at line 982, which only calls `String(err)`).

## Info

### IN-01: Duplicated onboarding guidance block in `prefect init`

**File:** `src/cli.ts:151-161` and `src/cli.ts:189-198`
**Issue:** The block that checks `reg.servers.length === 0` and prints the `add-server` guidance appears twice in the `init` case — once for the "create fresh" path (lines 151-161) and once for the "existing file" path (lines 189-198). The two blocks are identical. This is a maintenance hazard: updating the guidance text requires editing two places.

**Fix:** Extract to a named function called after the `writeFileSync` in both paths:

```typescript
function printOnboardingHintIfEmpty(): void {
  const reg = readRegistry();
  if (reg.servers.length === 0) {
    console.error(
      '\nNo servers registered yet. Register your first OpenCode server:\n' +
      '  prefect add-server <name> <host> <port> <provider> <model>\n' +
      'Example:\n' +
      '  prefect add-server local localhost 4096 ollama qwen2.5-coder'
    );
  }
}
```

### IN-02: Missing `break` (fall-through) in `switch` on subcommand

**File:** `src/cli.ts:201-208`
**Issue:** The `switch` cases for `add-server`, `remove-server`, `list-servers`, and `default` have no `break` statements. The code works because all handler functions have a `never` return type (they call `process.exit`), making the fall-through unreachable at runtime. However, this is non-obvious and fragile — if a future refactor changes one handler to return normally instead of exiting, the fall-through will cause silent misbehavior. TypeScript does not warn on fall-through switch cases by default.

**Fix:** Add `break` after each case, or restructure as `return`:

```typescript
case 'add-server':
  handleAddServer(args.slice(1));
  break;
case 'remove-server':
  handleRemoveServer(args.slice(1));
  break;
case 'list-servers':
  handleListServers();
  break;
default:
  usageAndExit();
```

Or enable `@typescript-eslint/no-fallthrough` in the project's ESLint config to catch this class of issue automatically.

### IN-03: `examples/test-task.md` references `prefect_delegate` / `prefect_dispatch` session-reuse but step list uses the old three-tool loop

**File:** `examples/test-task.md:59-79`
**Issue:** The "Multi-Pass Delegation with sessionId" section documents `prefect_delegate` and `prefect_dispatch` with `sessionId`, which is new in phase 15. However, the main "Steps" section (lines 24-29) still describes the original three-step loop (`prefect_create_session` → `prefect_run` → `prefect_get_diff`), with no mention of the reuse shortcut. A new user reading the document top-to-bottom would complete the six-step loop and never discover that follow-up prompts can reuse the same session without creating a new one.

**Fix:** Add a brief note after Step 6 ("Done") pointing to the reuse section, or move the reuse section before "Steps" with a cross-reference. This is a documentation gap, not a code bug, but it reduces discoverability of the phase 15 feature for new users.

---

_Reviewed: 2026-05-03_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
