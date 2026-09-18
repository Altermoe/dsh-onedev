/**
 * Host-half smoke test for the dsh-onedev cordis plugin (`lib/index.js`).
 *
 * Boots `apply` against a minimal mock cordis context (recording webServer
 * routes), then drives the config/probe handlers directly with fake HTTP
 * request/response pairs — verifying the loopback guard, the multi-environment
 * GET/save/delete/set-primary/clear flow against a real temporary credential
 * store, and the probe endpoint's per-environment input handling (including its
 * fallback to the stored credentials for blank fields, against a local mock
 * OneDev server). No external network is touched.
 */
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync, statSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { name, apply, inject } = await import('../lib/index.js')

// ---- minimal cordis stand-in ---------------------------------------------
function boot(configFile) {
  const registered = []
  const ctx = {
    effect(fn) { const dispose = fn() ?? (() => {}); return typeof dispose === 'function' ? dispose : () => {} },
    webServer: {
      register(route) {
        registered.push(route)
        return () => {}
      },
    },
  }
  apply(ctx, { configFile })
  return {
    routes: Object.fromEntries(registered.map((r) => [r.path, r.handler])),
  }
}

function makeRes() {
  const res = { statusCode: 200, headers: {}, body: '', end(chunk) { this.body = String(chunk ?? '') }, setHeader(k, v) { this.headers[k] = v } }
  return res
}

function req(method, { origin, address = '127.0.0.1' } = {}) {
  return {
    method,
    socket: { remoteAddress: address },
    headers: origin ? { host: 'localhost:3080', origin } : { host: 'localhost:3080' },
    [Symbol.asyncIterator]: async function* () {},
  }
}

function postBody(obj) {
  const chunk = Buffer.from(JSON.stringify(obj))
  return {
    method: 'POST',
    socket: { remoteAddress: '127.0.0.1' },
    headers: { host: 'localhost:3080' },
    [Symbol.asyncIterator]: async function* () { yield chunk },
  }
}

const save = (env) => ({ action: 'save', slug: env.slug, ...env })

// ---- tests ----------------------------------------------------------------
assert.equal(name, 'dsh-onedev')
assert.deepEqual(inject, ['webServer'])

