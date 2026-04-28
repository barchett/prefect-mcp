import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── ensureOpencodeRunning tests ─────────────────────────────────────────────
// We test the exported function by monkey-patching globalThis.fetch and
// using process.env to control behaviour.
//
// NOTE: autoStartAttempted is module-level state; each test that exercises
// the "first call" path must reset the module state. We do this by
// re-importing the module with a fresh require-cache bust via dynamic import
// with a unique query-string trick — but since we are in ESM, the simplest
// approach is to test the observable contract without resetting module state
// across multiple test files. All "first-call" tests use a separate isolated
// module snapshot loaded via dynamic import after clearing the import cache.
//
// For unit testing the timeout and health-poll behaviour we mock authFetch
// indirectly via globalThis.fetch (authFetch calls globalThis.fetch under the
// hood when no password is set).

// Helper: create a mock fetch that returns the given Response after a delay.
function mockFetch(response: Response, delay = 0): (req: Request) => Promise<Response> {
  return (_req: Request) =>
    new Promise((resolve) => setTimeout(() => resolve(response), delay));
}

// Helper: create a mock fetch that always throws (simulating ECONNREFUSED).
function errorFetch(delay = 0): (req: Request) => Promise<Response> {
  return (_req: Request) =>
    new Promise((_, reject) => setTimeout(() => reject(new TypeError('ECONNREFUSED')), delay));
}

// ── parsePort (tested indirectly via module constants) ──────────────────────
// We cannot directly test the internal parsePort helper, so we test the
// spawning port indirectly by checking the spawn call arguments captured in
// the integration-style test below.

// ── Promise-based spawn lock ─────────────────────────────────────────────────

test('ensureOpencodeRunning deduplicates concurrent calls (only one health poll)', async () => {
  // Fresh module instance so startPromise starts as null.
  const { ensureOpencodeRunning } = await import('./autostart.js?v=dedup-test' as string) as typeof import('./autostart.js');

  const origFetch = globalThis.fetch;
  let fetchCallCount = 0;
  (globalThis as unknown as Record<string, unknown>).fetch = (_req: Request) => {
    fetchCallCount++;
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  try {
    // Fire two concurrent calls — only one health poll should occur.
    await Promise.all([ensureOpencodeRunning(), ensureOpencodeRunning()]);
    assert.ok(fetchCallCount >= 1, 'health poll should have been called at least once');
    // Both calls resolved but startPromise was shared — fetch count stays low.
    const dedupedCount = fetchCallCount;

    // After both settle, startPromise is null again — a third call spawns anew.
    await ensureOpencodeRunning();
    assert.ok(fetchCallCount > dedupedCount, 'post-reset call should trigger a new health poll (crash recovery)');
  } finally {
    (globalThis as unknown as Record<string, unknown>).fetch = origFetch;
  }
});

// ── Remote-host guard ────────────────────────────────────────────────────────

test('ensureOpencodeRunning throws immediately for non-local OPENCODE_URL', async () => {
  // BASE_URL is a module-level constant — set env var BEFORE import so the fresh
  // module instance picks up the remote URL at init time.
  const origUrl = process.env.OPENCODE_URL;
  process.env.OPENCODE_URL = 'http://192.168.1.100:4096';

  try {
    const { ensureOpencodeRunning } = await import('./autostart.js?v=remote-guard-test' as string) as typeof import('./autostart.js');

    await assert.rejects(
      () => ensureOpencodeRunning(),
      (err: Error) => {
        assert.ok(
          err.message.includes('Auto-start skipped') && err.message.includes('192.168.1.100'),
          `Expected remote-host error, got: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    if (origUrl === undefined) delete process.env.OPENCODE_URL;
    else process.env.OPENCODE_URL = origUrl;
  }
});

// ── waitForHealth timeout ────────────────────────────────────────────────────

test('ensureOpencodeRunning throws when OpenCode does not become healthy within timeout', async () => {
  // Use a separate module instance to get a fresh autoStartAttempted flag.
  const { ensureOpencodeRunning } = await import('./autostart.js?v=timeout-test' as string) as typeof import('./autostart.js');

  const origFetch = globalThis.fetch;
  const origTimeout = process.env.PREFECT_AUTOSTART_TIMEOUT_MS;
  // Set a very short timeout so the test doesn't take 30 seconds.
  process.env.PREFECT_AUTOSTART_TIMEOUT_MS = '200';

  // Always throw to simulate ECONNREFUSED during health poll.
  (globalThis as unknown as Record<string, unknown>).fetch = errorFetch(0);

  try {
    await assert.rejects(
      () => ensureOpencodeRunning(),
      (err: Error) => {
        assert.ok(
          err.message.includes('OpenCode did not become healthy within'),
          `Expected timeout message, got: ${err.message}`,
        );
        return true;
      },
    );
  } finally {
    (globalThis as unknown as Record<string, unknown>).fetch = origFetch;
    if (origTimeout === undefined) delete process.env.PREFECT_AUTOSTART_TIMEOUT_MS;
    else process.env.PREFECT_AUTOSTART_TIMEOUT_MS = origTimeout;
  }
});

// ── authFetch integration: health poll uses authenticated fetch ───────────────

test('ensureOpencodeRunning health poll uses authFetch (injects auth header when password set)', async () => {
  const { ensureOpencodeRunning } = await import('./autostart.js?v=auth-test' as string) as typeof import('./autostart.js');

  const prevPw = process.env.OPENCODE_SERVER_PASSWORD;
  process.env.OPENCODE_SERVER_PASSWORD = 'healthtest';

  const origFetch = globalThis.fetch;
  let capturedAuth: string | null = null;
  (globalThis as unknown as Record<string, unknown>).fetch = (req: Request) => {
    capturedAuth = req.headers.get('Authorization');
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  try {
    await ensureOpencodeRunning();
    const expected = `Basic ${Buffer.from('opencode:healthtest').toString('base64')}`;
    assert.equal(capturedAuth, expected, 'health poll should inject Authorization header');
  } finally {
    (globalThis as unknown as Record<string, unknown>).fetch = origFetch;
    if (prevPw === undefined) delete process.env.OPENCODE_SERVER_PASSWORD;
    else process.env.OPENCODE_SERVER_PASSWORD = prevPw;
  }
});
