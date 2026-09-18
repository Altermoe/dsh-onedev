/**
 * Registry of all MCP tools exposed by dsh-onedev-mcp.
 */

import type { ToolDefinition } from './types.js'
import { genericTools } from './generic.js'
import { docsTools } from './docs.js'
import { environmentTools } from './environments.js'
import { userTools } from './users.js'
import { groupTools } from './groups.js'
import { roleTools } from './roles.js'
import { projectTools } from './projects.js'
import { agentTools } from './agents.js'
import { settingTools } from './settings.js'

export * from './types.js'

export const TOOLS: readonly ToolDefinition[] = [
  ...genericTools,
  ...docsTools,
  ...environmentTools,
  ...userTools,
  ...groupTools,
  ...roleTools,
  ...projectTools,
  ...agentTools,
  ...settingTools,
]

/** Read view of the tool list (name + one-line description) for tooling/docs. */
export function describeTools(): Record<string, string> {
  return Object.fromEntries(TOOLS.map((t) => [t.name, t.description]))
}