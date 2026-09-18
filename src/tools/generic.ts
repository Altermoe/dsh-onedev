/**
 * Generic "direct connection" tool.
 *
 * This is the power primitive behind the plugin's design goal: the AI connects
 * straight to the OneDev REST API and can issue any authenticated request,
 * covering the full surface (items we did not hand-wrap as typed tools are
 * reachable through it).
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'

const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const

export const genericTools: ToolDefinition[] = [
  tool(
    'onedev_api_request',
    'OneDev Direct API Request',
    [
      'Execute an arbitrary authenticated request against the OneDev REST API. This is the raw "direct connection"',
      'primitive: `path` is appended to the configured API base (e.g. "/users" → /~api/users). Useful for endpoints',
      'that are not wrapped as dedicated tools. Response body is returned as JSON. Reads vs writes are governed by',
      '`method`; in read-only mode only GET/HEAD are allowed.',
    ].join(' '),
    z.object({
      method: z.enum(METHODS).default('GET').describe('HTTP method'),
      path: z.string().min(1).describe('API path appended to the API base, e.g. "/users", "/projects/{id}/setting"'),
      query: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]).nullish())
        .optional()
        .describe('Query parameters (objects are the caller\'s responsibility to flatten)'),
      body: z.unknown().optional().describe('JSON request body (required for POST/PUT)'),
    }),
    async (client, args) => {
      const method = args.method as string
      const path = args.path as string
      const query = (args.query ?? undefined) as Record<string, unknown> | undefined
      const body = args.body
      const res = await client.request_<unknown>(method, path, {
        query: query as Record<string, string | number | boolean | undefined | null> | undefined,
        body,
      })
      return { ok: res.ok, status: res.status, data: res.data }
    },
  ),
]