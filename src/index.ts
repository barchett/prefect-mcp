#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { createOpencodeClient } from '@opencode-ai/sdk';
import { createPatch } from 'diff';
import { PartSchema } from './parts.js';

// CORE-08: Base URL from OPENCODE_URL env var, default http://localhost:4096
const BASE_URL = process.env.OPENCODE_URL ?? 'http://localhost:4096';
const TIMEOUT_MS = parseInt(process.env.PREFECT_TIMEOUT_MS ?? '120000', 10);
const client = createOpencodeClient({ baseUrl: BASE_URL });

const server = new McpServer({ name: 'prefect', version: '1.0.0' });

// CORE-01: Create a new OpenCode session
server.registerTool(
  'opencode_create_session',
  {
    description: 'Create a new OpenCode coding session. Returns the Session object including the session id (ULID) used by all other tools. Pass directory to pin the session to a specific project root — required when OpenCode serves multiple projects from a single running instance.',
    inputSchema: z.object({
      title: z.string().optional().describe('Optional display title for the session'),
      directory: z.string().optional().describe('Absolute path to the project root for this session. Defaults to the directory OpenCode was started from.'),
    }),
  },
  async ({ title, directory }) => {
    try {
      const { data, error } = await client.session.create({
        body: { title },
        query: directory ? { directory } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-07: Abort a running session
server.registerTool(
  'opencode_abort',
  {
    description: 'Abort a running OpenCode session. Returns true on success.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID returned from opencode_create_session'),
    }),
  },
  async ({ sessionId }) => {
    try {
      const { data, error } = await client.session.abort({ path: { id: sessionId } });
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
  'opencode_run',
  {
    description:
      'Send a prompt to an OpenCode session and block until the agent finishes. Returns { info: AssistantMessage, parts: Part[] } as JSON. Optional model/agent/system override the session defaults for this single call. May take seconds to minutes depending on task complexity.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from opencode_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
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
    }),
  },
  async ({ sessionId, prompt, model, agent, system }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const { data, error } = await client.session.prompt({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
          ...(model ? { model } : {}),
          ...(agent ? { agent } : {}),
          ...(system ? { system } : {}),
        },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (error) throw new Error(JSON.stringify(error));
      // SURF-02: validate parts against the discriminated union from src/parts.ts
      const validatedParts = PartSchema.array().parse(data!.parts);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({ info: data!.info, parts: validatedParts }),
          },
        ],
      };
    } catch (err) {
      clearTimeout(timer);
      if ((err as Error).name === 'AbortError') {
        return {
          content: [
            {
              type: 'text',
              text: `opencode_run timed out after ${TIMEOUT_MS / 1000}s — check OPENCODE_URL and model endpoint`,
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
// Same body shape as opencode_run (model/agent/system supported) but no timeout
// because the API returns immediately. Use opencode_session_status to poll for
// completion.
server.registerTool(
  'opencode_prompt_async',
  {
    description:
      'Send a prompt to an OpenCode session and return immediately without waiting for the agent to finish. Returns { sessionId, accepted: true } on success. Use opencode_session_status to poll for completion, then opencode_session_messages or opencode_get_diff to retrieve results.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID from opencode_create_session'),
      prompt: z.string().describe('The coding task or instruction to send'),
      model: z
        .object({
          providerID: z.string(),
          modelID: z.string(),
        })
        .optional()
        .describe('Override the model for this single call. Both providerID and modelID are required together.'),
      agent: z.string().optional().describe('Override the agent for this single call.'),
      system: z.string().optional().describe('Override the system prompt for this single call.'),
    }),
  },
  async ({ sessionId, prompt, model, agent, system }) => {
    try {
      const { error } = await client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: 'text', text: prompt }],
          ...(model ? { model } : {}),
          ...(agent ? { agent } : {}),
          ...(system ? { system } : {}),
        },
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
  'opencode_get_diff',
  {
    description: 'Get the file diff for an OpenCode session. Returns an array of FileDiff objects (file, before, after, additions, deletions). If messageID is provided, returns the diff for that message; otherwise returns the diff for the session.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageID: z.string().optional().describe('Optional message ID to scope the diff to a single message'),
    }),
  },
  async ({ sessionId, messageID }) => {
    try {
      const { data, error } = await client.session.diff({
        path: { id: sessionId },
        query: messageID ? { messageID } : undefined,
      });
      if (error) throw new Error(JSON.stringify(error));
      const withPatch = (data ?? []).map((d) => ({
        ...d,
        patch: createPatch(d.file, d.before, d.after),
      }));
      return { content: [{ type: 'text', text: JSON.stringify(withPatch) }] };
    } catch (err) {
      return { content: [{ type: 'text', text: String(err) }], isError: true };
    }
  }
);

