import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export interface SessionEntry {
  server: string;  // name from registry (must match a ServerEntry.name in servers.json)
  url: string;     // full http://host:port URL — stored alongside name so error messages show both without re-lookup
  model?: { providerID: string; modelID: string };  // registered model for this server — auto-injected on every prefect_run
}

export interface SessionMap {
  sessions: Record<string, SessionEntry>;
}

const SESSIONS_DIR = join(homedir(), '.config', 'prefect');
export const SESSIONS_PATH = join(SESSIONS_DIR, 'sessions.json');

export function readSessionMap(sessionsPath: string = SESSIONS_PATH): SessionMap {
  try {
    const parsed = JSON.parse(readFileSync(sessionsPath, 'utf8'));
    if (!parsed || typeof parsed.sessions !== 'object' || Array.isArray(parsed.sessions)) {
      throw new Error(`malformed sessions map at ${sessionsPath}: expected { sessions: { ... } }`);
    }
    return parsed as SessionMap;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return { sessions: {} };
    throw new Error(`could not parse ${sessionsPath}: ${(err as Error).message}`);
  }
}

export function writeSessionMap(map: SessionMap, sessionsPath: string = SESSIONS_PATH): void {
  mkdirSync(dirname(sessionsPath), { recursive: true });
  writeFileSync(sessionsPath, JSON.stringify(map, null, 2) + '\n');
}

export function addSession(sessionId: string, entry: SessionEntry, sessionsPath: string = SESSIONS_PATH): void {
  const map = readSessionMap(sessionsPath);
  map.sessions[sessionId] = entry;
  writeSessionMap(map, sessionsPath);
}

export function removeSession(sessionId: string, sessionsPath: string = SESSIONS_PATH): void {
  const map = readSessionMap(sessionsPath);
  if (!(sessionId in map.sessions)) return;  // silent no-op (D-12 cleanup must be idempotent)
  delete map.sessions[sessionId];
  writeSessionMap(map, sessionsPath);
}

export function lookupSession(sessionId: string, sessionsPath: string = SESSIONS_PATH): SessionEntry | undefined {
  return readSessionMap(sessionsPath).sessions[sessionId];
}
