/**
 * dsh-onedev-mcp — configuration.
 *
 * All runtime configuration is read from the environment so the server is
 * easy to launch both as a stdio subprocess (the DSH `@deepseek-ai/dsh-mcp-client`
 * plugin spawns it and injects env) and as a streamable-HTTP server.
 *
 * ## Authentication — killing the "egg paradox"
 *
 * OneDev REST accepts an HTTP `Authorization: Basic base64(username:password)`
 * header and performs a real username/password login (see OneDev's
 * `BasicAuthenticationFilter`). That means the MCP does **not** need a
 * pre‑created access token (which itself environmentally requires logging into
 * the OneDev web UI). Two auth modes are supported:
 *
 *   - `token`    (default) — `Authorization: Bearer <ONEDEV_TOKEN>`.
 *   - `password`           — `Authorization: Basic base64(ONEDEV_USERNAME:ONEDEV_PASSWORD)`.
 *
 * Credentials may be supplied via the environment **or** through the setup
 * console's credential store (see `src/storage.ts` and `src/setup/server.ts`).
 * Environment values always win over stored ones, so an operator can still pin
 * a token from CI while a developer relies on username/password entered in the
 * GUI.
 */

export type TransportKind = 'stdio' | 'streamable-http'

export type AuthType = 'token' | 'password'

export interface Config {
  /** Base URL of the OneDev server, e.g. https://onedev.internal:6610 */
  onedevUrl: string
  /** Authentication mode: pre-created `token` or direct `password` login. */
  authType: AuthType
  /** Bearer token, used when `authType === 'token'`. */
  onedevToken: string
  /** Account name, used when `authType === 'password'`. */
  username: string
  /** Account password, used when `authType === 'password'`. */
  password: string
  /** REST base path appended to `onedevUrl` (OneDev default `/~api`). */
  apiBase: string
  /** MCP transport to serve on. */
  transport: TransportKind
  /** Port used when `transport === 'streamable-http'`. */
  httpPort: number
  /** Host/interface to bind for streamable HTTP. */
  httpHost: string
  /** Default timeout (ms) for an outgoing OneDev API call. */
  apiTimeoutMs: number
  /** Whether an unauthenticated HTTP endpoint reveals success/version info. */
  readonly: boolean
  /** Extra request headers as JSON, e.g. {"X-Custom":"value"}. */
  extraHeaders: Record<string, string>
  /** Path of the credential store this config was resolved from ("" if none). */
  configFile: string
}

interface EnvMap {
  [key: string]: string | undefined
}

import { loadEnvironmentStore, type StoredConfig, type EnvironmentStore } from './storage.js'

function numberFromEnv(env: EnvMap, name: string, fallback: number): number {
  const raw = env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isFinite(n)) throw new Error(`env var ${name} is not a number: "${raw}"`)
  return n
}

/** Non-secret view of one configured environment, for the GUI and the AI. */
export interface EnvironmentDescriptor {
  slug: string
  remark: string
  onedevUrl: string
  authType: AuthType
  username: string
  tokenSet: boolean
  passwordSet: boolean
  readonly: boolean
  primary: boolean
  /** True when the environment declares a URL and a usable credential. */
  configured: boolean
}

/** Recompose a stored environment into a redacted descriptor (no secrets). */
export function describeEnvironment(slug: string, s: StoredConfig, primarySlug: string): EnvironmentDescriptor {
  const hasSecret = s.authType === 'password' ? Boolean(s.password) : Boolean(s.onedevToken)
  return {
    slug,
    remark: s.remark ?? '',
    onedevUrl: s.onedevUrl ?? '',
    authType: s.authType ?? 'token',
    username: s.username ?? '',
    tokenSet: Boolean(s.onedevToken),
    passwordSet: Boolean(s.password),
    readonly: s.readonly ?? false,
    primary: slug === primarySlug,
    configured: Boolean(s.onedevUrl) && hasSecret,
  }
}

