/**
 * dsh-onedev-mcp — setup console HTTP server.
 *
 * A small localhost web console that lets an operator configure one or more
 * named OneDev environments (server URL + access token, or account/password
 * for automatic Basic-login auth) and validate each against OneDev before
 * saving. The primary UI is the dsh Web settings panel; this console is a
 * lightweight standalone fallback.
 *
 * Endpoints:
 *   GET  /                     → the single-file setup page (src/setup/page.ts).
 *   GET  /api/config           → listed (redacted) environments + primary.
 *   POST /api/probe            → test credentials for a temp environment (no save).
 *   POST /api/save             → test then persist one environment on success.
 *   POST /api/config           → body {clear:true} clears the whole store.
 *   POST /api/primary          → body {slug} marks an environment as primary.
 *   POST /api/delete           → body {slug} removes an environment.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { probeOneDev, type ProbeOutcome } from '../auth.js'
import { resolveConfigFile, type AuthType, describeEnvironment, type EnvironmentDescriptor } from '../config.js'
import {
  loadEnvironmentStore, saveEnvironment, deleteEnvironment, setPrimary,
  clearStoredConfig, isValidSlug, type StoredConfig, type EnvironmentStore,
} from '../storage.js'
import { SETUP_PAGE } from './page.js'

export interface SetupServerOptions {
  host: string
  port: number
  configFile?: string
}

interface SaveBody {
  slug?: string
  remark?: string
  onedevUrl?: string
  authType?: AuthType
  onedevToken?: string
  username?: string
  password?: string
  readonly?: boolean
  apiTimeoutMs?: number
  /** Extra pass-through parameters. */
  apiBase?: string
  transport?: 'stdio' | 'streamable-http'
  httpHost?: string
  httpPort?: number
  extraHeaders?: string
}

