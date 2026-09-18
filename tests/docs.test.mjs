/**
 * Unit tests for the OneDev documentation tools (docs query capability).
 *
 * All network traffic is mocked: `ONEDEV_DOCS_URL` points at a fake base and
 * `globalThis.fetch` is replaced with an in-memory docs site, so these tests
 * run offline. The docs tools are *standalone* — they are invoked with a null
 * OneDev client, proving they need no configured connection.
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { docsTools, clearDocsCache } from '../dist/tools/docs.js'

const BASE = 'http://docs.test'

function byName(name) {
  const def = docsTools.find((t) => t.name === name)
  assert.ok(def, `tool ${name} must exist`)
  assert.equal(def.standalone, true, `${name} must be standalone (no OneDev connection needed)`)
  return def
}

// ---- fixtures -------------------------------------------------------------

function pageHtml(title, articleInner) {
  return `<!doctype html><html><head><title>${title} | OneDev Documentation</title></head>` +
    `<body><nav>site chrome must not appear</nav><article><nav>Tutorials CI/CD</nav>${articleInner}</article></body></html>`
}

const JOB_SECRETS_HTML = pageHtml('Use Job Secrets', `
<h1>Use Job Secrets</h1>
<p>This tutorial explains how to use job secrets to avoid exposing secret information in your build spec file.</p>
<p>Define a secret say <code>access-token</code> in project settings, and reference it in build spec.</p>
<pre><code class="language-yaml">- step: push image
  useSecret: access-token</code></pre>
<p>See <a href="/tutorials/cicd/understanding-pipeline">Understanding Pipeline</a> and <a href="https://example.com/ext">external</a>.</p>
<img src="/img/secret.png" alt="Define a secret">
`)

const PIPELINE_HTML = pageHtml('Understanding Pipeline', `
<h1>Understanding Pipeline</h1>
<p>A pipeline is an execution of job dependency graph for CI/CD.</p>
`)

const JOB_VARIABLES_HTML = pageHtml('Job Variables', `
<h1>Job Variables</h1>
<p>Variables can be used in the build spec; secrets are a special kind of job variable for sensitive values.</p>
`)

const HOME_HTML = pageHtml('OneDev Documentation', `
<h1>OneDev Documentation</h1>
<p>DevOps platform with CI/CD, issue tracking and packages.</p>
`)

const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
<url><loc>${BASE}/search</loc></url>
<url><loc>${BASE}/tutorials/cicd/job-secrets</loc></url>
<url><loc>${BASE}/tutorials/cicd/understanding-pipeline</loc></url>
<url><loc>${BASE}/appendix/job-variables</loc></url>
<url><loc>${BASE}/</loc></url>
</urlset>`

/** Install a fake docs site; returns the mock so tests can assert on calls. */
function mockDocsSite(overrides = {}) {
  const pages = {
    '/sitemap.xml': SITEMAP_XML,
    '/': HOME_HTML,
    '/tutorials/cicd/job-secrets': JOB_SECRETS_HTML,
    '/tutorials/cicd/understanding-pipeline': PIPELINE_HTML,
    '/appendix/job-variables': JOB_VARIABLES_HTML,
    ...overrides,
  }
  const calls = []
  const impl = async (url) => {
    calls.push(String(url))
    const path = new URL(url).pathname
    const body = pages[path]
    if (body === undefined) return { ok: false, status: 404, text: async () => 'not found' }
    return { ok: true, status: 200, text: async () => body }
  }
  return { calls, impl }
}

/** Swap globalThis.fetch for the mock for the duration of one test. */
function withFetch(t, mock) {
  const orig = globalThis.fetch
  globalThis.fetch = mock
  process.env.ONEDEV_DOCS_URL = BASE
  t.after(() => {
    globalThis.fetch = orig
    delete process.env.ONEDEV_DOCS_URL
  })
}

test('docs tools exist and are standalone', () => {
  assert.deepEqual(
    docsTools.map((t) => t.name).sort(),
    ['onedev_docs_list', 'onedev_docs_read', 'onedev_docs_search'],
  )
})

test('search ranks the most relevant page first and builds an index from the sitemap', async (t) => {
  clearDocsCache()
  const mock = mockDocsSite()
  withFetch(t, mock.impl)
  const search = byName('onedev_docs_search')

  const res = await search.run(null, { query: 'job secrets', limit: 5 })
  // sitemap + 4 sitemap pages fetched (the /search SPA shell is excluded)
  assert.equal(mock.calls.length, 5, `expected 5 fetches, got ${mock.calls.length}: ${mock.calls.join(', ')}`)
  assert.equal(res.matched > 0, true)
  assert.equal(res.results[0].path, '/tutorials/cicd/job-secrets')
  assert.equal(res.results[0].url, `${BASE}/tutorials/cicd/job-secrets`)
  assert.match(res.results[0].snippet, /secret/i)
  const paths = res.results.map((r) => r.path)
  assert.ok(paths.includes('/appendix/job-variables'), 'job-variables page should match "job"')

  // Second search is served entirely from cache — no additional fetches.
  const before = mock.calls.length
  await search.run(null, { query: 'pipeline ci/cd' })
  assert.equal(mock.calls.length, before, 'cache must avoid refetching')
})

