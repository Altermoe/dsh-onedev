/**
 * Build log retrieval.
 *
 * OneDev does **not** expose `/builds/{id}/log`; that path is a common guess and
 * answers HTTP 404. The real API is `BuildLogStreamResource` at
 * `GET /streaming/build-logs/{buildId}`, which produces
 * `application/octet-stream` — a length-prefixed binary stream, not JSON:
 *
 *   - 4-byte big-endian signed length; then
 *   - negative length → a status frame whose payload is the build status name;
 *   - zero length     → a keepalive tick (ignored);
 *   - positive length → that many UTF-8 bytes of a JSON `LogEntry`
 *                       (`{date, messages: [{style, text}]}`).
 *
 * A finished build writes its status frame first, then every entry, then the
 * status frame again and closes. This tool decodes that framing into readable
 * lines so the model gets the log instead of an opaque binary blob.
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'

const buildId = z
  .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .describe('Numeric build id — this is NOT the build number. Resolve it with builds_list/build_get.')

export interface DecodedLogEntry {
  date: string
  text: string
}

export interface DecodedBuildLog {
  /** Last status frame seen (e.g. `FAILED`, `SUCCESSFUL`, `RUNNING`). */
  status: string | null
  entries: DecodedLogEntry[]
  /** The byte buffer ended in the middle of a frame (partial/truncated stream). */
  incomplete: boolean
}

const decoder = new TextDecoder('utf-8', { fatal: false })

/** Decode OneDev's length-prefixed build-log stream into structured entries. */
export function decodeBuildLog(bytes: Uint8Array): DecodedBuildLog {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const entries: DecodedLogEntry[] = []
  let status: string | null = null
  let offset = 0

  while (offset + 4 <= bytes.byteLength) {
    const length = view.getInt32(offset, false)
    offset += 4

    if (length < 0) {
      const size = -length
      if (offset + size > bytes.byteLength) break
      status = decoder.decode(bytes.subarray(offset, offset + size))
      offset += size
      continue
    }
    if (length === 0) continue
    if (offset + length > bytes.byteLength) break

    const json = decoder.decode(bytes.subarray(offset, offset + length))
    offset += length
    try {
      const parsed = JSON.parse(json) as { date?: unknown; messages?: unknown }
      const date = typeof parsed.date === 'string' ? parsed.date : ''
      let text = ''
      if (Array.isArray(parsed.messages)) {
        text = parsed.messages
          .map((message) => {
            if (message && typeof message === 'object' && typeof (message as { text?: unknown }).text === 'string') {
              return (message as { text: string }).text
            }
            return ''
          })
          .join('')
      }
      entries.push({ date, text })
    } catch {
      // A frame that is not valid JSON is skipped rather than failing the call.
    }
  }

  return { status, entries, incomplete: offset < bytes.byteLength }
}

export const buildLogTools: ToolDefinition[] = [
  tool(
    'build_log',
    'Get Build Log',
    [
      'Fetch and decode the log of a build. OneDev streams logs from',
      '`GET /streaming/build-logs/{buildId}` (resource `BuildLogStreamResource`) as',
      'an `application/octet-stream` length-prefixed binary stream — there is NO',
      '`/builds/{id}/log` endpoint (that path returns HTTP 404). This tool performs',
      'the correct request with `Accept: application/octet-stream`, decodes the',
      'framing into readable lines, and reports the build status. `id` is the numeric',
      'build **id**, not the build number: resolve it with `builds_list` or `build_get`.',
      'Use `tail: true` to get the end of a long log (useful for failures).',
    ].join(' '),
    z.object({
      id: buildId,
      maxEntries: z
        .number()
        .int()
        .min(1)
        .max(5000)
        .default(500)
        .describe('Maximum number of log lines to return (default 500)'),
      tail: z
        .boolean()
        .default(false)
        .describe('Return the last `maxEntries` lines instead of the first ones'),
    }),
    async (client, args) => {
      const res = await client.getBinary(`/streaming/build-logs/${args.id}`, {
        accept: 'application/octet-stream',
      })
      const decoded = decodeBuildLog(res.bytes)
      const maxEntries = args.maxEntries as number
      const tail = args.tail as boolean
      const selected = tail
        ? decoded.entries.slice(Math.max(0, decoded.entries.length - maxEntries))
        : decoded.entries.slice(0, maxEntries)

      return {
        buildId: args.id,
        status: decoded.status,
        entryCount: decoded.entries.length,
        returned: selected.length,
        tail,
        truncated: res.truncated || res.timedOut || decoded.incomplete,
        timedOut: res.timedOut,
        contentType: res.contentType,
        log: selected.map((entry) => (entry.date ? `${entry.date} ${entry.text}` : entry.text)).join('\n'),
      }
    },
  ),
]
