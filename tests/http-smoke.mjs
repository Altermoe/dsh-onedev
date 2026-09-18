#!/usr/bin/env node
/**
 * HTTP smoke test: boot dsh-onedev-mcp in streamable-http mode and drive it
 * with a raw MCP-over-HTTP initialize + tools/list sequence.
 *
 * Usage: node tests/http-smoke.mjs
 */

import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, '..', 'bin', 'dsh-onedev-mcp.mjs')
const PORT = 19099

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)) }

/** Parse a possibly-SSE body into the JSON-RPC payload(s). */
function parseMcpBody(text) {
  const dataLines = []
  for (const block of text.split(/\r?\n\r?\n/)) {
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
    }
  }
  if (dataLines.length) {
    const parsed = dataLines.map((d) => JSON.parse(d))
    return parsed.length === 1 ? parsed[0] : parsed
  }
  if (text.trim() === '') return {}
  return JSON.parse(text)
}

async function main() {
  const child = spawn(process.execPath, [bin], {
    env: {
      ...process.env,
      ONEDEV_URL: 'http://127.0.0.1:6610',
      ONEDEV_TOKEN: 'smoke-dummy-token',
      ONEDEV_MCP_TRANSPORT: 'streamable-http',
      ONEDEV_MCP_PORT: String(PORT),
      ONEDEV_MCP_HOST: '127.0.0.1',
    },
    stdio: ['ignore', 'ignore', 'inherit'],
  })

  const base = `http://127.0.0.1:${PORT}/mcp`
  let out = ''
  // Wait until the port is listening.
  for (let i = 0; i < 50; i++) {
    try {
      const r = await fetch(base, { method: 'OPTIONS' })
      out = r.headers.get('mcp-session-id') ?? ''
      break
    } catch { await sleep(200) }
  }
  // OPTIONS on our handler returns 405; just wait then try initialize.
  await sleep(400)

  const initRes = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0', id: 1, method: 'initialize',
      params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'http-smoke', version: '0.0.0' } },
    }),
  })
  if (initRes.status !== 200) throw new Error(`initialize HTTP ${initRes.status}: ${await initRes.text()}`)
  const sessionId = initRes.headers.get('mcp-session-id')
  const initBody = parseMcpBody(await initRes.text())
  if (initBody.result?.serverInfo?.name !== 'dsh-onedev-mcp') {
    throw new Error('serverInfo.name mismatch: ' + JSON.stringify(initBody))
  }
  console.log('initialize OK, sessionId =', sessionId)

  // notifications/initialized
  await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId, accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }),
  })

  const listRes = await fetch(base, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'mcp-session-id': sessionId, accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }),
  })
  const listBody = parseMcpBody(await listRes.text())
  const tools = listBody.result?.tools
  if (!tools || !Array.isArray(tools)) throw new Error('tools/list failed: ' + JSON.stringify(listBody))
  const hasApi = !!tools.find((t) => t.name === 'onedev_api_request')
  const hasEnv = !!tools.find((t) => t.name === 'onedev_list_environments')
  console.log(`tools/list HTTP OK: ${tools.length} tools; onedev_api_request=${hasApi}; onedev_list_environments=${hasEnv}`)
  if (!hasApi || !hasEnv) throw new Error('expected onedev_api_request and onedev_list_environments tools')

  await fetch(base, { method: 'DELETE', headers: { 'mcp-session-id': sessionId } }).catch(() => undefined)
  child.kill('SIGTERM')
  process.exit(listBody.result && tools.length > 0 ? 0 : 1)
}

main().catch((e) => { console.error(e); process.exit(1) })