export async function startSetupServer(
  opts: SetupServerOptions,
): Promise<{ port: number; configFile: string; close: () => Promise<void> }> {
  const configFile = opts.configFile ?? resolveConfigFile()
  // Bind just the page; TLS/proxying is out of scope — the console is meant to
  // run on localhost only (like the streamable-http MCP server).
  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    try {
      if (url.pathname === '/' && req.method === 'GET') {
        res.statusCode = 200
        res.setHeader('content-type', 'text/html; charset=utf-8')
        res.setHeader('cache-control', 'no-store')
        res.end(SETUP_PAGE)
        return
      }
      if (url.pathname === '/api/config' && req.method === 'GET') {
        res.statusCode = 200
        res.setHeader('content-type', 'application/json')
        res.setHeader('cache-control', 'no-store')
        res.end(JSON.stringify(listView(configFile)))
        return
      }
      if (url.pathname === '/api/config' && req.method === 'POST') {
        const body = (await readJson(req)) as { clear?: boolean }
        if (body && body.clear === true) {
          const removed = clearStoredConfig(configFile)
          sendJson(res, 200, { ok: true, cleared: removed })
          return
        }
        sendJson(res, 400, { error: 'use /api/save to store credentials' })
        return
      }
      if (url.pathname === '/api/probe' && req.method === 'POST') {
        const body = (await readJson(req)) as SaveBody
        const outcome = await probeOneDev(toCredentials(body))
        sendJson(res, outcome.kind === 'ok' ? 200 : (outcome.kind === 'forbidden' ? 202 : 400), outcome)
        return
      }
      if (url.pathname === '/api/save' && req.method === 'POST') {
        const body = (await readJson(req)) as SaveBody
        const slug = strip(body.slug) === '' ? 'default' : strip(body.slug)
        if (!isValidSlug(slug)) throw new Error(`invalid environment name "${slug}"`)
        const outcome = await probeOneDev(toCredentials(body))
        if (outcome.kind === 'unauthorized' || outcome.kind === 'error') {
          sendJson(res, 400, outcome)
          return
        }
        const partial: StoredConfig = {
          remark: strip(body.remark) || undefined,
          onedevUrl: cleanUrl(body.onedevUrl),
          authType: body.authType === 'token' ? 'token' : 'password',
          onedevToken: body.authType === 'token' && body.onedevToken ? body.onedevToken : undefined,
          username: body.authType === 'password' ? strip(body.username) : undefined,
          password: body.authType === 'password' ? body.password : undefined,
          ...(typeof body.readonly === 'boolean' ? { readonly: body.readonly } : {}),
          ...(typeof body.apiTimeoutMs === 'number' ? { apiTimeoutMs: body.apiTimeoutMs } : {}),
          ...(body.apiBase !== undefined && strip(body.apiBase) !== '' ? { apiBase: strip(body.apiBase).replace(/\/+$/, '') } : {}),
          ...(body.transport === 'stdio' || body.transport === 'streamable-http' ? { transport: body.transport } : {}),
          ...(body.httpHost !== undefined && strip(body.httpHost) !== '' ? { httpHost: strip(body.httpHost) } : {}),
          ...(typeof body.httpPort === 'number' ? { httpPort: body.httpPort } : {}),
          ...(body.extraHeaders !== undefined && strip(body.extraHeaders) !== '' ? { extraHeaders: strip(body.extraHeaders) } : {}),
        }
        const savedPath = saveEnvironment(configFile, slug, partial)
        const view = listView(configFile)
        sendJson(res, 200, {
          ok: true,
          kind: outcome.kind,
          status: outcome.status,
          message: `"${slug}" saved and verified (HTTP ${outcome.status}).`,
          configFile: savedPath,
          primary: view.primary,
          envs: view.envs,
        })
        return
      }
      if (url.pathname === '/api/primary' && req.method === 'POST') {
        const body = (await readJson(req)) as { slug?: string }
        const slug = strip(body.slug)
        if (!slug) throw new Error('missing environment slug')
        setPrimary(configFile, slug)
        sendJson(res, 200, { ok: true, ...listView(configFile) })
        return
      }
      if (url.pathname === '/api/delete' && req.method === 'POST') {
        const body = (await readJson(req)) as { slug?: string }
        const removed = deleteEnvironment(configFile, strip(body.slug))
        sendJson(res, 200, { ok: true, removed, ...listView(configFile) })
        return
      }
      sendJson(res, 404, { error: 'not found' })
    } catch (err) {
      sendJson(res, 400, { error: (err as Error).message })
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.port, opts.host, () => resolve())
  })
  const port = (server.address() as { port: number }).port

  return {
    port,
    configFile,
    close: async () => {
      await new Promise<void>((resolve, reject) => server.close((e) => (e ? reject(e) : resolve())))
    },
  }
}

// ---- helpers ----

function listView(configFile: string): { configFile: string; primary: string; envs: EnvironmentDescriptor[] } {
  let store: EnvironmentStore | null = null
  try {
    store = loadEnvironmentStore(configFile)
  } catch {
    store = null
  }
  const primary = store?.primary ?? ''
  const envs = store
    ? Object.entries(store.environments).map(([slug, s]) => describeEnvironment(slug, s, primary))
    : []
  return { configFile, primary, envs }
}

function toCredentials(b: SaveBody): Parameters<typeof probeOneDev>[0] {
  return {
    onedevUrl: cleanUrl(b.onedevUrl),
    authType: b.authType === 'token' ? 'token' : 'password',
    onedevToken: strip(b.onedevToken),
    username: strip(b.username),
    password: b.password,
  }
}

function cleanUrl(v: unknown): string {
  const s = strip(v).replace(/\/+$/, '')
  if (!s) throw new Error('OneDev server URL is required, e.g. http://localhost:6610')
  if (!/^https?:\/\//i.test(s)) throw new Error(`invalid OneDev URL: "${s}" (must start with http:// or https://)`)
  return s
}

function strip(v: unknown): string {
  return typeof v === 'string' ? v.trim() : ''
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  const raw = Buffer.concat(chunks).toString('utf8')
  if (raw.trim() === '') return {}
  try {
    return JSON.parse(raw)
  } catch (err) {
    throw new Error(`invalid JSON body: ${(err as Error).message}`)
  }
}

function sendJson(res: ServerResponse, status: number, body: ProbeOutcome | Record<string, unknown>): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}