const dir = mkdtempSync(join(tmpdir(), 'dsh-onedev-host-'))
const configFile = join(dir, 'config.json')
try {
  const { routes } = boot(configFile)
  assert.ok(routes['/api/onedev/config'], 'config route mounted')
  assert.ok(routes['/api/onedev/probe'], 'probe route mounted')

  // GET returns an empty environment list when no store exists yet.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](req('GET'), res)
    const body = JSON.parse(res.body)
    assert.equal(body.ok, true)
    assert.equal(body.primary, '')
    assert.deepEqual(body.envs, [])
  }

  // Non-loopback caller is rejected.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](req('GET', { address: '10.0.0.5' }), res)
    assert.equal(res.statusCode, 403)
  }

  // Save persists a new environment to the store file (0600).
  {
    const res = makeRes()
    await routes['/api/onedev/config'](
      postBody(save({ slug: 'prod', onedevUrl: 'http://localhost:6610', authType: 'password', username: 'root', password: 's3cret', readonly: true, apiTimeoutMs: 5000, apiBase: '/~api', remark: 'production' })),
      res,
    )
    const body = JSON.parse(res.body)
    assert.equal(body.ok, true)
    assert.equal(body.saved.slug, 'prod')
    assert.equal(body.saved.username, 'root')
    assert.equal(body.saved.passwordSet, true)
    assert.equal(body.saved.remark, 'production')
    assert.equal(body.primary, 'prod') // first environment becomes primary
    const stored = JSON.parse(readFileSync(configFile, 'utf8'))
    assert.equal(stored.environments.prod.password, 's3cret')
    assert.equal(stored.environments.prod.readonly, true)
    assert.equal(stored.environments.prod.apiBase, '/~api')
    assert.equal(stored.primary, 'prod')
    const mode = `0${(statSync(configFile).mode & 0o777).toString(8)}`
    assert.equal(mode, '0600')
  }

  // A second environment is appended; the first stays primary.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](
      postBody(save({ slug: 'staging', onedevUrl: 'http://staging:6610', authType: 'token', onedevToken: 'tok-9' })),
      res,
    )
    const body = JSON.parse(res.body)
    assert.equal(body.primary, 'prod')
    assert.deepEqual(body.envs.map((e) => e.slug).sort(), ['prod', 'staging'])

    const get = makeRes()
    await routes['/api/onedev/config'](req('GET'), get)
    const listed = JSON.parse(get.body)
    assert.equal(listed.primary, 'prod')
    assert.equal(listed.envs.find((e) => e.slug === 'staging').tokenSet, true)
  }

  // Blank password on a later save preserves the stored secret.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](
      postBody(save({ slug: 'prod', onedevUrl: 'http://localhost:6610', authType: 'password', username: 'root', password: '' })),
      res,
    )
    const stored = JSON.parse(readFileSync(configFile, 'utf8'))
    assert.equal(stored.environments.prod.password, 's3cret')
  }

  // A brand-new environment cannot be saved without a credential.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](
      postBody({ action: 'save', slug: 'nope', onedevUrl: 'http://nope:6610', authType: 'password', username: 'root', password: '' }),
      res,
    )
    assert.equal(res.statusCode, 400)
  }

  // Bad URL is rejected on save.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](postBody({ action: 'save', slug: 'x', onedevUrl: 'not-a-url', authType: 'password', username: 'u', password: 'p' }), res)
    assert.equal(res.statusCode, 400)
  }

  // setPrimary promotes an existing environment.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](postBody({ action: 'setPrimary', slug: 'staging' }), res)
    const body = JSON.parse(res.body)
    assert.equal(body.primary, 'staging')
    assert.equal(JSON.parse(readFileSync(configFile, 'utf8')).primary, 'staging')
  }

  // delete removes an environment; primary is reassigned.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](postBody({ action: 'delete', slug: 'staging' }), res)
    const body = JSON.parse(res.body)
    assert.equal(body.removed, true)
    assert.equal(body.primary, 'prod')
    assert.deepEqual(body.envs.map((e) => e.slug), ['prod'])
  }

  // Clear removes the store.
  {
    const res = makeRes()
    await routes['/api/onedev/config'](postBody({ clear: true }), res)
    assert.equal(JSON.parse(res.body).cleared, true)
  }

  // Probe rejects a missing URL (empty store — nothing to fall back to).
  {
    const res = makeRes()
    await routes['/api/onedev/probe'](postBody({ authType: 'password', username: 'root', password: 'x' }), res)
    assert.equal(res.statusCode, 400)
    assert.equal(res.body.includes('OneDev server URL is required'), true)
  }

  // Probe falls back to the targeted environment's stored credentials for
  // blank fields (the reopened settings page never receives secrets back, so
  // "Test connection" must work without retyping them). A local mock OneDev
  // captures the Authorization header the probe actually sends.
  const authHeaders = []
  const mock = createServer((mreq, mres) => {
    authHeaders.push(mreq.headers.authorization)
    mres.statusCode = mreq.headers.authorization ? 200 : 401
    mres.end('{}')
  })
  await new Promise((resolve) => mock.listen(0, '127.0.0.1', resolve))
  const mockUrl = `http://127.0.0.1:${mock.address().port}`
  try {
    // Save a password-auth environment (as the GUI does), plus a token one.
    {
      const res = makeRes()
      await routes['/api/onedev/config'](
        postBody(save({ slug: 'prod', onedevUrl: mockUrl, authType: 'password', username: 'root', password: 's3cret' })),
        res,
      )
      assert.equal(JSON.parse(res.body).ok, true)
      await routes['/api/onedev/config'](
        postBody(save({ slug: 'tokenv', onedevUrl: mockUrl, authType: 'token', onedevToken: 'tok-123' })),
        makeRes(),
      )
      assert.equal(JSON.parse(readFileSync(configFile, 'utf8')).primary, 'prod')
    }

    // Probe with every credential field blank, targeting `prod`: URL/username/
    // password come from the store and the stored password reaches OneDev.
    {
      const res = makeRes()
      await routes['/api/onedev/probe'](
        postBody({ env: 'prod', authType: 'password', username: '', password: '' }),
        res,
      )
      const body = JSON.parse(res.body)
      assert.equal(res.statusCode, 200)
      assert.equal(body.ok, true)
      assert.deepEqual(body.usedStored.sort(), ['onedevUrl', 'password', 'username'])
      const expected = `Basic ${Buffer.from('root:s3cret', 'utf8').toString('base64')}`
      assert.deepEqual(authHeaders.filter(Boolean).slice(-1), [expected])
    }

    // An explicitly submitted secret overrides the stored one.
    {
      const res = makeRes()
      await routes['/api/onedev/probe'](
        postBody({ env: 'prod', onedevUrl: mockUrl, authType: 'password', username: 'root', password: 'wrong' }),
        res,
      )
      assert.equal(JSON.parse(res.body).usedStored.includes('password'), false)
      const expected = `Basic ${Buffer.from('root:wrong', 'utf8').toString('base64')}`
      assert.deepEqual(authHeaders.filter(Boolean).at(-1), expected)
    }

    // Token auth: a blank token field targets the right env (tokenv) and falls
    // back to its stored token.
    {
      const probeRes = makeRes()
      await routes['/api/onedev/probe'](postBody({ env: 'tokenv', authType: 'token', onedevToken: '' }), probeRes)
      const body = JSON.parse(probeRes.body)
      assert.equal(probeRes.statusCode, 200)
      assert.equal(body.ok, true)
      assert.equal(body.usedStored.includes('onedevToken'), true)
      assert.deepEqual(authHeaders.filter(Boolean).at(-1), 'Bearer tok-123')
    }
  } finally {
    mock.close()
  }

  console.log('plugin host smoke: OK (multi-env list/save/primary/delete/clear, loopback guard, per-env probe fallback)')
} finally {
  rmSync(dir, { recursive: true, force: true })
}