---
phase: 07-composite-tools
reviewed: 2026-04-28T00:00:00Z
depth: standard
files_reviewed: 2
files_reviewed_list:
  - src/handlers.ts
  - src/index.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 7: Code Review Report

**Reviewed:** 2026-04-28
**Depth:** standard
**Files Reviewed:** 2
**Status:** issues_found

## Summary

Both files are well-structured and follow consistent patterns. `src/handlers.ts` cleanly extracts three reusable async functions (`createSession`, `runPrompt`, `getDiff`) from `src/index.ts`, and the composite tools (`opencode_delegate`, `opencode_dispatch`, `opencode_inspect`, `opencode_await`) are correctly composed from those primitives.

The main concerns are: a timing-window bug in the `opencode_await` poll loop that can cause a premature timeout on the first poll; an `AbortError` timeout path in `opencode_delegate` that silently skips aborting the session when session creation failed; a non-null assertion (`data!`) in `handlers.ts` that bypasses the type system's null guard; and a `getDiff` call after `runPrompt` inside `opencode_delegate` that is not protected by any timeout — only the `runPrompt` step is guarded.

---

## Warnings

### WR-01: Off-by-one in `opencode_await` deadline check causes premature timeout

**File:** `src/index.ts:713`

**Issue:** The condition `if (Date.now() + pollIntervalMs >= deadline)` checks whether there is *enough time left for the next sleep* before sleeping. However, the check fires *after* confirming the session is still busy, meaning the very first poll result triggers a timeout if `pollIntervalMs >= timeoutMs`. More subtly, a slow first status call that takes close to `pollIntervalMs` milliseconds will also trip this guard and return a timeout error without ever having waited a single full `pollIntervalMs` cycle. The intent is clearly to guard against sleeping past the deadline, but the check should be performed *after* sleeping (or use `Date.now() >= deadline` without adding the interval).

**Fix:**
```typescript
// Replace:
if (Date.now() + pollIntervalMs >= deadline) {
// With — check deadline AFTER sleeping, or simply:
if (Date.now() >= deadline) {
  return {
    content: [{ type: 'text', text: JSON.stringify({ error: `opencode_await timed out after ${timeoutMs}ms`, sessionId }) }],
    isError: true,
  };
}
await new Promise<void>((r) => setTimeout(r, pollIntervalMs));
```

If the goal is to avoid sleeping past the deadline, compute the remaining sleep time:
```typescript
const remaining = deadline - Date.now();
if (remaining <= 0) {
  return { content: [...], isError: true };
}
await new Promise<void>((r) => setTimeout(r, Math.min(pollIntervalMs, remaining)));
```

---

### WR-02: `opencode_delegate` timeout handler skips session abort when session creation fails mid-call

**File:** `src/index.ts:591`

**Issue:** On `AbortError`, the handler checks `if ((err as Error).name === 'AbortError' && sessionId)`. The `sessionId` variable is only assigned *after* `createSession` returns. If the `AbortController` fires during `createSession` (e.g., very short `PREFECT_TIMEOUT_MS`), `sessionId` is `undefined`, and the error falls through to the generic catch at line 598 which returns `String(err)` — a raw `AbortError` message with no context about what happened. More importantly, the fallback error message does not distinguish "timed out during session creation" from "timed out during prompt execution," making debugging harder.

**Fix:**
```typescript
} catch (err) {
  clearTimeout(timer);
  if ((err as Error).name === 'AbortError') {
    // sessionId may be undefined if abort fired during createSession
    if (sessionId) {
      await client.session.abort({ path: { id: sessionId } }).catch(() => {});
    }
    return {
      content: [{ type: 'text', text: `opencode_delegate timed out after ${TIMEOUT_MS / 1000}s${sessionId ? ` — session ${sessionId} aborted` : ' — during session creation'}` }],
      isError: true,
    };
  }
  return { content: [{ type: 'text', text: String(err) }], isError: true };
}
```

---

### WR-03: `getDiff` call in `opencode_delegate` is outside the abort timeout window

**File:** `src/index.ts:587`

**Issue:** The `AbortController` timer fires after `TIMEOUT_MS` from when `opencode_delegate` starts. `clearTimeout(timer)` is called immediately after `runPrompt` succeeds (line 103 in the analogous `opencode_run` handler — here it is called implicitly by reaching the `getDiff` line). Actually, looking at the code, `clearTimeout(timer)` is called on line 587 only *after* `getDiff` resolves. Wait — re-reading the code at line 586-588:

