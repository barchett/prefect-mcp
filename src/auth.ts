// INFRA-04 + INFRA-05: HTTP Basic Auth header injection for OpenCode requests.
// Credentials are read at call time (not module init) so env var changes take
// effect without restarting the MCP server — same pattern as resolveDirectory().

/**
 * Reads OPENCODE_SERVER_PASSWORD and OPENCODE_SERVER_USERNAME at call time.
 * Returns { Authorization: 'Basic <token>' } if a password is set, otherwise {}.
 * Username defaults to 'opencode' per INFRA-05.
 * Token is Buffer.from('username:password').toString('base64') — Node.js Buffer,
 * not btoa(), for consistency with the Node.js runtime (D-03).
 */
export function buildAuthHeader(): Record<string, string> {
  const password = process.env.OPENCODE_SERVER_PASSWORD;
  if (!password) return {};
  const username = process.env.OPENCODE_SERVER_USERNAME ?? 'opencode';
  const token = Buffer.from(`${username}:${password}`).toString('base64');
  return { Authorization: `Basic ${token}` };
}

/**
 * Authenticated fetch wrapper matching Config.fetch from @opencode-ai/sdk.
 * Injects Basic Auth headers when OPENCODE_SERVER_PASSWORD is set.
 * Forwards the request unchanged when no password is configured.
 * Pass this to createOpencodeClient({ fetch: authFetch }) in src/index.ts.
 */
export async function authFetch(request: Request): Promise<Response> {
  const headers = buildAuthHeader();
  if (Object.keys(headers).length === 0) {
    return globalThis.fetch(request);
  }
  // Auth header always wins — we intentionally overwrite any pre-existing Authorization.
  if (request.headers.get('Authorization')) {
    console.error('[Prefect] authFetch: overwriting existing Authorization header with Basic Auth');
  }
  const merged = { ...Object.fromEntries(request.headers), ...headers };
  const authed = new Request(request, { headers: merged });
  return globalThis.fetch(authed);
}
