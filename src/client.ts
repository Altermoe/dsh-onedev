/**
 * dsh-onedev-mcp — OneDev REST client.
 *
 * A thin, typed wrapper over the OneDev REST API. It authenticates with either
 * a bearer access token (`Authorization: Bearer <token>`) or — the account
 * login mode that removes the "token chicken-and-egg" — HTTP Basic auth with
 * the account password (`Authorization: Basic base64(user:pass)`), which OneDev
 * accepts and turns into a real login. Every request is prefixed with the
 * configured server base URL and API base path (OneDev mounts its REST API at
 * `/~api`), and responses are normalised into { ok, status, data }.
 *
 * Endpoint reference: OneDev ships its REST docs at
 * `http(s)://<server>/~help/api`; the resource classes live under
 * `io.onedev.server.rest.resource` in the OneDev source tree.
 */

import type { Config } from './config.js'
import { buildAuthHeader } from './auth.js'

export interface ApiErrorBody {
  message?: string
  [k: string]: unknown
}

export interface OneDevResponse<T> {
  ok: boolean
  status: number
  data: T
  raw: string
}

/** Errors thrown for network / non-2xx-class failures. */
export class OneDevApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly method: string,
    public readonly path: string,
    public readonly body: ApiErrorBody | null,
  ) {
    super(`OneDev API ${method} ${path} -> HTTP ${status}: ${body?.message ?? body?.error ?? 'request failed'}`)
    this.name = 'OneDevApiError'
  }
}

interface InternalOptions {
  query?: Record<string, string | number | boolean | undefined | null>
  body?: unknown
  /** Send the body verbatim as raw text (no JSON.stringify), used for endpoints
   * such as `POST /users/{id}/password` that take the raw request text as the
   * value instead of a JSON-deserialized string. */
  rawBody?: string
  headers?: Record<string, string>
  timeoutMs?: number
}

export class OneDevClient {
  readonly baseUrl: string
  readonly apiBase: string
  readonly authType: 'token' | 'password'
  readonly token: string
  readonly username: string
  readonly password: string
  readonly timeoutMs: number
  readonly readonly: boolean
  private readonly extraHeaders: Record<string, string>

  constructor(private readonly config: Config) {
    this.baseUrl = config.onedevUrl
    // OneDev serves its REST API under `/~api` (the interactive docs live at
    // `/~help/api`). Override only if your deployment mounts it elsewhere.
    this.apiBase = (config.apiBase || '/~api').replace(/\/+$/, '')
    this.authType = config.authType
    this.token = config.onedevToken
    this.username = config.username
    this.password = config.password
    this.timeoutMs = config.apiTimeoutMs
    this.readonly = config.readonly
    this.extraHeaders = config.extraHeaders
  }

  /** The `Authorization` header value for the configured auth mode. */
  buildAuthorization(): string | undefined {
    try {
      return buildAuthHeader({
        onedevUrl: this.baseUrl,
        authType: this.authType,
        onedevToken: this.token,
        username: this.username,
        password: this.password,
        apiBase: this.apiBase,
      })
    } catch {
      return undefined
    }
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    opts: InternalOptions = {},
    optsForbidden?: { allowReadonly?: boolean },
  ): Promise<OneDevResponse<T>> {
    if (this.readonly && method !== 'GET' && method !== 'HEAD') {
      throw new OneDevApiError(
        403,
        method,
        path,
        { message: 'dsh-onedev-mcp is running in read-only mode; mutating requests are refused' },
      )
    }
    const query = opts.query
    const url = new URL(`${this.baseUrl}${this.apiBase}${path}`)
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
      }
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? this.timeoutMs)
    let res: Response
    try {
      const authorization = this.buildAuthorization()
      const hasBody = opts.body !== undefined
      const hasRawBody = opts.rawBody !== undefined
      const contentType = hasRawBody ? 'text/plain; charset=utf-8' : hasBody ? 'application/json' : undefined
      res = await fetch(url, {
        method,
        headers: {
          ...(authorization ? { Authorization: authorization } : {}),
          Accept: 'application/json',
          ...(contentType ? { 'Content-Type': contentType } : {}),
          ...this.extraHeaders,
          ...opts.headers,
        },
        body: hasRawBody ? opts.rawBody : hasBody ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      })
    } catch (err) {
      const aborted = (err as Error).name === 'AbortError'
      throw new OneDevApiError(
        0,
        method,
        path,
        { message: aborted ? `request timed out after ${opts.timeoutMs ?? this.timeoutMs}ms` : (err as Error).message },
      )
    } finally {
      clearTimeout(timer)
    }

    const raw = await res.text()
    let data: unknown = null
    if (raw !== '') {
      try { data = JSON.parse(raw) } catch { data = raw }
    }
    if (!res.ok) {
      throw new OneDevApiError(
        res.status,
        method,
        path,
        (typeof data === 'object' && data !== null ? data as ApiErrorBody : { message: raw || res.statusText }) as ApiErrorBody,
      )
    }
    return { ok: true, status: res.status, data: data as T, raw }
  }

  // ---- generic access (the "直连" primitive) ---------------------------------

  /** Perform an arbitrary authenticated OneDev REST call. */
  request_<T = unknown>(
    method: string,
    path: string,
    opts?: InternalOptions,
  ): Promise<OneDevResponse<T>> {
    return this.request<T>(method, path, opts)
  }

  get<T>(path: string, query?: InternalOptions['query']): Promise<OneDevResponse<T>> {
    return this.request<T>('GET', path, { query })
  }
  post<T>(path: string, body?: unknown, query?: InternalOptions['query']): Promise<OneDevResponse<T>> {
    return this.request<T>('POST', path, { body, query })
  }
  /** POST a raw string body verbatim (not JSON-encoded). OneDev password
   * endpoints treat the raw request text as the value. */
  postRaw<T>(path: string, rawBody: string, query?: InternalOptions['query']): Promise<OneDevResponse<T>> {
    return this.request<T>('POST', path, { rawBody, query })
  }
  put<T>(path: string, body?: unknown, query?: InternalOptions['query']): Promise<OneDevResponse<T>> {
    return this.request<T>('PUT', path, { body, query })
  }
  delete<T>(path: string, query?: InternalOptions['query']): Promise<OneDevResponse<T>> {
    return this.request<T>('DELETE', path, { query })
  }
}