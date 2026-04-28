import { authFetch } from './auth.js';
import { ensureOpencodeRunning } from './autostart.js';

/**
 * Authenticated fetch wrapper with auto-start.
 * Every outbound OpenCode SDK request flows through this function via the
 * Config.fetch hook, so auth injection and auto-start are handled uniformly
 * for all 18 tools — no per-tool wiring required.
 *
 * On ECONNREFUSED: spawns 'opencode serve' once (guarded by autoStartAttempted),
 * waits for health, then retries the request once with auth headers.
 */
export async function fetchWithAuth(request: Request): Promise<Response> {
  try {
    return await authFetch(request);
  } catch (err) {
    if (err instanceof TypeError && String(err).includes('ECONNREFUSED')) {
      await ensureOpencodeRunning();
      return authFetch(request);
    }
    throw err;
  }
}