```typescript
const result = await runPrompt(...);  // line 585
clearTimeout(timer);                  // line 586 — NOT present; clearTimeout is in catch
const diff = await getDiff(...);      // line 587
```

The `try` block has no `clearTimeout` before reaching `getDiff` — `clearTimeout` only fires in the `catch`. This means if `runPrompt` takes 119s and `getDiff` takes 3s, the `AbortController` fires during `getDiff`, throwing an `AbortError` into the `catch`. The handler then tries to abort the session even though the prompt already completed successfully. The fix is to call `clearTimeout(timer)` immediately after `runPrompt` resolves, before calling `getDiff`.

**Fix:**
```typescript
const session = await createSession(client, title, dir);
sessionId = session.id;
const result = await runPrompt(client, sessionId, prompt, { model, agent, system }, dir, controller.signal);
clearTimeout(timer);  // <-- move here, before getDiff
const diff = await getDiff(client, sessionId, undefined, dir);
return { content: [{ type: 'text', text: JSON.stringify({ sessionId, result, diff }) }] };
```

---

### WR-04: Non-null assertion `data!` in `handlers.ts` bypasses null safety

**File:** `src/handlers.ts:29` and `src/handlers.ts:59-60`

**Issue:** After checking `if (error) throw ...`, the code uses `data!` (non-null assertion). While the API contract implies `data` is present when `error` is absent, TypeScript's non-null assertion silently bypasses the type system. If the SDK ever returns `{ data: undefined, error: undefined }` (e.g., a 204 No Content response on an unexpected path), `data!` would return `undefined` and downstream code (e.g., `data!.parts`) would throw an uncaught `TypeError` at runtime.

**Fix:** Use explicit null checks with descriptive errors:
```typescript
// createSession (line 29)
if (!data) throw new Error('createSession: API returned no data and no error');
return data;

// runPrompt (lines 59-60)
if (!data) throw new Error('runPrompt: API returned no data and no error');
const validatedParts = PartSchema.array().parse(data.parts);
return { info: data.info, parts: validatedParts };
```

---

## Info

### IN-01: `createPatch` import duplicated between `handlers.ts` and `index.ts`

**File:** `src/index.ts:6`, `src/handlers.ts:2`

**Issue:** `createPatch` from `'diff'` is imported in both files. `handlers.ts` uses it inside `getDiff`. `index.ts` imports it separately for `opencode_await`'s inline diff mapping (line 735). This duplication is harmless but indicates that `opencode_await`'s diff mapping could call `getDiff` from handlers (or a shared helper) instead of duplicating the `createPatch` logic inline.

**Fix:** Extract the diff-with-patch mapping from `opencode_await` into `getDiff` (it already does this) and call `getDiff` instead of calling `client.session.diff` directly and then manually applying `createPatch`. This would eliminate the duplicate import and reduce the duplication of the `map((d) => ({ ...d, patch: createPatch(...) }))` pattern.

---

### IN-02: Unused import `PartSchema` in `index.ts` for `opencode_run` — now handled in `handlers.ts`

**File:** `src/index.ts:9`

**Issue:** `PartSchema` is imported in `index.ts` at line 9. The `opencode_run` tool no longer uses `PartSchema` directly (it delegates to `runPrompt` in `handlers.ts`). `PartSchema` is only used at line 730 inside `opencode_await`. The import is not dead code, but the comment at lines 67-73 describes `PartSchema` usage in the context of `opencode_run`, which is now outdated since that validation was moved into `runPrompt`.

**Fix:** No code change required. Update the comment at lines 67-73 to reflect that `PartSchema` validation is now in `handlers.ts:runPrompt`, not in the `opencode_run` handler itself. This is cosmetic.

---

### IN-03: `opencode_await` reconstructs result by finding the last assistant message, but ignores messages that may arrive after the status check reports idle

**File:** `src/index.ts:729-731`

**Issue:** After the poll loop exits with `statusEntry.type === 'idle'` (or `!statusEntry`), the code calls `client.session.messages` and takes the last assistant message. This is a best-effort approximation — the message history faithfully records the session's output, so this is unlikely to be wrong in practice. However, the comment "same shape as opencode_run result" at line 737 is slightly misleading: `opencode_run` returns `{ info, parts }` from the *prompt response directly*, while `opencode_await` reconstructs it from message history. The `parts` field passes through `PartSchema.array().parse()` but `info` is passed through as-is without schema validation.

**Fix:** This is low-priority. If schema validation consistency matters, apply the same `PartSchema` treatment to `info` as is done in `runPrompt`. Otherwise, add a comment clarifying that `info` is unvalidated raw data from message history.

---

_Reviewed: 2026-04-28_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
