/**
 * Build agents, agent tokens and build records.
 *
 * Agents: `AgentResource` (`/agents`). Agent tokens: `AgentTokenResource`
 * (`/agent-tokens`). Builds: `BuildResource` (`/builds`).
 */

import { z } from 'zod'
import { tool, normalizeQuery, withListQueryHint, type ToolDefinition } from './types.js'

const agentId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .describe('Numeric agent id')
const buildId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .describe('Numeric build id')

export const agentTools: ToolDefinition[] = [
  tool(
    'agents_list',
    'List Build Agents',
    'List registered build agents (online/offline), with paging.',
    z.object({
      osArch: z.string().optional(),
      osName: z.string().optional(),
      osVersion: z.string().optional(),
      status: z.enum(['ONLINE', 'OFFLINE', 'PAUSED']).optional(),
      online: z.boolean().optional(),
      count: z.number().int().min(1).max(1000).default(100),
      offset: z.number().int().min(0).default(0),
    }),
    (c, a) => c.get<unknown[]>('/agents', {
      osArch: a.osArch as string | undefined,
      osName: a.osName as string | undefined,
      osVersion: a.osVersion as string | undefined,
      status: a.status as string | undefined,
      online: a.online as boolean | undefined,
      count: a.count as number,
      offset: a.offset as number,
    }).then((r) => r.data),
  ),

  tool(
    'agent_get',
    'Get Build Agent',
    'Get a single build agent by numeric id.',
    z.object({ id: agentId }),
    (c, a) => c.get(`/agents/${a.id}`).then((r) => r.data),
  ),

  tool(
    'agent_attributes_get',
    'Get Build Agent Attributes',
    'Get the attribute map of a build agent.',
    z.object({ id: agentId }),
    (c, a) => c.get(`/agents/${a.id}/attributes`).then((r) => r.data),
  ),

  tool(
    'agent_attributes_set',
    'Set Build Agent Attributes',
    'Replace the full attribute map of a build agent (often used to set the "docker" attribute).',
    z.object({ id: agentId, attributes: z.record(z.string(), z.string()) }),
    (c, a) => c.post(`/agents/${a.id}/attributes`, a.attributes).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),

  tool(
    'agent_tokens_list',
    'List Agent Tokens',
    'List agent join tokens.',
    z.object({ value: z.string().optional() }),
    (c, a) => c.get('/agent-tokens', { value: a.value as string | undefined }).then((r) => r.data),
  ),

  tool(
    'agent_token_create',
    'Create Agent Token',
    'Create a new agent join token. Returns the new token id (assign it to agents to let them register).',
    z.object({}),
    (c) => c.post('/agent-tokens').then((r) => ({ id: r.data })),
  ),

  tool(
    'agent_token_delete',
    'Delete Agent Token',
    'Revoke an agent join token by numeric id (disconnects agents using it).',
    z.object({ id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]) }),
    (c, a) => c.delete(`/agent-tokens/${a.id}`).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),

  tool(
    'builds_list',
    'List Builds',
    'List builds using the strict OneDev builds-page search criteria grammar, with paging. '
      + 'Omit `query` to list all builds.',
    z.object({
      query: z.string().optional().describe(
        'OneDev builds criteria string. Valid examples: `"Project" is "my/repo/path"`, '
        + '`"Job" is "build"`, `"Version" is "v1.2.3"`. This is NOT free-text search: unlike the '
        + 'web UI, unquoted or unknown field names are rejected (HTTP 406/500).'),
      offset: z.number().int().min(0).default(0),
      count: z.number().int().min(1).max(1000).default(100),
    }),
    withListQueryHint(
      (c, a) => c.get<unknown[]>('/builds', {
        query: normalizeQuery(a.query),
        offset: a.offset as number,
        count: a.count as number,
      }).then((r) => r.data),
      'For builds use a quoted field like `"Project" is "my/repo/path"`, `"Job" is "build"`, or '
      + '`"Version" is "v1.2.3"`.',
    ),
  ),

  tool(
    'build_get',
    'Get Build',
    'Get a single build by numeric id.',
    z.object({ id: buildId }),
    (c, a) => c.get(`/builds/${a.id}`).then((r) => r.data),
  ),

  tool(
    'build_set_description',
    'Set Build Description',
    'Set the free-text description of a build.',
    z.object({ id: buildId, description: z.string() }),
    (c, a) => c.post(`/builds/${a.id}/description`, a.description).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),

  tool(
    'build_labels',
    'Get Build Labels',
    'Get the labels attached to a build.',
    z.object({ id: buildId }),
    (c, a) => c.get(`/builds/${a.id}/labels`).then((r) => r.data),
  ),
]