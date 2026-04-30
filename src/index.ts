#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { createPatch } from 'diff';
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { fetchWithAuth } from './fetch.js';
import { resolveDirectory } from './config.js';
import { PartSchema } from './parts.js';
import { createSession, runPrompt, getDiff } from './handlers.js';

// CORE-08: Base URL from PREFECT_SERVER_URL env var (OPENCODE_URL accepted with deprecation warning)
const BASE_URL =
  process.env.PREFECT_SERVER_URL ??
  (() => {
    const old = process.env.OPENCODE_URL;
    if (old) console.error('[Prefect] OPENCODE_URL is deprecated, use PREFECT_SERVER_URL');
    return old;
  })() ??
  'http://localhost:4096';
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '', 10) || 120_000;
const client = createOpencodeClient({ baseUrl: BASE_URL, fetch: fetchWithAuth });

export { resolveDirectory };

const server = new McpServer({ name: 'prefect', version: '1.0.0' });

// CORE-01: Create a new OpenCode session
server.registerTool(
  'prefect_create_session',
  {
    description: 'Create a new OpenCode coding session. Returns the Session object including the session id (ULID) used by all other tools. Pass directory to pin the session to a specific project root — required when OpenCode serves multiple projects from a single running instance.',
    inputSchema: z.object({
      title: z.string().optional().describe('Optional display title for the session'),
      parentID: z.string().optional().describe('Optional parent session ID — creates this session as a child of the given parent for hierarchy tracking.'),
      directory: z.string().optional().describe('Absolute path to the project root for this session. Defaults to the directory OpenCode was started from.'),
    }),
  },
  async ({ title, parentID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const session = await createSession(client, title, dir, parentID);
      return { content: [{ type: 'text', text: JSON.stringify(session) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-07: Abort a running session
server.registerTool(
  'prefect_abort',
  {
    description: 'Abort a running OpenCode session. Returns true on success.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID returned from prefect_create_session'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.abort({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: String(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-02 + RUN-01/02/03 + INFRA-01 + SURF-02:
// Run a prompt against an OpenCode session. Optional per-call overrides for
// model (providerID + modelID required together), agent, and system prompt.
// Uses AbortController so timeout cancels the in-flight TCP connection rather
// than orphaning it (the previous Promise.race left the request running on
// OpenCode after we gave up on it). Response parts are validated against
// PartSchema and returned as a structured { info, parts } payload.
server.registerTool(
  'prefect_run',
  {
    description:
      'Send a prompt to an OpenCode session and block until the agent finishes. Returns { info: AssistantMessage, parts: Part[] } as JSON. Optional model/agent/system override the session defaults for this single call. May take seconds to minutes depending on task complexity.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from prefect_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
      directory: z.string().optional().describe('Routes this call to the OpenCode project at the specified path. Does not change the session\'s working directory. Falls back to OPENCODE_DEFAULT_PROJECT env var.'),
      // RUN-01: model override — both providerID AND modelID required together
      model: z
        .object({
          providerID: z.string(),
          modelID: z.string(),
        })
        .optional()
        .describe('Override the model for this single call. Both providerID and modelID are required together.'),
      // RUN-02: agent override
      agent: z.string().optional().describe('Override the agent for this single call.'),
      // RUN-03: system prompt override
      system: z.string().optional().describe('Override the system prompt for this single call.'),
      // RUN-05: tools override — CRITICAL: record (Map<string, boolean>), NOT array of strings
      tools: z.record(z.string(), z.boolean()).optional()
        .describe('Override enabled tools for this call. Map of tool ID to boolean enable/disable flag. Example: { "bash": true, "edit": false }'),
      // RUN-06: file attachments — FilePartInput shape (use file:// URIs for local files)
      files: z.array(z.object({
        type: z.literal('file'),
        mime: z.string(),
        filename: z.string().optional(),
        url: z.string(),
      })).optional()
        .describe('File attachments to include as context. Each file requires mime type and url (use file:// URIs for local paths).'),
      // RUN-07: message ID assignment (idempotency key for user message creation)
      messageID: z.string().optional()
        .describe('Assign a specific ID to the new user message being created. If a message with this ID already exists in the session, OpenCode returns the cached response (idempotency — useful for safe retries). Omit to auto-generate. For branching a conversation at a prior message point, use prefect_fork instead.'),
      // RUN-08: structured agent part input (distinct from the top-level agent string override)
      agentInput: z.object({
        type: z.literal('agent'),
        name: z.string(),
      }).optional()
        .describe('Structured agent part input — specify the agent name for this prompt. Distinct from the top-level agent string override.'),
      // RUN-08: structured subtask part input
      subtaskInput: z.object({
        type: z.literal('subtask'),
        prompt: z.string(),
        description: z.string(),
        agent: z.string(),
      }).optional()
        .describe('Structured subtask part input — delegate a subtask to a specific agent.'),
    }),
  },
  async ({ sessionId, prompt, directory, model, agent, system, tools, files, messageID, agentInput, subtaskInput }) => {
    const dir = resolveDirectory(directory);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const result = await runPrompt(client, sessionId, prompt, { model, agent, system, tools, files, messageID, agentInput, subtaskInput }, dir, controller.signal);
      clearTimeout(timer);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        return {
          content: [
            {
              type: 'text',
              text: `prefect_run timed out after ${TIMEOUT_MS / 1000}s — check PREFECT_SERVER_URL and model endpoint`,
            },
          ],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// RUN-04: Fire-and-forget prompt — POST /session/:id/prompt_async returns 204 void.
// Same body shape as prefect_run (model/agent/system supported) but no timeout
// because the API returns immediately. Use prefect_session_status to poll for
// completion.
server.registerTool(
  'prefect_prompt_async',
  {
    description:
      'Send a prompt to an OpenCode session and return immediately without waiting for the agent to finish. Returns { sessionId, accepted: true } on success. Use prefect_session_status to poll for completion, then prefect_session_messages or prefect_get_diff to retrieve results.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from prefect_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
      directory: z.string().optional().describe('Routes this call to the OpenCode project at the specified path. Does not change the session\'s working directory. Falls back to OPENCODE_DEFAULT_PROJECT env var.'),
      model: z
        .object({
          providerID: z.string(),
          modelID: z.string(),
        })
        .optional()
        .describe('Override the model for this single call. Both providerID and modelID are required together.'),
      agent: z.string().optional().describe('Override the agent for this single call.'),
      system: z.string().optional().describe('Override the system prompt for this single call.'),
      // RUN-05: tools override — CRITICAL: record (Map<string, boolean>), NOT array of strings
      tools: z.record(z.string(), z.boolean()).optional()
        .describe('Override enabled tools for this call. Map of tool ID to boolean enable/disable flag. Example: { "bash": true, "edit": false }'),
      // RUN-06: file attachments — FilePartInput shape (use file:// URIs for local files)
      files: z.array(z.object({
        type: z.literal('file'),
        mime: z.string(),
        filename: z.string().optional(),
        url: z.string(),
      })).optional()
        .describe('File attachments to include as context. Each file requires mime type and url (use file:// URIs for local paths).'),
      // RUN-07: message ID assignment (idempotency key for user message creation)
      messageID: z.string().optional()
        .describe('Assign a specific ID to the new user message being created. If a message with this ID already exists in the session, OpenCode returns the cached response (idempotency — useful for safe retries). Omit to auto-generate. For branching a conversation at a prior message point, use prefect_fork instead.'),
      // RUN-08: structured agent part input (distinct from the top-level agent string override)
      agentInput: z.object({
        type: z.literal('agent'),
        name: z.string(),
      }).optional()
        .describe('Structured agent part input — specify the agent name for this prompt. Distinct from the top-level agent string override.'),
      // RUN-08: structured subtask part input
      subtaskInput: z.object({
        type: z.literal('subtask'),
        prompt: z.string(),
        description: z.string(),
        agent: z.string(),
      }).optional()
        .describe('Structured subtask part input — delegate a subtask to a specific agent.'),
    }),
  },
  async ({ sessionId, prompt, directory, model, agent, system, tools, files, messageID, agentInput, subtaskInput }) => {
    const dir = resolveDirectory(directory);
    try {
      const { error } = await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [
            { type: 'text', text: prompt },
            ...(files ?? []),
            ...(agentInput ? [agentInput] : []),
            ...(subtaskInput ? [subtaskInput] : []),
          ],
          ...(model ? { model } : {}),
          ...(agent ? { agent } : {}),
          ...(system ? { system } : {}),
          ...(tools ? { tools } : {}),
          ...(messageID ? { messageID } : {}),
        },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return {
        content: [
          { type: 'text', text: JSON.stringify({ sessionId, accepted: true }) },
        ],
      };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-03: Get the file diff for a session (or for a specific message)
server.registerTool(
  'prefect_get_diff',
  {
    description: 'Get the file diff for an OpenCode session. Returns an array of FileDiff objects (file, before, after, additions, deletions). If messageID is provided, returns the diff for that message; otherwise returns the diff for the session.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageID: z.string().optional().describe('Optional message ID to scope the diff to a single message'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, messageID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const diffs = await getDiff(client, sessionId, messageID, dir);
      return { content: [{ type: 'text', text: JSON.stringify(diffs) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-04: Respond to an OpenCode permission request
// NOTE: REQUIREMENTS.md says allow/deny/allow_always — that's WRONG.
// The OpenCode API enum is "once" | "always" | "reject" (verified from @opencode-ai/sdk types).
server.registerTool(
  'prefect_approve_permission',
  {
    description: 'Respond to an OpenCode permission request. once = approve this request only; always = approve similar future requests; reject = deny.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      permissionId: z.string().describe('Permission request ID'),
      response: z.enum(['once', 'always', 'reject']).describe(
        'once = approve this request only; always = approve similar future requests; reject = deny'
      ),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, permissionId, response, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      // CRITICAL: permissions method is on TOP-LEVEL client, NOT client.session
      const { data, error } = await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-05: Fork a session (escape hatch for corrupted sessions)
server.registerTool(
  'prefect_fork',
  {
    description: 'Fork an OpenCode session, optionally at a specific message. Returns a new Session. Use this as an escape hatch when a session has gone off the rails.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to fork from'),
      messageID: z.string().optional().describe('Optional message ID to fork at; if omitted, forks at the current tip'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, messageID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.fork({
        path: { id: sessionId },
        ...(messageID ? { body: { messageID } } : {}),
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-06: Revert a session to a prior message
server.registerTool(
  'prefect_revert',
  {
    description: 'Revert an OpenCode session to a prior message. messageID is required. Optionally scope to a specific part of that message via partID.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageID: z.string().describe('Required: message ID to revert to'),
      partID: z.string().optional().describe('Optional: specific part within the message'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, messageID, partID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.revert({
        path: { id: sessionId },
        body: { messageID, ...(partID ? { partID } : {}) },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-01: List all OpenCode sessions
server.registerTool(
  'prefect_session_list',
  {
    description: 'List all OpenCode sessions. Returns an array of Session objects each with id, title, directory, time.created, time.updated, and optional summary/share/revert fields. Pass directory to filter sessions by project root.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Filter sessions by project directory path'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.list({
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-02: Fetch a single OpenCode session by ID
server.registerTool(
  'prefect_session_get',
  {
    description: 'Fetch a single OpenCode session by ID. Returns the full Session object including id, title, directory, parentID (if forked), and revert state.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to fetch'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.get({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-03: Get real-time status of ALL active sessions (global endpoint — no sessionId param)
server.registerTool(
  'prefect_session_status',
  {
    description: 'Get the real-time status of all active OpenCode sessions. Returns a map of sessionID → SessionStatus where status is one of: { type: "idle" }, { type: "busy" }, or { type: "retry", attempt, message, next }. Use this before calling prefect_run to verify the target session is idle and not still processing a previous prompt.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.status({
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-04: Retrieve message history for a session (limit = most-recent-N, no cursor)
server.registerTool(
  'prefect_session_messages',
  {
    description: 'Retrieve the message history for an OpenCode session. Each message includes an info object (UserMessage or AssistantMessage) and a parts array (TextPart, ToolPart, PatchPart, etc.). Use limit to cap the number of messages returned — this returns the most recent N messages only; there is no cursor or offset. Omit limit to return all messages.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      limit: z.number().int().positive().optional().describe(
        'Maximum number of messages to return. Returns the most recent N messages — there is no offset or cursor. Omit to return all messages.'
      ),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, limit, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.messages({
        path: { id: sessionId },
        query: { ...(limit !== undefined ? { limit } : {}), ...(dir ? { directory: dir } : {}) },
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-05: Fetch a single message by ID within a session
server.registerTool(
  'prefect_session_message',
  {
    description: 'Fetch a single message by ID within an OpenCode session. Returns the message info and all its parts (TextPart, ToolPart, PatchPart, etc.).',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageId: z.string().describe('Message ID to fetch'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, messageId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.message({
        path: { id: sessionId, messageID: messageId },  // SDK path param is messageID (capital D)
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-06: Delete a session permanently (irreversible)
server.registerTool(
  'prefect_session_delete',
  {
    description: 'Delete an OpenCode session and all its data permanently. Returns true on success. WARNING: this is irreversible — all messages, parts, and session history will be deleted. Consider using prefect_session_rename to archive instead of deleting.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to delete'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.delete({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-07: Rename a session — MCP tool is "rename" but SDK method is client.session.update()
server.registerTool(
  'prefect_session_rename',
  {
    description: 'Rename an OpenCode session. Returns the full updated Session object.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to rename'),
      title: z.string().describe('New display title for the session'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, title, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.update({  // NOT client.session.rename — does not exist
        path: { id: sessionId },
        body: { title },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-08: List child sessions forked from a parent session
server.registerTool(
  'prefect_session_children',
  {
    description: 'List all child sessions forked from this session. Returns an empty array if no forks have been made from this session. Use prefect_fork to create child sessions.',
    inputSchema: z.object({
      sessionId: z.string().describe('Parent session ID — must be a session that was previously forked from'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.children({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-09: Undo a prior revert — NO body (SessionUnrevertData.body is typed never)
server.registerTool(
  'prefect_session_unrevert',
  {
    description: 'Restore all messages removed by a prior prefect_revert — undo the revert. Only valid if the session is in a reverted state (Session.revert field is non-null). Returns the updated Session object with the revert field cleared.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to unrevert — must have been previously reverted'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.unrevert({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
        // NO body — SessionUnrevertData.body is typed `never`
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CMD-01: Run a slash command inside an OpenCode session (e.g. /compact, /clear).
// Calls POST /session/:id/command. Same response shape as prefect_run:
// { info: AssistantMessage, parts: Part[] }. Note that `model` here is a plain
// string (e.g. "anthropic/claude-3-5-sonnet"), NOT a { providerID, modelID }
// object — this is deliberate; the OpenCode command endpoint accepts a single
// model string, unlike the prompt endpoint.
server.registerTool(
  'prefect_session_command',
  {
    description:
      'Run a slash command inside an OpenCode session (e.g. compact, clear). Returns { info: AssistantMessage, parts: Part[] } as JSON. Use this for session-level operations that have no equivalent SDK method.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      command: z.string().describe('The slash command name without the leading slash (e.g. "compact")'),
      arguments: z.string().describe('Arguments string to pass to the command (use empty string if none)'),
      messageID: z.string().optional().describe('Optional message ID for context'),
      agent: z.string().optional().describe('Optional agent override'),
      model: z
        .string()
        .optional()
        .describe('Optional model override as a plain string (NOT { providerID, modelID } — this endpoint takes a single string).'),
      directory: z.string().optional().describe('Routes this call to the OpenCode project at the specified path. Does not change the session\'s working directory. Falls back to OPENCODE_DEFAULT_PROJECT env var.'),
    }),
  },
  async ({ sessionId, command, arguments: args, messageID, agent, model, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.command({
        path: { id: sessionId },
        body: {
          command,
          arguments: args,
          ...(messageID ? { messageID } : {}),
          ...(agent ? { agent } : {}),
          ...(model ? { model } : {}),
        },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// WORKFLOW-01 + WORKFLOW-02: Blocking composite — createSession → runPrompt → getDiff.
// Returns { sessionId, result, diff } in one call, replicating the canonical three-step loop.
// On timeout: aborts the session and returns isError:true (D-05).
// Session kept alive after completion — caller decides when to delete (D-06).
server.registerTool(
  'prefect_delegate',
  {
    description:
      'Blocking composite: create a session, run a prompt, and return { sessionId, result, diff } in one call. Replicates the canonical three-step Prefect loop. Session stays alive after completion — call prefect_session_delete to clean up. Aborts the session and returns an error if PREFECT_TIMEOUT_MS is exceeded.',
    inputSchema: z.object({
      prompt: z.string().describe('The coding task or instruction to execute'),
      title: z.string().optional().describe('Optional display title for the created session'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var.'),
      model: z
        .object({ providerID: z.string(), modelID: z.string() })
        .optional()
        .describe('Override the model for this call. Both providerID and modelID required together.'),
      agent: z.string().optional().describe('Override the agent for this call.'),
      system: z.string().optional().describe('Override the system prompt for this call.'),
    }),
  },
  async ({ prompt, title, directory, model, agent, system }) => {
    const dir = resolveDirectory(directory);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let sessionId: string | undefined;
    try {
      const session = await createSession(client, title, dir);
      sessionId = session.id;
      const result = await runPrompt(client, sessionId, prompt, { model, agent, system }, dir, controller.signal);
      clearTimeout(timer);
      const diff = await getDiff(client, sessionId, undefined, dir);
      return { content: [{ type: 'text', text: JSON.stringify({ sessionId, result, diff }) }] };
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        // sessionId may be undefined if abort fired during createSession
        if (sessionId) {
          await client.session.abort({ path: { id: sessionId } }).catch(() => {});
        }
        return {
          content: [{ type: 'text', text: `prefect_delegate timed out after ${TIMEOUT_MS / 1000}s${sessionId ? ` — session ${sessionId} aborted` : ' — during session creation'}` }],
          isError: true,
        };
      }
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// WORKFLOW-03: Non-blocking composite — createSession → promptAsync → return { sessionId }.
// Returns immediately; session runs in background. Use prefect_await or
// prefect_inspect to track progress. Same model/agent/system fields as prefect_run.
server.registerTool(
  'prefect_dispatch',
  {
    description:
      'Non-blocking composite: create a session and fire a prompt asynchronously. Returns { sessionId } immediately — the agent runs in the background. Use prefect_await to poll for completion or prefect_inspect to check status.',
    inputSchema: z.object({
      prompt: z.string().describe('The coding task or instruction to execute'),
      title: z.string().optional().describe('Optional display title for the created session'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var.'),
      model: z
        .object({ providerID: z.string(), modelID: z.string() })
        .optional()
        .describe('Override the model for this call. Both providerID and modelID required together.'),
      agent: z.string().optional().describe('Override the agent for this call.'),
      system: z.string().optional().describe('Override the system prompt for this call.'),
    }),
  },
  async ({ prompt, title, directory, model, agent, system }) => {
    const dir = resolveDirectory(directory);
    try {
      const session = await createSession(client, title, dir);
      const { error } = await client.session.promptAsync({
        path: { id: session.id },
        body: {
          parts: [{ type: 'text', text: prompt }],
          ...(model ? { model } : {}),
          ...(agent ? { agent } : {}),
          ...(system ? { system } : {}),
        },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify({ sessionId: session.id }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// WORKFLOW-04: Compact snapshot — { status, todos, changedFiles }.
// Calls three endpoints in parallel: session.status() (global map — index by sessionId),
// session.todo() (requires path.id), session.diff() (mapped to { file, additions, deletions }
// only — no patch content per D-10).
server.registerTool(
  'prefect_inspect',
  {
    description:
      'Return a compact snapshot { status, todos, changedFiles } for a session. Faster than fetching full message history. changedFiles contains { file, additions, deletions } — use prefect_get_diff for full patch content.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to inspect'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const [statusResult, todoResult, diffResult] = await Promise.all([
        client.session.status({ query: dir ? { directory: dir } : undefined }),
        client.session.todo({ path: { id: sessionId }, query: dir ? { directory: dir } : undefined }),
        client.session.diff({ path: { id: sessionId }, query: dir ? { directory: dir } : undefined }),
      ]);
      if (statusResult.error) throw new Error(JSON.stringify(statusResult.error));
      if (todoResult.error) throw new Error(JSON.stringify(todoResult.error));
      if (diffResult.error) throw new Error(JSON.stringify(diffResult.error));
      const status = (statusResult.data as Record<string, { type: string }>)[sessionId]?.type ?? 'unknown';
      const todos = todoResult.data ?? [];
      const changedFiles = (diffResult.data ?? []).map((d) => ({
        file: d.file,
        additions: d.additions,
        deletions: d.deletions,
      }));
      return { content: [{ type: 'text', text: JSON.stringify({ status, todos, changedFiles }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// WORKFLOW-05 + WORKFLOW-06: Poll session.status() until the session's type is "idle",
// then reconstruct { result: { info, parts }, diff } from messages + diff endpoints.
// pollIntervalMs default 2000, timeoutMs default TIMEOUT_MS (D-14).
// On timeout: return isError:true with sessionId in payload (D-15).
// Undefined status entry (session not in map) is treated as idle — OpenCode may have
// already completed and removed the session from the status map before first poll.
server.registerTool(
  'prefect_await',
  {
    description:
      'Poll a dispatched session until it reaches idle state, then return { result: { info, parts }, diff }. Use after prefect_dispatch. Accepts pollIntervalMs (default 2000) and timeoutMs (default PREFECT_TIMEOUT_MS).',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from prefect_dispatch'),
      pollIntervalMs: z.number().int().positive().optional().describe('Milliseconds between status polls. Default: 2000.'),
      timeoutMs: z.number().int().positive().optional().describe('Maximum milliseconds to wait. Default: PREFECT_TIMEOUT_MS env var (default 120000).'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var.'),
    }),
  },
  async ({ sessionId, pollIntervalMs = 2000, timeoutMs = TIMEOUT_MS, directory }) => {
    const dir = resolveDirectory(directory);
    const deadline = Date.now() + timeoutMs;
    try {
      // Poll until idle or timeout
      while (true) {
        const { data, error } = await client.session.status({ query: dir ? { directory: dir } : undefined });
        if (error) throw new Error(JSON.stringify(error));
        const statusEntry = (data as Record<string, { type: string }>)[sessionId];
        // Treat undefined (session not in map) as idle — may have completed before first poll
        if (!statusEntry || statusEntry.type === 'idle') break;
        if (Date.now() >= deadline) {
          return {
            content: [{ type: 'text', text: JSON.stringify({ error: `prefect_await timed out after ${timeoutMs}ms`, sessionId }) }],
            isError: true,
          };
        }
        await new Promise<void>((r) => setTimeout(r, pollIntervalMs));
      }
      // Reconstruct result from messages (last assistant message) and full diff
      const [messagesResult, diffResult] = await Promise.all([
        client.session.messages({ path: { id: sessionId }, query: dir ? { directory: dir } : undefined }),
        client.session.diff({ path: { id: sessionId }, query: dir ? { directory: dir } : undefined }),
      ]);
      if (messagesResult.error) throw new Error(JSON.stringify(messagesResult.error));
      if (diffResult.error) throw new Error(JSON.stringify(diffResult.error));
      // D-12: find last assistant message — same shape as prefect_run result
      const msgs = messagesResult.data ?? [];
      const last = [...msgs].reverse().find((m) => (m.info as { role?: string }).role === 'assistant');
      if (!last) throw new Error('prefect_await: no assistant message found in session after idle');
      const validatedParts = PartSchema.array().parse(last.parts);
      const diff = (diffResult.data ?? []).map((d) => ({
        ...d,
        patch: createPatch(d.file, d.before, d.after),
      }));
      // D-13: return shape matches prefect_delegate for easy substitution
      return { content: [{ type: 'text', text: JSON.stringify({ result: { info: last.info, parts: validatedParts }, diff }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// API-01: List OpenCode agents (Phase 8)
server.registerTool(
  'prefect_list_agents',
  {
    description: 'List the agents available in the connected OpenCode instance. Returns Array<{ name, description?, mode }>. Use the returned name (e.g. "build", "general") as the agent param when calling prefect_run. Pass directory to scope to a specific project root.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.app.agents({
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      const mapped = (data ?? []).map((a) => ({
        name: a.name,
        description: a.description,
        mode: a.mode,
      }));
      return { content: [{ type: 'text', text: JSON.stringify(mapped) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// API-02: List OpenCode providers and their models (Phase 8)
server.registerTool(
  'prefect_list_providers',
  {
    description: 'List the providers configured in the connected OpenCode instance and their available models. Returns Array<{ id, name, models: Array<{ id, name }> }>. Use returned provider.id + model.id as providerID/modelID params for prefect_run. Pass directory to scope to a specific project root.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.provider.list({
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      const mapped = (data?.all ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        models: Object.values(p.models).map((m) => ({ id: m.id, name: m.name })),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(mapped) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// API-03: Find workspace symbols by query (Phase 8)
server.registerTool(
  'prefect_find_symbol',
  {
    description: 'Search the OpenCode workspace for symbols matching a query string (e.g. function or class names). Returns Array<{ name, kind, path, range }> where path is project-root-relative when a directory is resolved (via directory param or OPENCODE_DEFAULT_PROJECT), absolute otherwise. kind is the LSP SymbolKind number.',
    inputSchema: z.object({
      query: z.string().describe('Symbol name or pattern to search for'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to OPENCODE_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async (args) => {
    const { query: symbolQuery, directory } = args;
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.find.symbols({
        query: { query: symbolQuery, ...(dir ? { directory: dir } : {}) },
      });
      if (error) throw new Error(JSON.stringify(error));
      const mapped = (data ?? []).map((sym) => {
        if (!sym.location.uri.startsWith('file://')) return null;
        const absolutePath = decodeURIComponent(sym.location.uri.replace(/^file:\/\//, ''));
        const filePath = dir ? path.relative(dir, absolutePath) : absolutePath;
        return {
          name: sym.name,
          kind: sym.kind,
          path: filePath,
          range: sym.location.range,
        };
      }).filter((sym) => sym !== null);
      return { content: [{ type: 'text', text: JSON.stringify(mapped) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-11: Trigger session summary generation
server.registerTool(
  'prefect_session_summarize',
  {
    description: 'Trigger summary generation for an OpenCode session. Returns true when the summarization was accepted. Optionally override the model used for summarization by passing both providerID AND modelID together (passing only one is ignored).',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      providerID: z.string().optional().describe('Override provider for summarization (e.g. "anthropic"). Requires modelID.'),
      modelID: z.string().optional().describe('Override model for summarization (e.g. "claude-3-5-haiku-20241022"). Requires providerID.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, providerID, modelID, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.summarize({
        path: { id: sessionId },
        ...(providerID && modelID ? { body: { providerID, modelID } } : {}),
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-12: Get the current todo list for a session
server.registerTool(
  'prefect_session_todo',
  {
    description: 'Get the current todo list for an OpenCode session. Returns Array<{ id, content, status, priority }> where status is one of pending/in_progress/completed/cancelled and priority is high/medium/low.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.todo({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-13: Generate AGENTS.md for the session's project
server.registerTool(
  'prefect_session_init',
  {
    description: 'Analyze the session\'s project and generate an AGENTS.md file. Safe by default: if AGENTS.md already exists in the resolved directory, returns { existed: true, existing: "<content>", generated: null } WITHOUT calling the endpoint — nothing is written. Pass force: true to overwrite explicitly; on forced overwrite returns { existed: true, accepted: true }. When directory cannot be resolved, skips conflict detection and proceeds. If the file does not exist, calls the endpoint and returns { existed: false, accepted: true }.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      providerID: z.string().optional().describe('Override provider for AGENTS.md generation. Requires modelID.'),
      modelID: z.string().optional().describe('Override model for AGENTS.md generation. Requires providerID.'),
      messageID: z.string().optional().describe('Resume analysis from a specific message context.'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
      force: z.boolean().optional().describe('Overwrite an existing AGENTS.md without prompting. Default false — returns the existing content instead of writing.'),
    }),
  },
  async ({ sessionId, providerID, modelID, messageID, directory, force }) => {
    const dir = resolveDirectory(directory);
    try {
      const agentsPath = dir ? path.join(dir, 'AGENTS.md') : null;

      // Guard: return existing content without calling the endpoint unless force is set
      if (agentsPath && existsSync(agentsPath) && !force) {
        const existing = readFileSync(agentsPath, 'utf8');
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ existed: true, existing, generated: null }),
          }],
        };
      }

      const bodyFields = {
        ...(providerID ? { providerID } : {}),
        ...(modelID ? { modelID } : {}),
        ...(messageID ? { messageID } : {}),
      };
      const { data, error } = await client.session.init({
        path: { id: sessionId },
        ...(Object.keys(bodyFields).length > 0
          ? { body: bodyFields as { modelID: string; providerID: string; messageID: string } }
          : {}),
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));

      const existed = agentsPath ? existsSync(agentsPath) && force : false;
      return { content: [{ type: 'text', text: JSON.stringify({ existed: !!existed, accepted: data }) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-15: Make a session publicly shareable
server.registerTool(
  'prefect_session_share',
  {
    description: 'Make an OpenCode session publicly shareable. Returns the full Session object — after sharing, the share URL is available at session.share.url in the returned Session.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to share'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.share({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// SESSION-16: Remove sharing from a session
server.registerTool(
  'prefect_session_unshare',
  {
    description: 'Remove public sharing from an OpenCode session. Returns the updated Session object with the share field cleared (session.share will be absent/undefined).',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to unshare'),
      directory: z.string().optional().describe('Absolute path to the project root. Falls back to PREFECT_DEFAULT_PROJECT env var if not provided.'),
    }),
  },
  async ({ sessionId, directory }) => {
    const dir = resolveDirectory(directory);
    try {
      const { data, error } = await client.session.unshare({
        path: { id: sessionId },
        query: dir ? { directory: dir } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr only — never stdout (corrupts JSON-RPC stream)
  console.error(`Prefect MCP server running (OpenCode: ${BASE_URL})`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
