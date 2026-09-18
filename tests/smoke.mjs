#!/usr/bin/env node
/**
 * Smoke test: boot the built dsh-onedev-mcp server over stdio and verify that
 * every admin tool registers and is listed via the MCP tools/list protocol.
 *
 * Usage: npm run build && npm test   (or: node tests/smoke.mjs)
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, '..', 'bin', 'dsh-onedev-mcp.mjs')

function assert(cond, msg) {
  if (!cond) throw new Error(`SMOKE FAIL: ${msg}`)
}

const expectedTools = [
  'onedev_api_request',
  'onedev_docs_search', 'onedev_docs_read', 'onedev_docs_list',
  'onedev_list_environments',
  'users_list', 'user_create', 'user_get', 'user_update', 'user_disable', 'user_enable',
  'user_set_password', 'user_access_tokens', 'groups_list', 'group_create', 'group_members_add',
  'group_members_remove', 'roles_list', 'projects_list', 'project_create', 'project_delete',
  'agents_list', 'agent_token_create', 'builds_list', 'server_version', 'setting_get', 'setting_update',
]

/** Non-standalone tools must expose an optional `environment` param. */
function checkEnvParam(tools) {
  const connTools = tools.filter((t) => t.name !== 'onedev_list_environments'
    && t.name !== 'onedev_docs_search' && t.name !== 'onedev_docs_read' && t.name !== 'onedev_docs_list')
  const lister = tools.find((t) => t.name === 'onedev_list_environments')
  const apiReq = tools.find((t) => t.name === 'onedev_api_request')
  if (!lister) throw new Error('SMOKE FAIL: onedev_list_environments missing')
  // Standalone discovery tool must NOT carry the connection gate env param.
  if (lister.inputSchema && lister.inputSchema.properties && lister.inputSchema.properties.environment) {
    throw new Error('SMOKE FAIL: standalone env tool should not have an environment param')
  }
  for (const t of connTools) {
    const props = (t.inputSchema && t.inputSchema.properties) || {}
    if (!props.environment) throw new Error(`SMOKE FAIL: ${t.name} has no environment param`)
  }
  if (apiReq && apiReq.inputSchema && apiReq.inputSchema.properties && !apiReq.inputSchema.properties.environment) {
    throw new Error('SMOKE FAIL: onedev_api_request missing environment param')
  }
}

async function main() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bin],
    env: {
      ...process.env,
      ONEDEV_URL: 'http://127.0.0.1:6610',
      ONEDEV_TOKEN: 'smoke-dummy-token',
      ONEDEV_MCP_TRANSPORT: 'stdio',
    },
    stderr: 'inherit',
  })

  const client = new Client({ name: 'dsh-smoke', version: '0.0.0' })
  await client.connect(transport)

  const res = await client.listTools()
  const tools = res.tools
  const names = tools.map((t) => t.name)
  console.log(`registered ${names.length} tools`)
  for (const t of expectedTools) assert(names.includes(t), `expected tool '${t}' not found`)
  checkEnvParam(tools)

  // tool/call of a read-only tool should NOT hit the network for server_version? It does hit the network.
  // Instead, only verify listTools + that no two tools share a name.
  const unique = new Set(names)
  assert(unique.size === names.length, 'duplicate tool names')

  console.log('smoke: tools/list OK')
  console.log('sample tool names:', names.slice(0, 12).join(', '))
  await client.close()
  process.exit(0)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})