/**
 * Shared tool plumbing: the shape every tool definition follows and helpers
 * to build schema + handlers with consistent result formatting.
 */

import { z } from 'zod'
import { OneDevApiError } from '../client.js'
import type { OneDevClient } from '../client.js'

/** A single MCP tool exposed by the server. */
export interface ToolDefinition {
  /** Public tool name (MCP raw name). Namespace: `onedev__` handled by the client bridge. */
  name: string
  title: string
  description: string
  /** zod object schema for the input arguments. */
  inputSchema: z.ZodTypeAny
  /**
   * True when the tool works without a configured OneDev connection (the docs
   * tools talk to https://docs.onedev.io/ directly). Standalone tools skip the
   * "not configured" gate and are invoked with a null client.
   */
  standalone?: boolean
  /** Execute the tool. Must return a JSON-serializable value. */
  run: (client: OneDevClient, args: Record<string, unknown>) => Promise<unknown>
}

/** Build a tool definition from a zod schema and handler. */
export function tool(
  name: string,
  title: string,
  description: string,
  inputSchema: z.ZodTypeAny,
  run: (client: OneDevClient, args: Record<string, unknown>) => Promise<unknown>,
  options?: {
    readOnly?: boolean
    standalone?: boolean
  },
): ToolDefinition {
  return { name, title, description, inputSchema, run, standalone: options?.standalone === true ? true : undefined }
}

/** Wrap a handler so the thrown errors bubble to a readable MCP result. */
export const safeError = (err: unknown): string =>
  err instanceof Error ? err.message : String(err)

/**
 * Normalise a list-tool `query` argument. OneDev parses list `query` params with
 * a strict criteria grammar, so empty or whitespace-only values would be
 * rejected (HTTP 406 "Invalid query"). We collapse them to `undefined` so the
 * client omits the param entirely and lists everything.
 */
export function normalizeQuery(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined
  const trimmed = raw.trim()
  return trimmed === '' ? undefined : trimmed
}

/**
 * Wrap a list handler that forwards a user-authored `query` string to OneDev.
 * OneDev rejects anything that is not valid criteria grammar with
 * `HTTP 406 Invalid query` (or `400`/`500` for bad fields). That raw error tells
 * the caller nothing, so this wrapper adds a proactive, constructive hint about
 * the expected grammar instead of surfacing a bare failure.
 */
export function withListQueryHint(
  fn: (client: OneDevClient, args: Record<string, unknown>) => Promise<unknown>,
  hint: string,
): (client: OneDevClient, args: Record<string, unknown>) => Promise<unknown> {
  return async (client, args) => {
    try {
      return await fn(client, args)
    } catch (err) {
      const isInvalidQuery =
        err instanceof OneDevApiError &&
        (err.status === 406 || (err.status === 400 && /invalid query/i.test(err.message)))
      if (isInvalidQuery) {
        throw new Error(
          `${err.message}\n\n` +
            'The `query` value was not accepted by OneDev. The `query` parameter uses a strict ' +
            'criteria grammar (a quoted field name next to an operator), not free-text search. ' +
            `${hint.trim()} Omit \`query\` to list everything.`,
        )
      }
      throw err
    }
  }
}