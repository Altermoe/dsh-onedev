/**
 * dsh-onedev-mcp — multi-environment credential store.
 *
 * Persists the connection/authentication settings for **multiple** named
 * OneDev environments (each keyed by a short slug), chosen in the dsh Web
 * settings panel or the setup console. The MCP server picks them up on the
 * next tool call without any env vars being set.
 *
 * The store file is plain JSON with mode 0600 (owner-only):
 *
 *   {
 *     "primary": "prod",
 *     "environments": {
 *       "prod":    { "remark": "...", "onedevUrl": "...", "authType": "password", ... },
 *       "staging": { "remark": "...", "onedevUrl": "...", "authType": "token", ... }
 *     }
 *   }
 *
 * Path resolution is shared with `config.ts` (`ONEDEV_CONFIG_FILE` override,
 * else `$XDG_CONFIG_HOME/dsh-onedev/config.json`,
 * `~/.config/dsh-onedev/config.json`, or `%APPDATA%\dsh-onedev\config.json`
 * on Windows).
 *
 * Backward compatibility: the previous single-config flat format is **not**
 * migrated and is **not** read. A file that is not a valid multi-environment
 * store simply reads as `null` (no store) — it never crashes a launch and the
 * caller degrades to env-only config for the primary environment.
 */

import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, renameSync, chmodSync, copyFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { resolveConfigFile, type AuthType } from './config.js'

/** A single OneDev environment's persisted connection/config. */
export interface StoredConfig {
  /** Free-form remark shown on cards and in the discovery tool. */
  remark?: string
  onedevUrl?: string
  authType?: AuthType
  onedevToken?: string
  username?: string
  password?: string
  readonly?: boolean
  apiTimeoutMs?: number
  /** REST base path appended to `onedevUrl` (default `/~api`). */
  apiBase?: string
  /** MCP transport: `stdio` or `streamable-http`. */
  transport?: 'stdio' | 'streamable-http'
  /** Bind host for streamable-HTTP mode. */
  httpHost?: string
  /** Bind port for streamable-HTTP mode. */
  httpPort?: number
  /** Extra request headers as a serialized JSON object. */
  extraHeaders?: string
}

/** Multi-environment store document. */
export interface EnvironmentStore {
  /** Slug of the primary (default) environment. */
  primary: string
  /** Slug-keyed environments. */
  environments: Record<string, StoredConfig>
}

/** Validate an environment slug (safe for MCP params and file keys). */
export function isValidSlug(slug: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(slug)
}

/**
 * Read the store. Returns `null` when no store exists OR when the file is not
 * a valid multi-environment document (including the legacy flat shape, which
 * is intentionally ignored). Throws on unreadable / invalid-JSON files.
 */
export function loadEnvironmentStore(configFile: string): EnvironmentStore | null {
  if (!existsSync(configFile)) return null
  let text: string
  try {
    text = readFileSync(configFile, 'utf8')
  } catch (err) {
    throw new Error(`cannot read credential store at ${configFile}: ${(err as Error).message}`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    throw new Error(`credential store at ${configFile} is not valid JSON: ${(err as Error).message}`)
  }
  return normalizeStore(parsed)
}

/** Coerce an unknown parsed document to a store, tolerantly. */
function normalizeStore(parsed: unknown): EnvironmentStore | null {
  if (typeof parsed !== 'object' || parsed === null) return null
  const obj = parsed as Record<string, unknown>
  const rawEnvs = obj['environments']
  if (typeof rawEnvs !== 'object' || rawEnvs === null || Array.isArray(rawEnvs)) {
    // Legacy flat format or unknown shape: not a multi-env store. Ignore.
    return null
  }
  const environments: Record<string, StoredConfig> = {}
  for (const [key, value] of Object.entries(rawEnvs as Record<string, unknown>)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      environments[key] = value as StoredConfig
    }
  }
  const primary =
    typeof obj['primary'] === 'string' && environments[obj['primary']] !== undefined
      ? obj['primary']
      : (Object.keys(environments)[0] ?? '')
  return { primary, environments }
}

/**
 * Persist (upsert) a single environment into the store atomically with
 * owner-only permissions. Creating the first environment makes it primary.
 * Returns the final path.
 */
export function saveEnvironment(configFile: string, slug: string, partial: StoredConfig): string {
  if (!isValidSlug(slug)) {
    throw new Error(
      `invalid environment name "${slug}": use 1-32 chars [A-Za-z0-9._-], starting with a letter or digit`,
    )
  }
  const store = readForMutation(configFile)
  const merged: StoredConfig = { ...(store.environments[slug] ?? {}), ...partial }
  // Normalise: never store empty secret/username placeholders.
  for (const k of ['onedevToken', 'password', 'username'] as const) {
    if (merged[k] === undefined || merged[k] === '') delete merged[k]
  }
  if (!merged.authType) merged.authType = 'token'
  store.environments[slug] = merged

  if (!store.primary || store.environments[store.primary] === undefined) store.primary = slug
  writeEnvironmentStore(configFile, store)
  return configFile
}

/** Remove an environment; reassign primary if the deleted one was primary. */
export function deleteEnvironment(configFile: string, slug: string): boolean {
  const store = readForMutation(configFile)
  if (!store.environments[slug]) return false
  delete store.environments[slug]
  const remaining = Object.keys(store.environments)
  store.primary = store.environments[store.primary] !== undefined ? store.primary : (remaining[0] ?? '')
  writeEnvironmentStore(configFile, store)
  return true
}

/** Mark one environment as the primary (default target). */
export function setPrimary(configFile: string, slug: string): boolean {
  const store = readForMutation(configFile)
  if (!store.environments[slug]) throw new Error(`environment "${slug}" does not exist`)
  store.primary = slug
  writeEnvironmentStore(configFile, store)
  return true
}

/** Remove the store entirely (used by the panel/setup "clear all" action). */
export function clearStoredConfig(configFile: string): boolean {
  if (!existsSync(configFile)) return false
  rmSync(configFile, { force: true })
  return true
}

/** Default store path (no env overrides). Re-exported for convenience. */
export function defaultConfigFile(): string {
  return resolveConfigFile()
}

// ---- helpers ----

function readForMutation(configFile: string): EnvironmentStore {
  try {
    return loadEnvironmentStore(configFile) ?? { primary: '', environments: {} }
  } catch {
    // A corrupt/unreadable store is replaced wholesale rather than blocking.
    return { primary: '', environments: {} }
  }
}

function writeEnvironmentStore(configFile: string, store: EnvironmentStore): void {
  const dir = dirname(configFile)
  mkdirSync(dir, { recursive: true })
  const tmp = `${configFile}.tmp-${process.pid}-${Date.now()}`
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', { mode: 0o600, encoding: 'utf8' })
  try {
    try {
      renameSync(tmp, configFile)
    } catch {
      // Cross-device / exotic FS: copy the content instead.
      copyFileSync(tmp, configFile)
    }
  } finally {
    if (existsSync(tmp)) {
      try { rmSync(tmp) } catch { /* best effort */ }
    }
  }
  // Best-effort permission hardening after a non-atomic fallback.
  try {
    chmodSync(configFile, 0o600)
  } catch { /* non-POSIX or readonly */ }
}