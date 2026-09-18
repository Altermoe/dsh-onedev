/**
 * OneDev documentation tools — the "docs query" capability.
 *
 * The official OneDev documentation lives at https://docs.onedev.io/ as a
 * statically pre-rendered Docusaurus site:
 *   - `GET /sitemap.xml` returns the complete page list (~140 URLs, no auth).
 *   - Every page is server-rendered HTML whose `<article>` element holds the
 *     actual content (the rest is site chrome).
 *
 * The site exposes no public search API, so these tools build a lightweight
 * full-text index on demand: fetch the sitemap, then fetch pages concurrently
 * (bounded) and cache the extracted text in memory with a TTL. All tools in
 * this module are *standalone* (`standalone: true`): they talk to the docs
 * site directly and need no OneDev connection or credentials — they work even
 * before the plugin is configured.
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'

const DEFAULT_DOCS_BASE = 'https://docs.onedev.io'
const SITEMAP_TTL_MS = 60 * 60 * 1000 // 1 h
const PAGE_TTL_MS = 24 * 60 * 60 * 1000 // 24 h
const FETCH_TIMEOUT_MS = 15_000
const FETCH_CONCURRENCY = 8
const USER_AGENT = 'dsh-onedev-mcp (docs-query tool)'

// ---------------------------------------------------------------------------
// Cache (keyed by docs base URL so an ONEDEV_DOCS_URL override stays separate)
// ---------------------------------------------------------------------------

interface DocPage {
  url: string
  path: string
  title: string
  text: string
  /** Internal doc links found on the page (for navigation between pages). */
  related: string[]
  fetchedAt: number
}

interface DocsCache {
  sitemap: { urls: string[]; fetchedAt: number } | null
  pages: Map<string, DocPage>
}

const caches = new Map<string, DocsCache>()

function docsCacheFor(base: string): DocsCache {
  let cache = caches.get(base)
  if (!cache) {
    cache = { sitemap: null, pages: new Map() }
    caches.set(base, cache)
  }
  return cache
}

/** Drop cached sitemap/pages (all bases, or one). Exported for tests. */
export function clearDocsCache(base?: string): void {
  if (base) caches.delete(base.replace(/\/+$/, ''))
  else caches.clear()
}

// ---------------------------------------------------------------------------
// HTTP plumbing
// ---------------------------------------------------------------------------

/** Resolve the docs base URL: `ONEDEV_DOCS_URL` (per call) or the official site. */
function docsBase(): string {
  const raw = process.env['ONEDEV_DOCS_URL']?.trim()
  const base = raw ? raw : DEFAULT_DOCS_BASE
  return base.replace(/\/+$/, '')
}

async function docFetch(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: {
      'user-agent': USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    redirect: 'follow',
  })
  if (!res.ok) throw new Error(`GET ${url} → HTTP ${res.status}`)
  return res.text()
}

/** Run `fn` over every item with at most `limit` in flight at once. */
async function mapWithConcurrency<T>(items: readonly T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let next = 0
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T
      await fn(item)
    }
  })
  await Promise.all(workers)
}

// ---------------------------------------------------------------------------
// Sitemap + page extraction
// ---------------------------------------------------------------------------

/** Fetch (and cache) the sorted list of doc paths from `/sitemap.xml`. */
async function listDocPaths(base: string, refresh: boolean): Promise<string[]> {
  const cache = docsCacheFor(base)
  const now = Date.now()
  if (!refresh && cache.sitemap && now - cache.sitemap.fetchedAt < SITEMAP_TTL_MS) {
    return cache.sitemap.urls
  }
  const xml = await docFetch(`${base}/sitemap.xml`)
  const paths = new Set<string>()
  for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
    let raw: string
    try {
      raw = new URL(m[1] as string).pathname
    } catch {
      continue
    }
    // Drop the SPA search shell; keep the root ("/") landing page.
    if (raw === '/search') continue
    raw = raw.replace(/\/+$/, '')
    if (raw.endsWith('.html')) raw = raw.slice(0, -'.html'.length)
    if (raw === '') raw = '/'
    paths.add(raw)
  }
  const urls = [...paths].sort()
  if (urls.length === 0) {
    // Some hosts answer unknown paths with the SPA shell and HTTP 200 — detect
    // that case instead of silently returning an empty index.
    throw new Error(`no <loc> entries found in ${base}/sitemap.xml (is the docs site reachable?)`)
  }
  cache.sitemap = { urls, fetchedAt: now }
  return urls
}

/** Fetch one page and extract { title, text, related } from the rendered HTML. */
async function fetchDocPage(base: string, path: string): Promise<DocPage> {
  const url = `${base}${path === '/' ? '/' : path}`
  const html = await docFetch(url)
  const title = extractTitle(html) ?? pathTitle(path)
  const text = articleToText(html, base, path)
  return { url, path, title, text, related: relatedPaths(html, base, path), fetchedAt: Date.now() }
}

