import { createOpencodeClient } from '@opencode-ai/sdk';
import { createPatch } from 'diff';
import { z } from 'zod';
import { PartSchema } from './parts.js';

type OpencodeClient = ReturnType<typeof createOpencodeClient>;

export interface RunPromptOptions {
  model?: { providerID: string; modelID: string };
  agent?: string;
  system?: string;
}

/**
 * Create a new OpenCode session.
 * Extracted from opencode_create_session handler in src/index.ts.
 * Throws on API error.
 */
export async function createSession(
  client: OpencodeClient,
  title: string | undefined,
  directory: string | undefined,
): Promise<{ id: string; [key: string]: unknown }> {
  const { data, error } = await client.session.create({
    body: { title },
    query: directory ? { directory } : undefined,
  });
  if (error) throw new Error(JSON.stringify(error));
  return data!;
}

/**
 * Run a prompt against a session and return the assistant's structured response.
 * Extracted from opencode_run handler in src/index.ts.
 * IMPORTANT: AbortError is NOT caught here — it propagates to the caller so
 * composite handlers (opencode_delegate) can detect timeout and call session.abort().
 * The caller is responsible for managing the AbortController and clearTimeout.
 */
export async function runPrompt(
  client: OpencodeClient,
  sessionId: string,
  prompt: string,
  opts: RunPromptOptions,
  directory: string | undefined,
  signal: AbortSignal,
): Promise<{ info: unknown; parts: z.infer<typeof PartSchema>[] }> {
  const { data, error } = await client.session.prompt({
    path: { id: sessionId },
    body: {
      parts: [{ type: 'text', text: prompt }],
      ...(opts.model ? { model: opts.model } : {}),
      ...(opts.agent ? { agent: opts.agent } : {}),
      ...(opts.system ? { system: opts.system } : {}),
    },
    query: directory ? { directory } : undefined,
    signal,
  });
  if (error) throw new Error(JSON.stringify(error));
  const validatedParts = PartSchema.array().parse(data!.parts);
  return { info: data!.info, parts: validatedParts };
}

/**
 * Get the file diff for a session with computed unified-diff patch strings.
 * Extracted from opencode_get_diff handler in src/index.ts.
 * Appends patch: createPatch(d.file, d.before, d.after) to each FileDiff.
 * Throws on API error.
 */
export async function getDiff(
  client: OpencodeClient,
  sessionId: string,
  messageID: string | undefined,
  directory: string | undefined,
): Promise<Array<{ file: string; before: string; after: string; additions: number; deletions: number; patch: string }>> {
  const { data, error } = await client.session.diff({
    path: { id: sessionId },
    query: {
      ...(messageID ? { messageID } : {}),
      ...(directory ? { directory } : {}),
    },
  });
  if (error) throw new Error(JSON.stringify(error));
  return (data ?? []).map((d) => ({
    ...d,
    patch: createPatch(d.file, d.before, d.after),
  }));
}
