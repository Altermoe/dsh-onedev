/**
 * Unit tests for config parsing and the OneDev client (URL building, auth
 * header, read-only gate). No network required.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { loadConfig } from '../dist/config.js'
import { OneDevClient } from '../dist/client.js'
import { loadEnvironmentStore, saveEnvironment, clearStoredConfig } from '../dist/storage.js'
import { buildAuthHeader } from '../dist/auth.js'

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-onedev-test-'))
  const file = join(dir, 'config.json')
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('loadConfig reads defaults and trims trailing slash', () => {
  const cfg = loadConfig({ ONEDEV_URL: 'https://onedev.internal:6610/', ONEDEV_TOKEN: 'tok' })
  assert.equal(cfg.onedevUrl, 'https://onedev.internal:6610')
  assert.equal(cfg.transport, 'stdio')
  assert.equal(cfg.readonly, false)
})

test('loadConfig supports streamable-http transport + readonly', () => {
  const cfg = loadConfig({
    ONEDEV_URL: 'http://x', ONEDEV_TOKEN: 't',
    ONEDEV_MCP_TRANSPORT: 'streamable-http', ONEDEV_MCP_PORT: '9000',
    ONEDEV_MCP_READONLY: 'true',
  })
  assert.equal(cfg.transport, 'streamable-http')
  assert.equal(cfg.httpPort, 9000)
  assert.equal(cfg.readonly, true)
})

test('loadConfig rejects missing url/token', () => {
  assert.throws(() => loadConfig({}), /ONEDEV_URL/)
})

test('client builds API base from env and strips query empties', async (t) => {
  const cfg = loadConfig({ ONEDEV_URL: 'http://onedev:6610', ONEDEV_TOKEN: 'secret' })
  const client = new OneDevClient(cfg)
  // Monkey-patch fetch to capture the request under test.
  let captured
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), headers: init.headers }
    return { ok: true, status: 200, text: async () => '{}' } // minimal Response shape used by client
  }
  t.after(() => { globalThis.fetch = orig })

  await client.get('/users', { term: 'alice', offset: 0, skip: undefined })
  assert.ok(captured.url.includes('http://onedev:6610/~api/users'))
  assert.ok(captured.url.includes('term=alice'))
  assert.ok(!captured.url.includes('skip'))
  assert.equal(captured.headers.Authorization, 'Bearer secret')
})

test('client refuses mutations in read-only mode', async () => {
  const cfg = loadConfig({
    ONEDEV_URL: 'http://x', ONEDEV_TOKEN: 't', ONEDEV_MCP_READONLY: 'true',
  })
  const client = new OneDevClient(cfg)
  await assert.rejects(client.post('/users', { name: 'x' }), /read-only/)
})

// ---- password auth mode + credential store ----

test('loadConfig supports password (Basic) auth mode', () => {
  const cfg = loadConfig({
    ONEDEV_URL: 'https://onedev:6610', ONEDEV_AUTH_TYPE: 'password',
    ONEDEV_USERNAME: 'admin', ONEDEV_PASSWORD: 's3cret',
  })
  assert.equal(cfg.authType, 'password')
  assert.equal(cfg.username, 'admin')
  assert.equal(cfg.password, 's3cret')
  assert.equal(cfg.onedevToken, '')
})

test('loadConfig token mode requires a token', () => {
  assert.throws(() => loadConfig({ ONEDEV_URL: 'http://x' }), /ONEDEV_TOKEN/)
})

test('loadConfig password mode requires username/password', () => {
  const env = { ONEDEV_URL: 'http://x', ONEDEV_AUTH_TYPE: 'password', ONEDEV_USERNAME: 'a' }
  assert.throws(() => loadConfig({ ...env }), /ONEDEV_PASSWORD/)
  assert.throws(() => loadConfig({ ...env, ONEDEV_PASSWORD: 'p', ONEDEV_USERNAME: '' }), /ONEDEV_USERNAME/)
})

test('buildAuthHeader produces Base64 Basic for password and Bearer for token', () => {
  assert.equal(
    buildAuthHeader({ onedevUrl: 'http://x', authType: 'password', username: 'u', password: 'p' }),
    `Basic ${Buffer.from('u:p', 'utf8').toString('base64')}`,
  )
  assert.equal(
    buildAuthHeader({ onedevUrl: 'http://x', authType: 'token', onedevToken: 'tok' }),
    'Bearer tok',
  )
  assert.throws(() => buildAuthHeader({ onedevUrl: 'http://x', authType: 'password', username: 'u', password: '' }), /password auth requires/)
})

test('client sends Basic Authorization header for password auth', async (t) => {
  const cfg = loadConfig({
    ONEDEV_URL: 'http://onedev:6610', ONEDEV_AUTH_TYPE: 'password',
    ONEDEV_USERNAME: 'admin', ONEDEV_PASSWORD: 'pw',
  })
  const client = new OneDevClient(cfg)
  let captured
  const orig = globalThis.fetch
  globalThis.fetch = async (url, init) => {
    captured = { url: String(url), headers: init.headers }
    return { ok: true, status: 200, text: async () => '{}' }
  }
  t.after(() => { globalThis.fetch = orig })
  await client.get('/users', {})
  assert.equal(
    captured.headers.Authorization,
    `Basic ${Buffer.from('admin:pw', 'utf8').toString('base64')}`,
  )
})

test('credential store save/load/clear round-trip (multi-environment)', () => {
  const s = tempStore()
  try {
    assert.equal(loadEnvironmentStore(s.file), null)
    saveEnvironment(s.file, 'prod', {
      onedevUrl: 'http://localhost:6610', authType: 'password',
      username: 'admin', password: 'pw', remark: 'prod server',
    })
    const store = loadEnvironmentStore(s.file)
    assert.equal(store.primary, 'prod') // first environment becomes primary
    assert.equal(store.environments.prod.authType, 'password')
    assert.equal(store.environments.prod.username, 'admin')
    assert.equal(store.environments.prod.password, 'pw')
    assert.equal(store.environments.prod.remark, 'prod server')
    assert.equal(store.environments.prod.onedevUrl, 'http://localhost:6610')
    assert.ok(existsSync(s.file))
    // password mode should not save an empty token
    saveEnvironment(s.file, 'prod', { onedevToken: '' })
    const read2 = loadEnvironmentStore(s.file)
    assert.equal(read2.environments.prod.onedevToken, undefined)
    // a second environment round-trips alongside the first
    saveEnvironment(s.file, 'staging', { onedevUrl: 'http://staging:6610', authType: 'token', onedevToken: 'tok' })
    const read3 = loadEnvironmentStore(s.file)
    assert.deepEqual(Object.keys(read3.environments).sort(), ['prod', 'staging'])
    assert.equal(clearStoredConfig(s.file), true)
    assert.equal(clearStoredConfig(s.file), false)
  } finally {
    s.cleanup()
  }
})

test('loadConfig falls back to stored credentials when env lacks them', () => {
  const s = tempStore()
  try {
    saveEnvironment(s.file, 'default', {
      onedevUrl: 'https://stored.example:6610', authType: 'password',
      username: 'alice', password: 'secret',
    })
    // No HOME / XDG in the passed env, but ONEDEV_CONFIG_FILE pins the store.
    const cfg = loadConfig({ ONEDEV_CONFIG_FILE: s.file })
    assert.equal(cfg.onedevUrl, 'https://stored.example:6610')
    assert.equal(cfg.authType, 'password')
    assert.equal(cfg.username, 'alice')
    assert.equal(cfg.password, 'secret')
    assert.equal(cfg.configFile, s.file)
  } finally {
    s.cleanup()
  }
})

test('env credentials override the (primary) credential store; a named env isolates', () => {
  const s = tempStore()
  try {
    saveEnvironment(s.file, 'primary', { onedevUrl: 'https://stored.example', authType: 'token', onedevToken: 'stored-tok' })
    // The first saved environment is primary → env vars override it.
    const cfg = loadConfig({
      ONEDEV_CONFIG_FILE: s.file,
      ONEDEV_URL: 'https://env.example',
      ONEDEV_AUTH_TYPE: 'token',
      ONEDEV_TOKEN: 'env-tok',
    })
    assert.equal(cfg.onedevUrl, 'https://env.example')
    assert.equal(cfg.onedevToken, 'env-tok')
    // A non-primary environment ignores env overrides and uses only its own store values.
    saveEnvironment(s.file, 'isolated', { onedevUrl: 'https://iso.example', authType: 'token', onedevToken: 'iso-tok' })
    const iso = loadConfig(
      { ONEDEV_CONFIG_FILE: s.file, ONEDEV_URL: 'https://env.example', ONEDEV_TOKEN: 'env-tok' },
      'isolated',
    )
    assert.equal(iso.onedevUrl, 'https://iso.example')
    assert.equal(iso.onedevToken, 'iso-tok')
  } finally {
    s.cleanup()
  }
})