function extractTitle(html: string): string | null {
  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
  if (!t) return null
  const title = decodeEntities(t[1] as string).replace(/\s+/g, ' ').trim()
  // Docusaurus page titles look like "Use Job Secrets | OneDev Documentation".
  return title.replace(/\s*\|\s*OneDev Documentation\s*$/i, '').trim() || null
}

/** Derive a display title from the URL slug ("job-secrets" → "Job Secrets"). */
function pathTitle(path: string): string {
  if (path === '/') return 'OneDev Documentation'
  const seg = path.split('/').filter(Boolean).pop() ?? ''
  return (
    seg
      .split('-')
      .filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ') || 'OneDev Documentation'
  )
}

// ---------------------------------------------------------------------------
// HTML → plain-text/Markdown-ish conversion (no DOM available in Node)
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', mdash: '—', ndash: '–', hellip: '…',
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => safeCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec: string) => safeCodePoint(parseInt(dec, 10)))
    .replace(/&([a-z]+);/gi, (m, name: string) => ENTITIES[name.toLowerCase()] ?? m)
}

function safeCodePoint(cp: number): string {
  return Number.isFinite(cp) && cp > 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : ''
}

/** Strip tags from an HTML fragment and normalize whitespace (no links kept). */
function inlineText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim()
}

/**
 * Convert a docs page to readable text: keep headings, list items, links,
 * code blocks and image alts; drop navigation and site chrome.
 */
export function articleToText(html: string, base: string, path: string): string {
  // 1. Isolate the content: article > main > (fallback) whole document.
  let content =
    html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ??
    html.match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1] ??
    html
  // 2. Drop chrome/clients-only elements.
  content = content.replace(/<(script|style|svg|noscript|nav|aside)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  // 3. Preserve code blocks as placeholders (they keep raw formatting).
  const codeBlocks: string[] = []
  content = content.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
    const code = decodeEntities(inner.replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li)>/gi, '\n').replace(/<[^>]+>/g, ''))
    codeBlocks.push(code.replace(/^\n+|\n+$/g, ''))
    return `\u0000CODE${codeBlocks.length - 1}\u0000`
  })
  // 4. Structure: headings, list items, links, images, breaks, table cells.
  content = content
    .replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl: string, inner: string) => `\n\n${'#'.repeat(Number(lvl))} ${inlineText(inner)}\n\n`)
    .replace(/<li[^>]*>/gi, '\n- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<a\s[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
      const text = inlineText(inner)
      const abs = absoluteUrl(href, base, path)
      if (!abs || abs.startsWith('#')) return text
      return text ? `[${text}](${abs})` : ''
    })
    .replace(/<img\s[^>]*>/gi, (tag) => {
      const alt = tag.match(/alt=["']([^"']*)["']/i)?.[1] ?? ''
      const src = tag.match(/src=["']([^"']*)["']/i)?.[1] ?? ''
      const abs = absoluteUrl(src, base, path)
      const label = decodeEntities(alt).trim()
      return abs ? `![${label}](${abs})` : label ? `[image: ${label}]` : ''
    })
    .replace(/<\/t[dh]>/gi, ' | ')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<\/(p|div|section|table|ul|ol|blockquote)>/gi, '\n')
  // 5. Strip remaining tags, decode, tidy up.
  content = decodeEntities(content.replace(/<[^>]+>/g, ' '))
  content = content.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n')
  // 6. Restore code blocks as fenced blocks.
  content = content.replace(/\u0000CODE(\d+)\u0000/g, (_m, i: string) => `\n\n\`\`\`\n${codeBlocks[Number(i)] ?? ''}\n\`\`\`\n\n`)
  return content.trim()
}

/** Resolve a possibly-relative href/src against the current page URL. */
function absoluteUrl(href: string, base: string, path: string): string | null {
  try {
    const url = new URL(href, `${base}${path}`)
    return url.origin + url.pathname
  } catch {
    return null
  }
}

/** Internal doc-page links inside the article (for "related pages"). */
function relatedPaths(html: string, base: string, self: string): string[] {
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1] ?? ''
  const out = new Set<string>()
  for (const m of article.matchAll(/<a\s[^>]*href=["']([^"']*)["'][^>]*>/gi)) {
    const abs = absoluteUrl(m[1] as string, base, self)
    if (!abs || !abs.startsWith(`${base}/`)) continue
    let p = abs.slice(base.length).replace(/\/+$/, '') || '/'
    if (p === self || p === '/search') continue
    if (p.endsWith('.html')) p = p.slice(0, -'.html'.length)
    out.add(p)
  }
  return [...out].sort().slice(0, 12)
}

