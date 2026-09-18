/**
 * Unit tests for connection probing (auth.ts). The OneDev network is mocked
 * via a scriptable global fetch that returns scenario-specific statuses for
 * the anonymous baseline call and the authenticated call.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { URL as NodeURL } from 'node:url'

import { probeOneDev } from '../dist/auth.js'

/** Install a scriptable fetch; returns the recorded calls. */
function mockFetch(handler) {
  const calls = []
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    const auth = init && init.headers && init.headers.Authorization
    calls.push({ url: String(url), auth: auth ?? null })
    const r = await handler({ url: String(url), auth })
    return {
      ok: r.status >= 200 && r.status < 300,
      status: r.status,
      text: async () => (r.body ?? ''),
    }
  }
  return { calls, restore: () => { globalThis.fetch = orig } }
}

const URL = 'http://onedev:6610'
const PASSWORD = { onedevUrl: URL, authType: 'password', username: 'admin', password: 'pw' }
const TOKEN = { onedevUrl: URL, authType: 'token', onedevToken: 'tok' }

test('probe: credentials accepted (admin) → ok', async () => {
  const m = mockFetch(async (c) => ({ status: c.auth ? 200 : 401, body: c.auth ? '[{"id":1}]' : '' }))
  try {
    const out = await probeOneDev(PASSWORD)
    assert.equal(out.kind, 'ok')
    assert.equal(out.status, 200)
    assert.equal(out.admin, true)
    assert.equal(m.calls.length, 2)
    assert.equal(m.calls[0].auth, null) // anonymous baseline
    assert.match(m.calls[1].auth, /^Basic /)
  } finally { m.restore() }
})

test('probe: accepted but not admin → forbidden (authenticated)', async () => {
  const m = mockFetch(async (c) => ({ status: c.auth ? 403 : 401 }))
  try {
    const out = await probeOneDev(TOKEN)
    assert.equal(out.kind, 'forbidden')
    assert.equal(out.authenticated, true)
    assert.equal(out.message.includes('administrator'), true)
  } finally { m.restore() }
})

test('probe: credentials rejected → unauthorized', async () => {
  const m = mockFetch(async () => ({ status: 401, body: 'unauthorized' }))
  try {
    const out = await probeOneDev(PASSWORD)
    assert.equal(out.kind, 'unauthorized')
    assert.equal(out.status, 401)
  } finally { m.restore() }
})

test('probe: request URL carries the mandatory offset+count params', async () => {
  // Regression: OneDev answers 406 for `/users?count=1` because `offset` is
  // mandatory — the probe must send both params regardless of version.
  const m = mockFetch(async () => ({ status: 200, body: '[]' }))
  try {
    await probeOneDev(TOKEN)
    assert.equal(m.calls.length, 2)
    const u = new NodeURL(m.calls[0].url)
    assert.equal(u.pathname, '/~api/users')
    assert.equal(u.searchParams.get('offset'), '0')
    assert.equal(u.searchParams.get('count'), '1')
  } finally { m.restore() }
})

test('probe: endpoint-contract 406 → error (never misread as bad credentials)', async () => {
  const m = mockFetch(async () => ({ status: 406, body: 'Missing query params: [offset]' }))
  try {
    const out = await probeOneDev(PASSWORD)
    assert.equal(out.kind, 'error')
    assert.equal(out.status, 406)
    assert.match(out.message, /contract mismatch/)
  } finally { m.restore() }
})

test('probe: server unreachable → error', async () => {
  const m = mockFetch(async () => { throw new Error('ECONNREFUSED') })
  try {
    const out = await probeOneDev(PASSWORD)
    assert.equal(out.kind, 'error')
    assert.equal(out.status, 0)
    assert.match(out.message, /cannot reach/)
  } finally { m.restore() }
})

test('probe: missing credentials → error without network', async () => {
  const m = mockFetch(async () => ({ status: 200 }))
  try {
    const out = await probeOneDev({ onedevUrl: URL, authType: 'password', username: 'a', password: '' })
    assert.equal(out.kind, 'error')
    assert.equal(out.status, 400)
  } finally { m.restore() }
})