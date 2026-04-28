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

// ── autoStartAttempted once-per-lifetime guard ──────────────────────────────

test('ensureOpencodeRunning returns immediately on second call (once-per-lifetime guard)', async () => {
  // We need a fresh module load for the first call, so use dynamic import.
  // Bust the cache by using a URL with a unique query string.
  // In Node.js ESM, import() uses the specifier as the cache key; adding ?v=N
  // produces a distinct module instance (separate autoStartAttempted flag).
  const { ensureOpencodeRunning } = await import('./autostart.js?v=guard-test' as string) as typeof import('./autostart.js');

  // Stub spawn by setting OPENCODE_URL to a no-op port; stub authFetch via fetch.
  const origFetch = globalThis.fetch;
  let fetchCallCount = 0;
  (globalThis as unknown as Record<string, unknown>).fetch = (req: Request) => {
    fetchCallCount++;
    return Promise.resolve(new Response('{}', { status: 200 }));
  };

  // Minimal child_process.spawn stub: we cannot easily stub spawn without
  // import mocking, so we rely on the fact that on a port with no listener,
  // waitForHealth() will resolve immediately because we stubbed globalThis.fetch
  // to return 200. The spawn call itself will fail silently (opencode not found)
  // since child.unref() is called and the error is not surfaced.
  try {
    await ensureOpencodeRunning(); // first call — sets flag
    const callsAfterFirst = fetchCallCount;
    assert.ok(callsAfterFirst >= 1, 'health poll should have been called at least once');

    await ensureOpencodeRunning(); // second call — returns immediately
    // fetch should NOT be called again on second call
    assert.equal(fetchCallCount, callsAfterFirst, 'no additional fetch calls on second invocation');
  } finally {
    (globalThis as unknown as Record<string, unknown>).fetch = origFetch;
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