// ---------------------------------------------------------------------------
// Index build + search ranking
// ---------------------------------------------------------------------------

/** Load every sitemap page into the cache (skips pages already cached & fresh). */
async function buildDocsIndex(base: string, refresh: boolean): Promise<{ pages: DocPage[]; failed: number }> {
  const paths = await listDocPaths(base, refresh)
  const cache = docsCacheFor(base)
  const now = Date.now()
  const stale = paths.filter((p) => {
    const hit = cache.pages.get(p)
    return refresh || !hit || now - hit.fetchedAt > PAGE_TTL_MS
  })
  let failed = 0
  await mapWithConcurrency(stale, FETCH_CONCURRENCY, async (p) => {
    try {
      cache.pages.set(p, await fetchDocPage(base, p))
    } catch {
      failed++
    }
  })
  const pages: DocPage[] = []
  for (const p of paths) {
    const hit = cache.pages.get(p)
    if (hit) pages.push(hit)
  }
  return { pages, failed }
}

const STOP_WORDS = new Set([
  'how', 'to', 'the', 'a', 'an', 'of', 'in', 'on', 'for', 'and', 'or', 'with', 'is', 'are',
  'do', 'does', 'i', 'my', 'me', 'we', 'our', 'can', 'should', 'what', 'which', 'when',
  'use', 'using', 'via', 'at', 'as', 'be', 'by', 'it', 'its', 'that', 'this', 'from', 'set',
])

/** Lowercase search tokens: ASCII words (stop words dropped) + CJK runs. */
function tokenize(query: string): string[] {
  const lower = query.toLowerCase()
  const words = lower.match(/[a-z0-9][a-z0-9._-]*/g) ?? []
  const cjk = lower.match(/[\u4e00-\u9fff]{2,}/g) ?? []
  return [...new Set([...words.filter((w) => w.length > 1 && !STOP_WORDS.has(w)), ...cjk])]
}

function countOccurrences(hay: string, needle: string): number {
  let count = 0
  let at = hay.indexOf(needle)
  while (at !== -1) {
    count++
    at = hay.indexOf(needle, at + needle.length)
  }
  return count
}

function makeSnippet(text: string, tokens: string[], width = 240): string {
  const lower = text.toLowerCase()
  let first = -1
  for (const tok of tokens) {
    const idx = lower.indexOf(tok)
    if (idx !== -1 && (first === -1 || idx < first)) first = idx
  }
  if (first === -1) {
    const head = text.slice(0, width).replace(/\s+/g, ' ').trim()
    return head + (text.length > width ? '…' : '')
  }
  const start = Math.max(0, Math.floor(first - width / 3))
  const end = Math.min(text.length, first + width)
  const slice = text.slice(start, end).replace(/\s+/g, ' ').trim()
  return (start > 0 ? '…' : '') + slice + (end < text.length ? '…' : '')
}

interface ScoredPage {
  title: string
  url: string
  path: string
  score: number
  snippet: string
}

function scorePage(page: DocPage, tokens: string[], phrase: string): ScoredPage | null {
  const title = page.title.toLowerCase()
  const path = page.path.toLowerCase()
  const pathFlat = path.replace(/[^a-z0-9/]/g, '')
  const body = page.text.toLowerCase()
  let score = 0
  let matchedAll = tokens.length > 0
  for (const tok of tokens) {
    const flat = tok.replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
    const inTitle = title.includes(tok) || title.includes(flat)
    const inPath = path.includes(tok) || pathFlat.includes(flat)
    const bodyCount = countOccurrences(body, tok)
    if (inTitle) score += 12
    if (inPath) score += 6
    if (bodyCount > 0) score += 2 * Math.min(bodyCount, 5)
    if (!inTitle && !inPath && bodyCount === 0) matchedAll = false
  }
  if (phrase.length >= 3) {
    if (title.includes(phrase)) score += 10
    if (body.includes(phrase)) score += 6
  }
  if (tokens.length > 1 && matchedAll) score += 10
  if (score === 0) return null
  return {
    title: page.title,
    url: page.url,
    path: page.path,
    score,
    snippet: makeSnippet(page.text, tokens),
  }
}

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const refreshParam = z.boolean().default(false).describe('Bypass the in-memory cache and refetch from docs.onedev.io')

