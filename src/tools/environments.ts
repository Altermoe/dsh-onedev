/**
 * Environment discovery tools.
 *
 * Every other non-standalone tool can target a specific configured OneDev
 * server via its optional `environment` slug. This standalone tool returns the
 * redacted list of configured environments (slug, remark, url, auth type,
 * primary/configured flags) so the AI can first "see" what is available, then
 * reference exactly the environment it wants — no ambiguity.
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'
import { listEnvironments as listConfiguredEnvironments } from '../config.js'

export const environmentTools: ToolDefinition[] = [
  tool(
    'onedev_list_environments',
    'List OneDev Environments',
    [
      'List every configured OneDev environment (slug, remark, URL, auth type, primary).',
      'Call this FIRST to discover which environments are available, then pass the matching',
      '`environment` slug to any other onedev tool to target that server unambiguously. The',
      '`query` argument filters by slug/remark/URL (case-insensitive substring).',
    ].join(' '),
    z.object({
      query: z
        .string()
        .optional()
        .describe('Optional case-insensitive substring filter over slug / remark / URL'),
    }),
    async (_client, args) => {
      return listConfiguredEnvironments(process.env, typeof args.query === 'string' ? args.query : undefined)
    },
    { standalone: true },
  ),
]