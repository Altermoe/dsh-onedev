/**
 * Unit tests for the multi-environment store + environment listing.
 * No network required.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  loadEnvironmentStore, saveEnvironment, deleteEnvironment, setPrimary,
  clearStoredConfig, isValidSlug,
} from '../dist/storage.js'
import { listEnvironments } from '../dist/config.js'

function tempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'dsh-onedev-envtest-'))
  const file = join(dir, 'config.json')
  return { dir, file, cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}

test('slug validation', () => {
  assert.equal(isValidSlug('prod'), true)
  assert.equal(isValidSlug('a-b.c_d9'), true)
  assert.equal(isValidSlug(''), false)
  assert.equal(isValidSlug('0abc'), true)
  assert.equal(isValidSlug('-abc'), false)
  assert.equal(isValidSlug('with space'), false)
  assert.equal(isValidSlug('x'.repeat(33)), false)
})

test('deleteEnvironment removes and reassigns primary', () => {
  const s = tempStore()
  try {
    saveEnvironment(s.file, 'a', { onedevUrl: 'http://a:6610', authType: 'token', onedevToken: 't1' })
    saveEnvironment(s.file, 'b', { onedevUrl: 'http://b:6610', authType: 'token', onedevToken: 't2' })
    assert.equal(loadEnvironmentStore(s.file).primary, 'a')
    // Deleting a non-primary env keeps the primary and leaves missing envs false.
    assert.equal(deleteEnvironment(s.file, 'b'), true)
    const afterOne = loadEnvironmentStore(s.file)
    assert.deepEqual(Object.keys(afterOne.environments), ['a'])
    assert.equal(afterOne.primary, 'a')
    // Delete the only remaining env → primary empty.
    assert.equal(deleteEnvironment(s.file, 'a'), true)
    assert.equal(loadEnvironmentStore(s.file).primary, '')
    assert.equal(deleteEnvironment(s.file, 'missing'), false)
  } finally {
    s.cleanup()
  }
})

test('setPrimary validates existence', () => {
  const s = tempStore()
  try {
    saveEnvironment(s.file, 'x', { onedevUrl: 'http://x:6610', authType: 'token', onedevToken: 't' })
    saveEnvironment(s.file, 'y', { onedevUrl: 'http://y:6610', authType: 'token', onedevToken: 't2' })
    assert.equal(setPrimary(s.file, 'y'), true)
    assert.equal(loadEnvironmentStore(s.file).primary, 'y')
    assert.throws(() => setPrimary(s.file, 'nope'), /does not exist/)
  } finally {
    s.cleanup()
  }
})

test('legacy flat-format store is ignored (not migrated) with no crash', () => {
  const s = tempStore()
  try {
    writeFileSync(s.file, JSON.stringify({ onedevUrl: 'http://old:6610', authType: 'token', onedevToken: 'old' }))
    assert.equal(loadEnvironmentStore(s.file), null)
    assert.deepEqual(listEnvironments({ ONEDEV_CONFIG_FILE: s.file }), [])
  } finally {
    s.cleanup()
  }
})

test('listEnvironments filters by slug/remark/url and flags primary/configured', () => {
  const s = tempStore()
  try {
    saveEnvironment(s.file, 'prod', { onedevUrl: 'https://onedev.prod', authType: 'password', username: 'u', password: 'p', remark: 'Production cluster' })
    saveEnvironment(s.file, 'staging', { onedevUrl: 'https://onedev.staging', authType: 'token', onedevToken: 't', remark: 'Preview' })
    const env = { ONEDEV_CONFIG_FILE: s.file }
    const all = listEnvironments(env)
    assert.equal(all.length, 2)
    const prod = all.find((e) => e.slug === 'prod')
    assert.equal(prod.primary, true)
    assert.equal(prod.configured, true)
    assert.equal(prod.remark, 'Production cluster')
    assert.equal(prod.tokenSet, false)
    assert.equal(prod.passwordSet, true)
    assert.equal(prod.password, undefined) // no secrets leaked
    const st = all.find((e) => e.slug === 'staging')
    assert.equal(st.primary, false)
    assert.equal(st.tokenSet, true)
    // Filtering
    assert.deepEqual(listEnvironments(env, 'prod').map((e) => e.slug), ['prod'])
    assert.deepEqual(listEnvironments(env, 'PREVIEW').map((e) => e.slug), ['staging'])
    assert.deepEqual(listEnvironments(env, 'onedev.staging').map((e) => e.slug), ['staging'])
    assert.deepEqual(listEnvironments(env, 'zzz'), [])
  } finally {
    s.cleanup()
  }
})

test('clearStoredConfig removes the store', () => {
  const s = tempStore()
  try {
    saveEnvironment(s.file, 'c', { onedevUrl: 'http://c:6610', authType: 'token', onedevToken: 't' })
    assert.equal(existsSync(s.file), true)
    assert.equal(clearStoredConfig(s.file), true)
    assert.equal(existsSync(s.file), false)
    assert.equal(clearStoredConfig(s.file), false)
  } finally {
    s.cleanup()
  }
})