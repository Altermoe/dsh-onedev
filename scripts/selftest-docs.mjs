#!/usr/bin/env node
/**
 * Live self-test for the docs-query capability.
 *
 * Boots the built dsh-onedev-mcp server over stdio WITHOUT any OneDev
 * credentials (no ONEDEV_URL / ONEDEV_TOKEN and no credential store) and
 * answers this question using only the onedev_docs_* tools:
 *
 *   “如何完整配置一个项目的 CI&CD，并且利用 onedev 的密钥系统写入敏感信息？”
 *   (How to fully configure CI&CD for a project, and use OneDev's secret
 *    system to store sensitive information?)
 *
 * Verifies that:
 *   1. the server lists 60 tools incl. the docs + environment tools;
 *   2. the docs tools work without a configured OneDev connection;
 *   3. search surfaces the CI/CD and job-secrets documentation;
 *   4. reading those pages yields actionable content.
 *
 * Needs network access to https://docs.onedev.io/. Run: node scripts/selftest-docs.mjs
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const bin = join(here, '..', 'bin', 'dsh-onedev-mcp.mjs')

function assert(cond, msg) {
  if (!cond) throw new Error(`SELFTEST FAIL: ${msg}`)
}

/** Call one tool and return its parsed JSON payload (asserts no isError). */
async function call(client, name, args) {
  const res = await client.callTool({ name, arguments: args })
  assert(!res.isError, `${name} returned isError: ${JSON.stringify(res.content)}`)
  const text = res.content.map((c) => c.text).join('')
  return JSON.parse(text)
}

async function main() {
  // Deliberately no ONEDEV_* credentials: docs tools must work standalone.
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [bin],
    env: { ...process.env, ONEDEV_URL: '', ONEDEV_TOKEN: '', ONEDEV_MCP_TRANSPORT: 'stdio' },
    stderr: 'inherit',
  })
  const client = new Client({ name: 'dsh-docs-selftest', version: '0.0.0' })
  await client.connect(transport)

  // 1. tools/list — all docs tools registered, docs tools present.
  const listed = await client.listTools()
  const names = listed.tools.map((t) => t.name)
  console.log(`[1] tools/list → ${names.length} tools`)
  assert(names.length === 60, `expected 60 tools, got ${names.length}`)
  for (const t of ['onedev_docs_search', 'onedev_docs_read', 'onedev_docs_list']) {
    assert(names.includes(t), `missing ${t}`)
  }

  // 2. Search with the Chinese question verbatim — must not crash; the tool
  //    explains that the docs are in English when nothing matches.
  const zh = await call(client, 'onedev_docs_search', { query: '如何完整配置一个项目的 CI&CD，并且利用 onedev 的密钥系统写入敏感信息', limit: 5 })
  console.log(`[2] 中文原句检索 → matched=${zh.matched}${zh.hint ? ' (hint: docs are in English)' : ''}`)

  // 3. English keyword searches for the two halves of the question.
  const cicd = await call(client, 'onedev_docs_search', { query: 'configure CI/CD project build spec pipeline', limit: 6 })
  const cicdPaths = cicd.results.map((r) => r.path)
  console.log(`[3a] CI/CD 检索 → ${cicdPaths.join(' | ')}`)
  assert(cicdPaths.some((p) => p.includes('cicd') || p.includes('concepts')), 'expected CI/CD pages in search results')

  const secrets = await call(client, 'onedev_docs_search', { query: 'job secrets sensitive information', limit: 6 })
  const secretsPaths = secrets.results.map((r) => r.path)
  console.log(`[3b] 密钥检索 → ${secretsPaths.join(' | ')}`)
  assert(secretsPaths.includes('/tutorials/cicd/job-secrets'), 'job-secrets tutorial must rank for secrets query')

  // 4. Category listing narrows to CI/CD tutorials.
  const list = await call(client, 'onedev_docs_list', { category: 'tutorials/cicd', limit: 50 })
  console.log(`[4] tutorials/cicd 类目 → ${list.filtered}/${list.total} 页`)
  assert(list.pages.some((p) => p.path === '/tutorials/cicd/job-secrets'))
  assert(list.pages.some((p) => p.path === '/tutorials/cicd/understanding-pipeline'))

  // 5. Read the two key pages and confirm actionable content.
  const secretsPage = await call(client, 'onedev_docs_read', { page: '/tutorials/cicd/job-secrets' })
  console.log(`[5a] 读取 ${secretsPage.path} → “${secretsPage.title}” (${secretsPage.content.length} chars)`)
  assert(/secret/i.test(secretsPage.content), 'secrets page must talk about secrets')
  const pipelinePage = await call(client, 'onedev_docs_read', { page: '/tutorials/cicd/understanding-pipeline' })
  console.log(`[5b] 读取 ${pipelinePage.path} → “${pipelinePage.title}” (${pipelinePage.content.length} chars)`)
  assert(/pipeline/i.test(pipelinePage.content), 'pipeline page must talk about pipelines')

  await client.close()

  console.log('\n=== self-test answer material (assembled from the docs tools) ===')
  console.log('CI/CD configuration pages  : ' + cicdPaths.slice(0, 4).map((p) => `https://docs.onedev.io${p}`).join(', '))
  console.log('Secrets pages              : ' + secretsPaths.slice(0, 3).map((p) => `https://docs.onedev.io${p}`).join(', '))
  console.log('Job secrets tutorial says  : ' + secretsPage.content.replace(/\s+/g, ' ').slice(0, 300) + '…')
  console.log('\nSELFTEST OK: docs-query capability answers the CI/CD + secrets question without a configured OneDev connection.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
