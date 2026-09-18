/**
 * dsh-onedev — DeepSeek Harness plugin, Host half.
 *
 * Mounts a small loopback-only HTTP surface (`/api/onedev/*`) so the dsh Web
 * GUI (the OneDev settings section in this same package's client half) can
 * read, validate and persist the OneDev **environments** (multiple named
 * connections, each with its own URL/credentials/remark). It reuses the same
 * multi-environment credential store and probe that the standalone MCP server
 * (`dsh-onedev-mcp`) reads on startup, so anything saved here is picked up by
 * the next tool call (no restart).
 *
 * The plugin is loadable by the DSH Loader because it exports the plain cordis
 * plugin shape (`name`/`inject`/`apply`, no default export). The MCP server
 * itself stays a separate binary under `bin/`.
 */
import type { Context } from '@deepseek-ai/cordis'
import type { IncomingMessage, ServerResponse } from 'node:http'
// Type-only: pulls the `ctx.webServer` service onto the Host Context.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { probeOneDev, type ProbeOutcome } from '../../src/auth.js'
import {
  resolveConfigFile,
  type AuthType,
  type EnvironmentDescriptor,
  describeEnvironment,
} from '../../src/config.js'
import {
  loadEnvironmentStore,
  saveEnvironment,
  deleteEnvironment,
  setPrimary,
  clearStoredConfig,
  type StoredConfig,
  type EnvironmentStore,
} from '../../src/storage.js'

/** Plugin identity registered into the Loader. */
export const name = 'dsh-onedev'

/** Services this Host plugin must wait on before it can mount its routes. */
export const inject = ['webServer'] as const

/** Optional plugin configuration (all values fall back to the shared defaults). */
export interface PluginConfig {
  /** Override the credential-store path (default: the shared resolution). */
  configFile?: string
}

/** Serializable body accepted by the config/probe routes. */
interface SaveBody {
  /** Save body action (default 'save'). */
  action?: 'save' | 'delete' | 'setPrimary'
  /** Whole-store clear (legacy keep). */
  clear?: boolean
  /** Target environment slug. */
  slug?: string
  /** Target environment slug for probing (alias of the form's `environment`). */
  env?: string
  remark?: string
  onedevUrl?: string
  authType?: AuthType
  onedevToken?: string
  username?: string
  password?: string
  readonly?: boolean
  apiTimeoutMs?: number
  apiBase?: string
  transport?: 'stdio' | 'streamable-http'
  httpHost?: string
  httpPort?: number
  extraHeaders?: string
}

type Handler = (req: IncomingMessage, res: ServerResponse) => void | Promise<void>

/**
 * Mount the dsh-onedev config/probe routes for the Web GUI.
 * @param ctx - cordis context providing `ctx.webServer`.
 * @param config - optional plugin config.
 */
export function apply(ctx: Context, config: PluginConfig = {}): void {
  ctx.effect(() => {
    const configFile = config.configFile ?? resolveConfigFile()
    const guards = makeLoopbackGuard()
    const disposers = [
      ctx.webServer.register({ kind: 'exact', path: '/api/onedev/config', handler: handleConfig(configFile, guards) }),
      ctx.webServer.register({ kind: 'exact', path: '/api/onedev/probe', handler: handleProbe(configFile, guards) }),
    ]
    return () => { for (const dispose of disposers) dispose() }
  }, 'dsh-onedev: config surface')
}

/** Build the route handler for listing / saving / deleting / clearing environments. */
function handleConfig(configFile: string, guards: Guard): Handler {
  return async (req, res) => {
    if (!guards.trusted(req, res)) return
    if (req.method === 'GET') {
      sendJson(res, 200, { ok: true, configFile, ...listView(configFile) })
      return
    }
    if (req.method === 'POST') {
      const body = (await readJson(req)) as SaveBody
      if (body && body.clear === true) {
        const cleared = clearStoredConfig(configFile)
        sendJson(res, 200, { ok: true, cleared })
        return
      }
      try {
        const action = body?.action ?? 'save'
        if (action === 'delete') {
          const removed = body.slug ? deleteEnvironment(configFile, body.slug) : false
          sendJson(res, 200, { ok: true, removed, ...listView(configFile) })
          return
        }
        if (action === 'setPrimary') {
          if (!body.slug) throw new Error('missing environment slug')
          setPrimary(configFile, body.slug)
          sendJson(res, 200, { ok: true, ...listView(configFile) })
          return
        }
        // default: save (upsert) one environment.
        const slug = strip(body?.slug)
        if (!slug) throw new Error('missing environment slug')
        const saved = saveEnvironment(configFile, slug, toStored(configFile, slug, body))
        const view = listView(configFile)
        sendJson(res, 200, { ok: true, configFile: saved, primary: view.primary, envs: view.envs, saved: view.envs.find((e) => e.slug === slug) })
      } catch (err) {
        sendJson(res, 400, { ok: false, error: (err as Error).message })
      }
      return
    }
    sendJson(res, 405, { ok: false, error: 'method not allowed' })
  }
}

/**
 * Build the route handler that tests supplied credentials without saving.
 *
 * The form never receives secrets back from `GET /api/onedev/config` (they are
 * redacted), so on a reopened page the password/token fields start blank. To
 * keep "Test connection" usable without retyping credentials, blank submitted
 * secret fields fall back to the targeted environment's stored values
 * (`env`/`slug`); anything the operator typed explicitly still wins. The reply
 * lists which fields were filled from the store (`usedStored`).
 */
