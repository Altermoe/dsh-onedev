/**
 * Regression tests for the dsh-onedev MCP error-reporting fixes:
 *
 *  1. The `environment` routing param must NOT leak into request bodies — it is
 *     stripped once, centrally, so create/update tools never send it to OneDev
 *     (which rejected it with `HTTP 400: Unrecognized field "environment"`).
 *  2. `access_tokens_list` (an endpoint OneDev does not expose) is removed.
 *  3. List tools forward the strict OneDev criteria in `query` and give a
 *     constructive hint instead of a bare `HTTP 406: Invalid query`; blank
 *     query values are dropped.
 *  4. `server_version` degrades gracefully on instances without /server/version.
 *  5. `user_set_password` POSTs the password as raw request text, not a
 *     JSON-encoded string (OneDev reads the raw body as the value), so the
 *     stored password is not accidentally wrapped in quotes.
 *
 * Runs fully in-process over an in-memory MCP transport with a mocked fetch —
 * no network, no side effects.
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

/** Collect every outbound HTTP request (method, url, body) via a mocked fetch. */
function installMockFetch(handler, t) {
  const calls = []
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    const rec = {
      method: (init.method || 'GET').toUpperCase(),
      url: String(url),
      body: typeof init.body === 'string' ? JSON.parse(init.body) : undefined,
    }
    calls.push(rec)
    return handler(rec)
  }
  t.after(() => { globalThis.fetch = orig })
  return calls
}

async function buildLinkedClient(provider = okProvider()) {
  const server = buildServer(provider)
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
  const client = new Client({ name: 'dsh-regression', version: '0.0.0' })
  await Promise.all([
    server.connect(serverTransport),
    client.connect(clientTransport),
  ])
  return client
}

function ok200(json) {
  return { ok: true, status: 200, text: async () => JSON.stringify(json) }
}
function errorRes(status, message) {
  return { ok: false, status, text: async () => JSON.stringify({ message }) }
}

test('environment param is stripped from create-tool request bodies', async (t) => {
  const calls = installMockFetch((rec) => {
    if (rec.method === 'POST') return ok200(5)
    return ok200(null)
  }, t)
  const client = await buildLinkedClient()

  // access_token_create forwards its whole args object as the body — the leak.
  await client.callTool({ name: 'access_token_create', arguments: {
    environment: 'nahida', name: 'ci', permissions: ['manage:builds'], users: [1],
  } })
  const tokCall = calls.at(-1)
  assert.equal(tokCall.method, 'POST')
  assert.ok(tokCall.url.endsWith('/~api/access-tokens'), tokCall.url)
  assert.equal(tokCall.body.environment, undefined, 'environment leaked into token body')
  assert.equal(tokCall.body.name, 'ci')
  assert.deepEqual(tokCall.body.permissions, ['manage:builds'])

  // project_create spreads its args into the body.
  await client.callTool({ name: 'project_create', arguments: {
    environment: 'localhost', name: 'demo', key: 'demo',
  } })
  const projCall = calls.at(-1)
  assert.equal(projCall.method, 'POST')
  assert.ok(projCall.url.endsWith('/~api/projects'), projCall.url)
  assert.equal(projCall.body.environment, undefined, 'environment leaked into project body')
  assert.equal(projCall.body.name, 'demo')
  assert.equal(projCall.body.key, 'demo')

  // role_create forwards its whole args object as the body — the leak.
  await client.callTool({ name: 'role_create', arguments: {
    environment: 'prod', name: 'auditor', assignable: true,
  } })
  const roleCall = calls.at(-1)
  assert.equal(roleCall.method, 'POST')
  assert.ok(roleCall.url.endsWith('/~api/roles'), roleCall.url)
  assert.equal(roleCall.body.environment, undefined, 'environment leaked into role body')
  assert.equal(roleCall.body.name, 'auditor')

  await client.close()
})