test('search returns zero results for unknown terms and hints for non-English queries', async (t) => {
  clearDocsCache()
  const mock = mockDocsSite()
  withFetch(t, mock.impl)
  const search = byName('onedev_docs_search')

  const none = await search.run(null, { query: 'kubernetes quantum flux capacitor' })
  assert.equal(none.matched, 0)
  assert.equal(none.results.length, 0)

  const cjk = await search.run(null, { query: '密钥系统' })
  assert.equal(cjk.matched, 0)
  assert.match(cjk.hint, /English/)
})

test('search refresh bypasses the cache', async (t) => {
  clearDocsCache()
  const mock = mockDocsSite()
  withFetch(t, mock.impl)
  const search = byName('onedev_docs_search')

  await search.run(null, { query: 'secrets' })
  const before = mock.calls.length
  await search.run(null, { query: 'secrets', refresh: true })
  assert.ok(mock.calls.length > before, 'refresh must refetch the index')
})

test('read converts a page to readable text with headings, code, links and related pages', async (t) => {
  clearDocsCache()
  const mock = mockDocsSite()
  withFetch(t, mock.impl)
  const read = byName('onedev_docs_read')

  const res = await read.run(null, { page: '/tutorials/cicd/job-secrets' })
  assert.equal(res.title, 'Use Job Secrets')
  assert.equal(res.path, '/tutorials/cicd/job-secrets')
  assert.equal(res.inSitemap, true)
  assert.match(res.content, /# Use Job Secrets/)
  assert.match(res.content, /useSecret: access-token/, 'code block content must be preserved')
  assert.match(res.content, /```/, 'code blocks must render fenced')
  assert.match(res.content, /\[Understanding Pipeline\]\(http:\/\/docs\.test\/tutorials\/cicd\/understanding-pipeline\)/)
  assert.match(res.content, /!\[Define a secret\]\(http:\/\/docs\.test\/img\/secret\.png\)/)
  assert.doesNotMatch(res.content, /site chrome must not appear/)
  assert.deepEqual(res.related, ['/tutorials/cicd/understanding-pipeline'])

  // A second read of the same page hits the cache.
  const before = mock.calls.length
  await read.run(null, { page: '/tutorials/cicd/job-secrets' })
  assert.equal(mock.calls.length, before)
})

test('read accepts bare paths, full URLs, and rejects foreign hosts', async (t) => {
  clearDocsCache()
  const mock = mockDocsSite()
  withFetch(t, mock.impl)
  const read = byName('onedev_docs_read')

  const viaUrl = await read.run(null, { page: `${BASE}/appendix/job-variables` })
  assert.equal(viaUrl.path, '/appendix/job-variables')
  assert.match(viaUrl.content, /Job Variables/)

  const bare = await read.run(null, { page: 'tutorials/cicd/understanding-pipeline' })
  assert.equal(bare.path, '/tutorials/cicd/understanding-pipeline')

  await assert.rejects(read.run(null, { page: 'http://evil.test/steal' }), /only pages on/)
  await assert.rejects(read.run(null, { page: '/no/such/page' }), /HTTP 404/)
})

test('list serves the sitemap with categories and path filters', async (t) => {
  clearDocsCache()
  const mock = mockDocsSite()
  withFetch(t, mock.impl)
  const list = byName('onedev_docs_list')

  const all = await list.run(null, {})
  // /search excluded → 4 pages total.
  assert.equal(all.total, 4)
  assert.ok(all.categories.some((c) => c.category === 'tutorials' && c.count === 2))
  assert.ok(all.categories.some((c) => c.category === 'appendix' && c.count === 1))
  const secrets = all.pages.find((p) => p.path === '/tutorials/cicd/job-secrets')
  assert.equal(secrets.title, 'Job Secrets') // derived from slug for the cheap list

  const cicd = await list.run(null, { category: 'cicd' })
  assert.deepEqual(cicd.pages.map((p) => p.path).sort(), [
    '/tutorials/cicd/job-secrets',
    '/tutorials/cicd/understanding-pipeline',
  ])
})

test('a SPA-fallback sitemap (no <loc>) fails loudly instead of returning an empty index', async (t) => {
  clearDocsCache()
  const orig = globalThis.fetch
  const origBase = process.env.ONEDEV_DOCS_URL
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => '<!doctype html><html><head><title>Quickstart | OneDev Documentation</title></head><body></body></html>',
  })
  process.env.ONEDEV_DOCS_URL = 'http://spa.test'
  t.after(() => {
    globalThis.fetch = orig
    if (origBase === undefined) delete process.env.ONEDEV_DOCS_URL
    else process.env.ONEDEV_DOCS_URL = origBase
    clearDocsCache()
  })
  const search = byName('onedev_docs_search')
  await assert.rejects(search.run(null, { query: 'secrets' }), /sitemap/)
})