export const docsTools: ToolDefinition[] = [
  tool(
    'onedev_docs_search',
    'Search OneDev Documentation',
    [
      'Full-text search over the official OneDev documentation (https://docs.onedev.io/).',
      'Builds (and caches) a page index from the docs sitemap on first use. The docs are written in English:',
      'pass English keywords for best results (CJK queries are matched as raw substrings). Returns ranked pages',
      'with title, URL, path and a text snippet. Standalone: works without a configured OneDev connection.',
    ].join(' '),
    z.object({
      query: z.string().min(1).describe('Search keywords, preferably in English, e.g. "job secrets", "kubernetes agent farm"'),
      limit: z.number().int().min(1).max(20).default(8).describe('Max results to return'),
      refresh: refreshParam,
    }),
    async (_client, args) => {
      const base = docsBase()
      const query = args.query as string
      const { pages, failed } = await buildDocsIndex(base, args.refresh === true)
      const tokens = tokenize(query)
      const phrase = query.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff ]/g, ' ').replace(/\s+/g, ' ').trim()
      const scored = pages
        .map((p) => scorePage(p, tokens, phrase))
        .filter((s): s is ScoredPage => s !== null)
        .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
        .slice(0, args.limit as number)
      const result: Record<string, unknown> = {
        query,
        matched: scored.length,
        results: scored,
      }
      if (failed > 0) result.failedPages = failed
      if (scored.length === 0 && !/[a-z0-9]/i.test(query)) {
        result.hint = 'The OneDev documentation is written in English; retry with English keywords.'
      }
      return result
    },
    { standalone: true },
  ),

  tool(
    'onedev_docs_read',
    'Read OneDev Documentation Page',
    [
      'Fetch one page of the official OneDev documentation (https://docs.onedev.io/) and return its content as',
      'readable text (headings, paragraphs, lists, links, code blocks). Accepts a page path such as',
      '"/tutorials/cicd/job-secrets" or a full URL on the docs site. Standalone: works without a configured',
      'OneDev connection.',
    ].join(' '),
    z.object({
      page: z
        .string()
        .min(1)
        .describe('Page path ("/tutorials/cicd/job-secrets") or full docs.onedev.io URL'),
      refresh: refreshParam,
    }),
    async (_client, args) => {
      const base = docsBase()
      let raw = (args.page as string).trim()
      if (/^https?:\/\//i.test(raw)) {
        if (!raw.startsWith(`${base}/`) && raw !== base) {
          throw new Error(`only pages on ${base} can be read (got ${raw})`)
        }
        // Reduce the absolute URL to its path so it can hit the page cache.
        try {
          raw = new URL(raw).pathname
        } catch {
          /* unreachable for a validated absolute URL; falls through as-is */
        }
      } else {
        if (!raw.startsWith('/')) raw = `/${raw}`
      }
      // Normalize: strip query/hash, .html suffix, trailing slashes.
      raw = (raw.split(/[?#]/, 1)[0] ?? raw).replace(/\.html$/i, '').replace(/\/+$/, '') || '/'
      const cache = docsCacheFor(base)
      const now = Date.now()
      let page = cache.pages.get(raw)
      if (args.refresh === true || !page || now - page.fetchedAt > PAGE_TTL_MS) {
        page = await fetchDocPage(base, raw)
        cache.pages.set(raw, page)
      }
      const inSitemap = (await listDocPaths(base, false)).includes(raw)
      return {
        title: page.title,
        path: page.path,
        url: page.url,
        inSitemap,
        content: page.text,
        related: page.related,
      }
    },
    { standalone: true },
  ),

  tool(
    'onedev_docs_list',
    'List OneDev Documentation Pages',
    [
      'List the pages of the official OneDev documentation (https://docs.onedev.io/) from its sitemap, grouped by',
      'top-level category. Optionally filter with a path substring, e.g. "cicd", "tutorials", "administration-guide".',
      'Titles are derived from URL slugs (exact titles via onedev_docs_read). Standalone: works without a',
      'configured OneDev connection.',
    ].join(' '),
    z.object({
      category: z.string().optional().describe('Substring filter on page paths, e.g. "cicd" or "administration-guide"'),
      limit: z.number().int().min(1).max(200).default(100).describe('Max pages to return'),
      refresh: refreshParam,
    }),
    async (_client, args) => {
      const base = docsBase()
      const paths = await listDocPaths(base, args.refresh === true)
      const category = (args.category as string | undefined)?.toLowerCase().trim()
      const categoryCounts = new Map<string, number>()
      for (const p of paths) {
        const top = p === '/' ? '(root)' : (p.split('/').filter(Boolean)[0] as string)
        categoryCounts.set(top, (categoryCounts.get(top) ?? 0) + 1)
      }
      const filtered = category ? paths.filter((p) => p.toLowerCase().includes(category)) : paths
      return {
        total: paths.length,
        categories: [...categoryCounts.entries()]
          .sort((a, b) => a[0].localeCompare(b[0]))
          .map(([name, count]) => ({ category: name, count })),
        filtered: filtered.length,
        pages: filtered.slice(0, args.limit as number).map((p) => ({ path: p, title: pathTitle(p) })),
      }
    },
    { standalone: true },
  ),
]