/**
 * List every configured environment as a redacted descriptor, optionally
 * filtered by a case-insensitive substring over slug/remark/url.
 */
export function listEnvironments(
  env: EnvMap = process.env,
  filter?: string,
): EnvironmentDescriptor[] {
  const configFile = resolveConfigFile(env)
  let store: EnvironmentStore | null = null
  if (configFile) {
    try {
      store = loadEnvironmentStore(configFile)
    } catch {
      store = null
    }
  }
  if (!store) return []
  const needle = (filter ?? '').trim().toLowerCase()
  return Object.entries(store.environments)
    .map(([slug, s]) => describeEnvironment(slug, s, store!.primary))
    .sort((a, b) => Number(b.primary) - Number(a.primary) || a.slug.localeCompare(b.slug))
    .filter((d) =>
      needle === ''
        || d.slug.toLowerCase().includes(needle)
        || d.remark.toLowerCase().includes(needle)
        || d.onedevUrl.toLowerCase().includes(needle),
    )
}

/**
 * Parse configuration for one environment from the process environment,
 * falling back to that environment's values in the credential store.
 *
 * Env-var overrides (`ONEDEV_URL`, credentials, pass-through options) apply
 * only when resolving the store's **primary** environment, which preserves the
 * legacy single-environment CLI behaviour. Non-primary environments are driven
 * solely by their stored values.
 *
 * Because the store lives on disk, store loading must never break a
 * no-store / corrupt-store launch: it degrades to empty and the normal
 * "missing credential" errors surface instead.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env, envName?: string): Config {
  // Resolve the target environment slug: explicit arg -> ONEDEV_ENV -> primary.
  const configFile = resolveConfigFile(env)
  let store: EnvironmentStore | null = null
  if (configFile) {
    try {
      store = loadEnvironmentStore(configFile)
    } catch {
      store = null
    }
  }
  const primary = store?.primary ?? ''
  const target =
    (envName ?? '').trim() || (env['ONEDEV_ENV'] ?? '').trim() || primary
  const isPrimaryEnv = target === primary
  const stored: StoredConfig = store?.environments[target] ?? {}

  // Env overrides only ever apply to the primary environment (legacy CLI path).
  const envVal = (name: string): string | undefined => (isPrimaryEnv ? env[name] : undefined)

  const envAuthType = (envVal('ONEDEV_AUTH_TYPE') ?? '').trim().toLowerCase()
  const authType: AuthType =
    envAuthType === 'password'
      ? 'password'
      : envAuthType === 'token'
        ? 'token'
        : stored.authType === 'password'
          ? 'password'
          : 'token'

  let extraHeaders: Record<string, string> = {}
  const extra = envVal('ONEDEV_MCP_HEADERS')
  if (extra !== undefined && extra.trim() !== '') {
    try {
      const parsed = JSON.parse(extra)
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error('must be a JSON object')
      }
      extraHeaders = parsed as Record<string, string>
    } catch (err) {
      throw new Error(`env var ONEDEV_MCP_HEADERS is invalid: ${(err as Error).message}`)
    }
  }

  let onedevUrl = envVal('ONEDEV_URL')?.trim() || stored.onedevUrl || ''
  if (onedevUrl === '') {
    throw new Error(
      `missing required env var: ONEDEV_URL (or configure the "${target}" environment in dsh Settings → OneDev)`,
    )
  }
  onedevUrl = onedevUrl.replace(/\/+$/, '')

  const onedevToken = envVal('ONEDEV_TOKEN')?.trim() || stored.onedevToken || ''
  const username = envVal('ONEDEV_USERNAME')?.trim() || stored.username || ''
  const password = envVal('ONEDEV_PASSWORD') || stored.password || ''

  if (authType === 'token' && onedevToken === '') {
    throw new Error(`missing required credential: ONEDEV_TOKEN (token auth; or switch to password auth with ONEDEV_AUTH_TYPE=password / the setup console)`)
  }
  if (authType === 'password') {
    if (username === '') throw new Error(`missing required credential: ONEDEV_USERNAME (password auth)`)
    if (password === '') throw new Error(`missing required credential: ONEDEV_PASSWORD (password auth)`)
  }

  const apiBase = (envVal('ONEDEV_API_BASE')?.trim() || stored.apiBase || '/~api').replace(/\/+$/, '')

  const envTransport = (envVal('ONEDEV_MCP_TRANSPORT') ?? stored.transport ?? '').trim().toLowerCase()
  const transport: TransportKind =
    envTransport === 'streamable-http' || envTransport === 'http'
      ? 'streamable-http'
      : envTransport === 'stdio'
        ? 'stdio'
        : 'stdio'

  const httpPort = (() => {
    const raw = envVal('ONEDEV_MCP_PORT') ?? stored.httpPort
    if (raw === undefined || raw === null || String(raw).trim() === '') return numberFromEnv(env, 'ONEDEV_MCP_PORT', 8765)
    const n = Number(raw)
    if (!Number.isFinite(n)) throw new Error(`ONEDEV_MCP_PORT is not a number: "${String(raw)}"`)
    return n
  })()
  const httpHost = envVal('ONEDEV_MCP_HOST')?.trim() || stored.httpHost || '127.0.0.1'

  let storeHeaders: Record<string, string> = {}
  const serialized = stored.extraHeaders
  if (typeof serialized === 'string' && serialized.trim() !== '') {
    try {
      storeHeaders = JSON.parse(serialized) as Record<string, string>
    } catch { /* a corrupt stored extraHeaders string is ignored; env still wins */ }
  }

  return {
    onedevUrl,
    authType,
    onedevToken,
    username,
    password,
    apiBase,
    transport,
    httpPort,
    httpHost,
    apiTimeoutMs: (() => {
      const raw = envVal('ONEDEV_API_TIMEOUT_MS') ?? stored.apiTimeoutMs
      if (raw === undefined || raw === null || String(raw).trim() === '') return numberFromEnv(env, 'ONEDEV_API_TIMEOUT_MS', 30_000)
      const n = Number(raw)
      if (!Number.isFinite(n)) throw new Error(`ONEDEV_API_TIMEOUT_MS is not a number: "${String(raw)}"`)
      return n
    })(),
    readonly: (() => {
      const raw = envVal('ONEDEV_MCP_READONLY') ?? stored.readonly
      if (typeof raw === 'string') return raw.trim().toLowerCase() === 'true'
      return raw === true
    })(),
    extraHeaders: { ...storeHeaders, ...extraHeaders },
    configFile,
  }
}

/** Resolve the credential-store path, honouring `ONEDEV_CONFIG_FILE`. */
export function resolveConfigFile(env: EnvMap = process.env): string {
  const explicit = env['ONEDEV_CONFIG_FILE']
  if (explicit !== undefined && explicit.trim() !== '') return explicit

  if (process.platform === 'win32') {
    const appData = env['APPDATA'] ?? ''
    if (appData !== '') return `${appData.replace(/[\\/]+$/, '')}\\dsh-onedev\\config.json`
  }
  const home = env['HOME'] ?? env['USERPROFILE']
  if (!home) return ''
  const configHome = env['XDG_CONFIG_HOME'] ?? `${home}/.config`
  return `${configHome}/dsh-onedev/config.json`
}

/**
 * Redact a config for display: replace secret credentials with stars while
 * keeping the auth mode and whether a secret is present.
 */
export function redactConfig(cfg: Pick<Config, 'authType' | 'onedevToken' | 'username' | 'password'>): {
  authType: AuthType
  username?: string
  tokenSet: boolean
  passwordSet: boolean
} {
  return {
    authType: cfg.authType,
    username: cfg.username || undefined,
    tokenSet: cfg.onedevToken !== '',
    passwordSet: cfg.password !== '',
  }
}