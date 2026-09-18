/**
 * dsh-onedev-mcp — authentication helpers and connection probing.
 *
 * OneDev authenticates an HTTP request through one of its security filters:
 *
 *   - `BearerAuthenticationFilter` — `Authorization: Bearer <access-token>`.
 *   - `BasicAuthenticationFilter`  — `Authorization: Basic base64(user:pass)`,
 *     which additionally performs a real username/password login via Apache
 *     Shiro when neither field is an access token value.
 *
 * So a plain account can authenticate by sending its username/password with
 * Basic auth on every request — no access token needs to be minted first. This
 * is what `authType === 'password'` uses, and it sidesteps the "token
 * chicken-and-egg" (login first, then a token that requires login).
 *
 * The probe here performs an anonymous baseline call plus an authenticated call
 * to a lightweight endpoint and reports whether the supplied credentials are
 * acceptable, so the setup console can validate a connection before saving it.
 */

import type { AuthType } from './config.js'

export interface Credentials {
  onedevUrl: string
  authType: AuthType
  onedevToken?: string
  username?: string
  password?: string
  apiBase?: string
  timeoutMs?: number
}

/** Build the `Authorization` header value for a given auth type. */
export function buildAuthHeader(c: Credentials): string | undefined {
  if (c.authType === 'token') {
    if (!c.onedevToken) throw new Error('token auth requires an access token')
    return `Bearer ${c.onedevToken}`
  }
  if (!c.username || !c.password) throw new Error('password auth requires username and password')
  return `Basic ${Buffer.from(`${c.username}:${c.password}`, 'utf8').toString('base64')}`
}

export type ProbeOutcome =
  | { kind: 'ok'; status: number; admin: boolean; message: string }
  | { kind: 'forbidden'; status: number; authenticated: boolean; message: string }
  | { kind: 'unauthorized'; status: number; message: string }
  | { kind: 'error'; status: number; message: string }

/**
 * Lightweight authenticated endpoint used for the probe. `/users?offset=0&count=1`
 * requires an administrator; asking for it cleanly separates outcome classes:
 *
 *   - HTTP 200 → credentials accepted **and** the account is an admin.
 *   - HTTP 403 → credentials accepted, but the account lacks the admin role
 *     (most tools need admin; surfaced as a warning).
 *   - HTTP 401 → credentials rejected / not authenticated.
 *
 * To guard against ambiguous status mapping we also take an anonymous baseline
 * and treat "same denial as anonymous" as rejected.
 */
export async function probeOneDev(c: Credentials): Promise<ProbeOutcome> {
  const apiBase = (c.apiBase ?? process.env['ONEDEV_API_BASE'] ?? '/~api').replace(/\/+$/, '')
  const timeoutMs = c.timeoutMs ?? 30_000
  // OneDev (since ~10.x, observed on 16.5) rejects `/users` with HTTP 406
  // unless *both* `offset` and `count` are supplied — independent of auth.
  const url = new URL(`${c.onedevUrl.replace(/\/+$/, '')}${apiBase}/users?offset=0&count=1`)

  const send = async (auth?: string): Promise<{ status: number; text: string }> => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const res = await fetch(url, {
        headers: {
          Accept: 'application/json',
          ...(auth ? { Authorization: auth } : {}),
        },
        signal: controller.signal,
      })
      return { status: res.status, text: await res.text() }
    } finally {
      clearTimeout(timer)
    }
  }

  let anonymous: { status: number; text: string }
  try {
    anonymous = await send(undefined)
  } catch (err) {
    return { kind: 'error', status: 0, message: `cannot reach OneDev server: ${(err as Error).message}` }
  }

  let authHeader: string | undefined
  try {
    authHeader = buildAuthHeader(c)
  } catch (err) {
    return { kind: 'error', status: 400, message: (err as Error).message }
  }

  let authed: { status: number; text: string }
  try {
    authed = await send(authHeader)
  } catch (err) {
    return { kind: 'error', status: 0, message: `request failed during authentication probe: ${(err as Error).message}` }
  }

  const status = authed.status
  if (status === 200) {
    return { kind: 'ok', status, admin: true, message: 'connection and authentication OK (administrator access).' }
  }
  if (status === 403) {
    return {
      kind: 'forbidden',
      status,
      authenticated: !sameDenial(anonymous.status, status),
      message: 'credentials are accepted, but this account is not an administrator — most tools require the admin role.',
    }
  }
  if (status === 401) {
    return { kind: 'unauthorized', status, message: 'credentials were rejected (HTTP 401) — check username/password or token.' }
  }
  if (status === 406) {
    return {
      kind: 'error',
      status,
      message:
        'the probe endpoint answered HTTP 406 (missing required query params) — this is an endpoint-contract mismatch with this OneDev version, not a credential problem.',
    }
  }
  // Unknown denial: if the authenticated call looks exactly like the anonymous
  // one, it almost certainly never authenticated.
  if (!sameDenial(anonymous.status, status)) {
    return { kind: 'error', status, message: `endpoint answered HTTP ${status}; credentials may or may not be valid.` }
  }
  return { kind: 'unauthorized', status, message: `authentication not accepted (HTTP ${status}, same as anonymous).` }
}

function sameDenial(a: number, b: number): boolean {
  return a === b
}