import { spawn } from 'node:child_process';
import { authFetch } from './auth.js';
import { resolveDirectory } from './index.js';

// INFRA-07 + INFRA-09: Base URL and port for spawning and health-checking OpenCode.
// Read at module init (same as BASE_URL in index.ts — stable for the process lifetime).
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';

// INFRA-13: Max wait for OpenCode to become healthy after spawn.
// Consistent naming pattern with PREFECT_TIMEOUT_MS from index.ts.
const AUTOSTART_TIMEOUT_MS =
  parseInt(process.env.PREFECT_AUTOSTART_TIMEOUT_MS ?? '', 10) || 30_000;

const POLL_INTERVAL_MS = 500; // D-12: hardcoded — fast enough for local startup

// D-06: Once-per-lifetime guard. Module scope — same pattern as BASE_URL in index.ts.
let autoStartAttempted = false;

/**
 * Parse the port number from a URL string.
 * Examples: 'http://localhost:4096' → '4096', 'http://127.0.0.1:9000' → '9000'.
 * Falls back to '4096' on any parse failure.
 */
function parsePort(url: string): string {
  try {
    return new URL(url).port || '4096';
  } catch {
    return '4096';
  }
}

/**
 * Poll GET /global/health until the server responds with HTTP 200.
 * Uses authFetch (INFRA-10) so a password-protected server returns 200, not 401.
 * Throws if the server does not become healthy within AUTOSTART_TIMEOUT_MS.
 */
async function waitForHealth(): Promise<void> {
  const deadline = Date.now() + AUTOSTART_TIMEOUT_MS;
  const healthUrl = `${BASE_URL}/global/health`;
  while (Date.now() < deadline) {
    try {
      const res = await authFetch(new Request(healthUrl));
      if (res.ok) return; // healthy — proceed
    } catch {
      // Connection not yet ready — keep polling
    }
    await new Promise<void>((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  throw new Error(
    `OpenCode did not become healthy within ${AUTOSTART_TIMEOUT_MS}ms. ` +
      `Check that 'opencode serve' can start in your environment.`,
  );
}

/**
 * INFRA-07: Spawn 'opencode serve --port <port>' if not already attempted.
 * D-06: Fires at most once per MCP server process lifetime.
 * D-08: stdio ['ignore','ignore','inherit'] — stdout/stdin silenced to protect
 *        the MCP JSON-RPC pipe; stderr inherited so startup errors surface.
 * D-09: cwd = resolveDirectory(undefined) — OPENCODE_DEFAULT_PROJECT if set,
 *        otherwise undefined (OpenCode uses its own cwd).
 * D-10: Port parsed from OPENCODE_URL; falls back to 4096.
 * INFRA-10: waitForHealth() uses authFetch — auth-protected servers detected healthy.
 */
export async function ensureOpencodeRunning(): Promise<void> {
  if (autoStartAttempted) return;
  autoStartAttempted = true;

  const port = parsePort(BASE_URL);
  const cwd = resolveDirectory(undefined);

  console.error(`[Prefect] OpenCode not reachable — spawning 'opencode serve --port ${port}'`);

  const child = spawn('opencode', ['serve', '--port', port], {
    stdio: ['ignore', 'ignore', 'inherit'],
    cwd,
    detached: false,
  });
  child.unref(); // allow parent MCP server to exit without waiting for child

  await waitForHealth();
  console.error(`[Prefect] OpenCode is healthy at ${BASE_URL}`);
}
