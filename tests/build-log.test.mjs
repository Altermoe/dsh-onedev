/**
 * Tests for the `build_log` tool.
 *
 * OneDev streams build logs from `GET /streaming/build-logs/{buildId}` as an
 * `application/octet-stream` length-prefixed binary stream — there is no
 * `/builds/{id}/log` endpoint (that path answers HTTP 404). These tests drive
 * the real server over an in-memory MCP transport with a mocked fetch and
 * verify the decoded output, the request (path + Accept header), tail selection
 * and partial-stream handling. No network.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'

import { buildServer } from '../dist/index.js'
import { loadConfig } from '../dist/config.js'

function okProvider() {
  const config = loadConfig({ ONEDEV_URL: 'http://onedev.test', ONEDEV_TOKEN: 'tok' })
  return () => ({ ok: true, config })
}

async function buildLinkedClient(provider = okProvider()) {
  const server = buildServer(provider)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'dsh-build-log', version: '0.0.0' })
  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
  return client
}

/** A minimal fetch Response stand-in whose body is a real byte stream. */
function binaryResponse(bytes, { status = 200, contentType = 'application/octet-stream' } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    body: new Response(bytes).body,
    text: async () => Buffer.from(bytes).toString('utf8'),
  }
}

function int32(n) {
  const b = Buffer.alloc(4)
  b.writeInt32BE(n)
  return b
}
function statusFrame(status) {
  const payload = Buffer.from(status, 'utf8')
  return Buffer.concat([int32(-payload.length), payload])
}
function entryFrame(date, text) {
  const payload = Buffer.from(JSON.stringify({ date, messages: [{ style: {}, text }] }), 'utf8')
  return Buffer.concat([int32(payload.length), payload])
}

function installFetch(handler, t) {
  const calls = []
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ method: (init.method || 'GET').toUpperCase(), url: String(url), headers: init.headers })
    return handler()
  }
  t.after(() => { globalThis.fetch = orig })
  return calls
}

function payloadOf(res) {
  assert.notEqual(res.isError, true, res.content?.map((c) => c.text).join('\n'))
  return JSON.parse(res.content.map((c) => c.text).join('\n'))
}

test('build_log requests the streaming endpoint with an octet-stream Accept and decodes it', async (t) => {
  const bytes = Buffer.concat([
    statusFrame('FAILED'),
    entryFrame('2026-10-09T08:24:42.685+00:00', 'Pending resource allocation...'),
    entryFrame('2026-10-09T08:24:44.100+00:00', 'npm ERR! missing script: build'),
    statusFrame('FAILED'),
  ])
  const calls = installFetch(() => binaryResponse(bytes), t)

  const client = await buildLinkedClient()
  const res = await client.callTool({ name: 'build_log', arguments: { environment: 'nahida', id: 174 } })
  const payload = payloadOf(res)

  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'GET')
  assert.equal(calls[0].url, 'http://onedev.test/~api/streaming/build-logs/174')
  assert.equal(calls[0].headers.Accept, 'application/octet-stream')

  assert.equal(payload.status, 'FAILED')
  assert.equal(payload.entryCount, 2)
  assert.equal(payload.returned, 2)
  assert.equal(payload.truncated, false)
  assert.equal(payload.timedOut, false)
  assert.match(payload.log, /Pending resource allocation/)
  assert.match(payload.log, /missing script: build/)
  await client.close()
})

test('build_log never targets the non-existent /builds/{id}/log path', async (t) => {
  const calls = installFetch(() => binaryResponse(Buffer.concat([statusFrame('SUCCESSFUL')])), t)
  const client = await buildLinkedClient()
  await client.callTool({ name: 'build_log', arguments: { environment: 'x', id: '7' } })
  assert.ok(!calls.some((c) => c.url.includes('/builds/7/log')), 'must not call /builds/{id}/log')
  assert.ok(calls[0].url.endsWith('/~api/streaming/build-logs/7'), calls[0].url)
  await client.close()
})

test('build_log tail + maxEntries return the end of a long log', async (t) => {
  const frames = [statusFrame('SUCCESSFUL')]
  for (let i = 1; i <= 5; i++) frames.push(entryFrame('2026-10-09T08:24:42.000+00:00', `line-${i}`))
  frames.push(statusFrame('SUCCESSFUL'))
  installFetch(() => binaryResponse(Buffer.concat(frames)), t)

  const client = await buildLinkedClient()

  const head = payloadOf(await client.callTool({
    name: 'build_log', arguments: { environment: 'x', id: 1, maxEntries: 2 },
  }))
  assert.equal(head.entryCount, 5)
  assert.equal(head.returned, 2)
  assert.equal(head.log, '2026-10-09T08:24:42.000+00:00 line-1\n2026-10-09T08:24:42.000+00:00 line-2')

  const tail = payloadOf(await client.callTool({
    name: 'build_log', arguments: { environment: 'x', id: 1, maxEntries: 2, tail: true },
  }))
  assert.equal(tail.returned, 2)
  assert.equal(tail.tail, true)
  assert.match(tail.log, /line-4/)
  assert.match(tail.log, /line-5/)
  assert.doesNotMatch(tail.log, /line-1\n/)
  await client.close()
})

test('build_log reports a partial stream as truncated instead of throwing', async (t) => {
  const full = entryFrame('2026-10-09T08:24:44.100+00:00', 'cut off mid-frame')
  const bytes = Buffer.concat([statusFrame('RUNNING'), entryFrame('2026-10-09T08:24:42.685+00:00', 'ok'), full.subarray(0, 6)])
  installFetch(() => binaryResponse(bytes), t)

  const client = await buildLinkedClient()
  const payload = payloadOf(await client.callTool({ name: 'build_log', arguments: { environment: 'x', id: 9 } }))
  assert.equal(payload.status, 'RUNNING')
  assert.equal(payload.entryCount, 1)
  assert.equal(payload.truncated, true)
  await client.close()
})

test('build_log is registered with the environment routing param', async () => {
  const client = await buildLinkedClient()
  const tool = (await client.listTools()).tools.find((x) => x.name === 'build_log')
  assert.ok(tool, 'build_log must be listed')
  assert.ok(tool.inputSchema.properties.environment, 'connection-backed tool needs environment')
  assert.ok(tool.inputSchema.properties.id)
  await client.close()
})