// CORE-04: Respond to an OpenCode permission request
// NOTE: REQUIREMENTS.md says allow/deny/allow_always — that's WRONG.
// The OpenCode API enum is "once" | "always" | "reject" (verified from @opencode-ai/sdk types).
server.registerTool(
  'opencode_approve_permission',
  {
    description: 'Respond to an OpenCode permission request. once = approve this request only; always = approve similar future requests; reject = deny.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      permissionId: z.string().describe('Permission request ID'),
      response: z.enum(['once', 'always', 'reject']).describe(
        'once = approve this request only; always = approve similar future requests; reject = deny'
      ),
    }),
  },
  async ({ sessionId, permissionId, response }) => {
    try {
      // CRITICAL: permissions method is on TOP-LEVEL client, NOT client.session
      const { data, error } = await client.postSessionIdPermissionsPermissionId({
        path: { id: sessionId, permissionID: permissionId },
        body: { response },
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
  'opencode_fork',
  {
    description: 'Fork an OpenCode session, optionally at a specific message. Returns a new Session. Use this as an escape hatch when a session has gone off the rails.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to fork from'),
      messageID: z.string().optional().describe('Optional message ID to fork at; if omitted, forks at the current tip'),
    }),
  },
  async ({ sessionId, messageID }) => {
    try {
      const { data, error } = await client.session.fork({
        path: { id: sessionId },
        body: messageID ? { messageID } : undefined,
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
  'opencode_revert',
  {
    description: 'Revert an OpenCode session to a prior message. messageID is required. Optionally scope to a specific part of that message via partID.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageID: z.string().describe('Required: message ID to revert to'),
      partID: z.string().optional().describe('Optional: specific part within the message'),
    }),
  },
  async ({ sessionId, messageID, partID }) => {
    try {
      const { data, error } = await client.session.revert({
        path: { id: sessionId },
        body: { messageID, ...(partID ? { partID } : {}) },
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
  'opencode_session_list',
  {
    description: 'List all OpenCode sessions. Returns an array of Session objects each with id, title, directory, time.created, time.updated, and optional summary/share/revert fields. Pass directory to filter sessions by project root.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Filter sessions by project directory path'),
    }),
  },
  async ({ directory }) => {
    try {
      const { data, error } = await client.session.list({
        query: directory ? { directory } : undefined,
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
  'opencode_session_get',
  {
    description: 'Fetch a single OpenCode session by ID. Returns the full Session object including id, title, directory, parentID (if forked), and revert state.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to fetch'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.get({
        path: { id: sessionId },
        query: directory ? { directory } : undefined,
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
  'opencode_session_status',
  {
    description: 'Get the real-time status of all active OpenCode sessions. Returns a map of sessionID → SessionStatus where status is one of: { type: "idle" }, { type: "busy" }, or { type: "retry", attempt, message, next }. Use this before calling opencode_run to verify the target session is idle and not still processing a previous prompt.',
    inputSchema: z.object({
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ directory }) => {
    try {
      const { data, error } = await client.session.status({
        query: directory ? { directory } : undefined,
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
  'opencode_session_messages',
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
    try {
      const { data, error } = await client.session.messages({
        path: { id: sessionId },
        query: { ...(limit !== undefined ? { limit } : {}), ...(directory ? { directory } : {}) },
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
  'opencode_session_message',
  {
    description: 'Fetch a single message by ID within an OpenCode session. Returns the message info and all its parts (TextPart, ToolPart, PatchPart, etc.).',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID'),
      messageId: z.string().describe('Message ID to fetch'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, messageId, directory }) => {
    try {
      const { data, error } = await client.session.message({
        path: { id: sessionId, messageID: messageId },  // SDK path param is messageID (capital D)
        query: directory ? { directory } : undefined,
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
  'opencode_session_delete',
  {
    description: 'Delete an OpenCode session and all its data permanently. Returns true on success. WARNING: this is irreversible — all messages, parts, and session history will be deleted. Consider using opencode_session_rename to archive instead of deleting.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to delete'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.delete({
        path: { id: sessionId },
        query: directory ? { directory } : undefined,
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
  'opencode_session_rename',
  {
    description: 'Rename an OpenCode session. Returns the full updated Session object.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to rename'),
      title: z.string().describe('New display title for the session'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, title, directory }) => {
    try {
      const { data, error } = await client.session.update({  // NOT client.session.rename — does not exist
        path: { id: sessionId },
        body: { title },
        query: directory ? { directory } : undefined,
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
  'opencode_session_children',
  {
    description: 'List all child sessions forked from this session. Returns an empty array if no forks have been made from this session. Use opencode_fork to create child sessions.',
    inputSchema: z.object({
      sessionId: z.string().describe('Parent session ID — must be a session that was previously forked from'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.children({
        path: { id: sessionId },
        query: directory ? { directory } : undefined,
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
  'opencode_session_unrevert',
  {
    description: 'Restore all messages removed by a prior opencode_revert — undo the revert. Only valid if the session is in a reverted state (Session.revert field is non-null). Returns the updated Session object with the revert field cleared.',
    inputSchema: z.object({
      sessionId: z.string().describe('Session ID to unrevert — must have been previously reverted'),
      directory: z.string().optional().describe('Optional directory filter'),
    }),
  },
  async ({ sessionId, directory }) => {
    try {
      const { data, error } = await client.session.unrevert({
        path: { id: sessionId },
        query: directory ? { directory } : undefined,
        // NO body — SessionUnrevertData.body is typed `never`
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