function handleProbe(configFile: string, guards: Guard): Handler {
  return async (req, res) => {
    if (!guards.trusted(req, res)) return
    if (req.method !== 'POST') {
      sendJson(res, 405, { ok: false, error: 'method not allowed' })
      return
    }
    const body = (await readJson(req)) as SaveBody
    const slug = strip(body.slug) || strip(body.env) || ''
    const stored = safeLoad(configFile).environments[slug] ?? {}
    const usedStored: string[] = []
    const pick = (submitted: string | undefined, storedValue: string | undefined, key: string): string => {
      const s = strip(submitted)
      if (s !== '') return s
      const fallback = storedValue ?? ''
      if (fallback !== '') usedStored.push(key)
      return fallback
    }
    try {
      const outcome: ProbeOutcome = await probeOneDev({
        onedevUrl: cleanUrl(pick(body.onedevUrl, stored.onedevUrl, 'onedevUrl')),
        authType: (body.authType ?? stored.authType) === 'token' ? 'token' : 'password',
        onedevToken: pick(body.onedevToken, stored.onedevToken, 'onedevToken'),
        username: pick(body.username, stored.username, 'username'),
        password: (() => {
          if (body.password !== undefined && body.password !== '') return body.password
          if (stored.password) usedStored.push('password')
          return stored.password ?? ''
        })(),
        apiBase: (() => {
          const s = strip(body.apiBase)
          return s !== '' ? s : stored.apiBase
        })(),
        timeoutMs: typeof body.apiTimeoutMs === 'number' ? body.apiTimeoutMs : stored.apiTimeoutMs,
      })
      sendJson(res, outcome.kind === 'ok' ? 200 : (outcome.kind === 'forbidden' ? 202 : 400), {
        ok: outcome.kind === 'ok',
        outcome,
        usedStored,
      })
    } catch (err) {
      sendJson(res, 400, { ok: false, error: (err as Error).message, usedStored })
    }
  }
}

/** Guard helpers: loopback + same-origin checks shared by every route. */
interface Guard {
  trusted(req: IncomingMessage, res: ServerResponse): boolean
}

function makeLoopbackGuard(): Guard {
  return {
    trusted(req, res) {
      const address = req.socket.remoteAddress ?? ''
      if (address !== '127.0.0.1' && address !== '::1' && address !== '::ffff:127.0.0.1') {
        sendJson(res, 403, { ok: false, error: 'forbidden' })
        return false
      }
      const origin = req.headers.origin
      if (origin !== undefined && req.headers.host !== undefined && new URL(origin).host !== req.headers.host) {
        sendJson(res, 403, { ok: false, error: 'forbidden: cross-origin' })
        return false
      }
      return true
    },
  }
}

// ---- pure helpers ----

/** Validate and normalise the OneDev base URL. */
function cleanUrl(v: unknown): string {
  const s = strip(v).replace(/\/+$/, '')
  if (!s) throw new Error('OneDev server URL is required, e.g. http://localhost:6610')
  if (!/^https?:\/\//i.test(s)) throw new Error(`invalid OneDev URL: "${s}" (must start with http:// or https://)`)
  return s
}

/**
 * Map a validated HTTP body onto a store merge for `saveEnvironment`. Secrets
 * are only overwritten when a non-empty value is submitted — a blank
 * password/token/username field preserves whatever the store already holds for
 * that slug. For a brand-new environment a usable credential is required.
 */
function toStored(configFile: string, slug: string, b: SaveBody): StoredConfig {
  const known = safeLoad(configFile).environments[slug]
  const authType: AuthType = b.authType === 'token' ? 'token' : 'password'
  const username = strip(b.username)
  const password = b.password ?? ''
  const token = strip(b.onedevToken)

  if (!known && authType === 'password' && (username === '' || password === '')) {
    throw new Error('a new password-auth environment needs a username and password')
  }
  if (!known && authType === 'token' && token === '') {
    throw new Error('a new token-auth environment needs an access token')
  }

  return {
    remark: strip(b.remark) || undefined,
    onedevUrl: cleanUrl(b.onedevUrl),
    authType,
    ...(authType === 'token' && token !== '' ? { onedevToken: token } : {}),
    ...(authType === 'password' && username !== '' ? { username } : {}),
    ...(authType === 'password' && password !== '' ? { password } : {}),
    ...(typeof b.readonly === 'boolean' ? { readonly: b.readonly } : {}),
    ...(typeof b.apiTimeoutMs === 'number' ? { apiTimeoutMs: b.apiTimeoutMs } : {}),
    ...(b.apiBase !== undefined && strip(b.apiBase) !== '' ? { apiBase: strip(b.apiBase).replace(/\/+$/, '') } : {}),
    ...(b.transport === 'stdio' || b.transport === 'streamable-http' ? { transport: b.transport } : {}),
    ...(b.httpHost !== undefined && strip(b.httpHost) !== '' ? { httpHost: strip(b.httpHost) } : {}),
    ...(typeof b.httpPort === 'number' ? { httpPort: b.httpPort } : {}),
    ...(b.extraHeaders !== undefined && strip(b.extraHeaders) !== '' ? { extraHeaders: strip(b.extraHeaders) } : {}),
  }
}

/** Redacted listing of every configured environment, plus the primary slug. */
function listView(configFile: string): { primary: string; envs: EnvironmentDescriptor[] } {
  const store = safeLoad(configFile)
  const primary = store.primary
  const envs = Object.entries(store.environments).map(([slug, s]) => describeEnvironment(slug, s, primary))
  return { primary, envs }
}

/** Read the multi-env store without throwing on a missing/corrupt file. */
function safeLoad(configFile: string): EnvironmentStore {
  try {
    return loadEnvironmentStore(configFile) ?? { primary: '', environments: {} }
  } catch {
    return { primary: '', environments: {} }
  }
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

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('content-type', 'application/json')
  res.setHeader('cache-control', 'no-store')
  res.end(JSON.stringify(body))
}