test('project_update strips environment too', async (t) => {
  const calls = installMockFetch((rec) => (rec.method === 'POST' ? ok200(null) : ok200(7)), t)
  const client = await buildLinkedClient()
  await client.callTool({ name: 'project_update', arguments: {
    environment: 'prod', id: 7, name: 'renamed',
  } })
  const up = calls.at(-1)
  assert.ok(up.url.endsWith('/~api/projects/7'), up.url)
  assert.equal(up.body.environment, undefined)
  assert.equal(up.body.id, undefined) // id is routed in the path, not the body
  assert.equal(up.body.name, 'renamed')
  assert.deepEqual(up.body.gitPackConfig, {})
  await client.close()
})

test('tools/list no longer exposes the unbacked access_tokens_list tool', async (t) => {
  const client = await buildLinkedClient()
  const names = (await client.listTools()).tools.map((x) => x.name)
  assert.ok(!names.includes('access_tokens_list'), 'access_tokens_list should be removed')
  assert.ok(names.includes('user_access_tokens'), 'user_access_tokens still present')
  assert.ok(names.includes('access_token_create'))
  assert.ok(names.includes('access_token_delete'))
  await client.close()
})

test('builds_list: blank query is dropped; valid fields still forwarded', async (t) => {
  const calls = installMockFetch((rec) => ok200([]), t)
  const client = await buildLinkedClient()
  await client.callTool({ name: 'builds_list', arguments: { environment: 'x', query: '   ' } })
  const c1 = calls.at(-1)
  assert.ok(!/[?&]query=/.test(c1.url), 'blank query must be omitted: ' + c1.url)
  assert.ok(c1.url.includes('offset=0'), c1.url)
  assert.ok(c1.url.includes('count=100'), c1.url)

  await client.callTool({ name: 'builds_list', arguments: {
    environment: 'x', query: '"Project" is "my/repo"', count: 20,
  } })
  const c2 = calls.at(-1)
  assert.ok(c2.url.includes('query='), c2.url)
  assert.ok(c2.url.includes('count=20'), c2.url)
  await client.close()
})

test('builds_list: an invalid query yields a constructive hint, not a bare 406', async (t) => {
  installMockFetch(() => errorRes(406, 'Invalid query'), t)
  const client = await buildLinkedClient()
  const res = await client.callTool({
    name: 'builds_list',
    arguments: { environment: 'x', query: 'dsh-server-deploy' },
  })
  assert.equal(res.isError, true)
  const text = res.content.map((c) => c.text).join('\n')
  assert.match(text, /criteria grammar/)
  assert.match(text, /"Project" is/)
  assert.doesNotMatch(text, /^dsh-onedev-mcp error: OneDev API GET \/builds -> HTTP 406: Invalid query$/)
  await client.close()
})

test('user_set_password sends the raw password text, not a JSON-quoted string', async (t) => {
  const calls = []
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ method: (init.method || 'GET').toUpperCase(), url: String(url), rawBody: init.body, headers: init.headers })
    return ok200(null)
  }
  t.after(() => { globalThis.fetch = orig })

  const client = await buildLinkedClient()
  await client.callTool({ name: 'user_set_password', arguments: { environment: 'x', id: '1', password: 'admin123' } })
  const call = calls.at(-1)
  assert.ok(call.url.endsWith('/~api/users/1/password'), call.url)
  // The password must be sent verbatim — no JSON.stringify wrapping in quotes.
  assert.equal(call.rawBody, 'admin123')
  assert.notEqual(call.rawBody, JSON.stringify('admin123'))
  assert.match(call.headers['Content-Type'], /^text\/plain/)
  await client.close()
})

test('server_version degrades gracefully when the instance lacks /server/version', async (t) => {
  installMockFetch(() => errorRes(404, 'HTTP 404 Not Found'), t)
  const client = await buildLinkedClient()
  const res = await client.callTool({ name: 'server_version', arguments: {} })
  assert.notEqual(res.isError, true)
  const text = res.content.map((c) => c.text).join('\n')
  assert.ok(text.includes('does not expose /server/version'), text)
  assert.ok(text.includes('"version": null'), text)
  await client.close()
})

test('server_version returns the version when available', async (t) => {
  installMockFetch(() => ok200('16.6.1'), t)
  const client = await buildLinkedClient()
  const res = await client.callTool({ name: 'server_version', arguments: {} })
  assert.notEqual(res.isError, true)
  assert.match(res.content.map((c) => c.text).join('\n'), /"version": "16\.6\.1"/)
  await client.close()
})