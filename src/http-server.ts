/**
 * Streamable HTTP server bootstrap (Node `node:http`).
 *
 * One `StreamableHTTPServerTransport` is created per MCP session; the session id
 * (emitted by the SDK) keys a small registry so subsequent POST/GET/DELETE
 * requests reuse the same transport, exactly like the SDK's reference servers.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'

interface TransportEntry {
  transport: StreamableHTTPServerTransport
}

export interface HttpServerOptions {
  host: string
  port: number
  path?: string
  onClose?: () => void
}

export async function startHttpServer(
  server: McpServer,
  { host, port, path = '/mcp' }: HttpServerOptions,
): Promise<{ port: number; close: () => Promise<void> }> {
  const sessions = new Map<string, TransportEntry>()

  const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    const cleanPath = url.pathname.replace(/\/+$/, '') || '/'
    if (cleanPath !== path) {
      res.statusCode = 404
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ error: 'not found' }))
      return
    }

    const sessionId = req.headers['mcp-session-id']
    const sid = typeof sessionId === 'string' ? sessionId : undefined

    if (req.method === 'DELETE') {
      if (sid) {
        const entry = sessions.get(sid)
        if (entry) await entry.transport.close()
        sessions.delete(sid)
      }
      res.statusCode = 204
      res.end()
      return
    }

    if (req.method !== 'POST' && req.method !== 'GET') {
      res.statusCode = 405
      res.setHeader('content-type', 'application/json')
      res.setHeader('allow', 'GET, POST, DELETE')
      res.end(JSON.stringify({ error: 'method not allowed' }))
      return
    }

    // Reuse an existing session transport, or create a fresh stateful one.
    let entry = sid ? sessions.get(sid) : undefined
    let isNew = false
    if (!entry) {
      entry = { transport: new StreamableHTTPServerTransport({ sessionIdGenerator: () => crypto.randomUUID() }) }
      await server.connect(entry.transport)
      isNew = true
    }
    const transport = entry.transport

    await transport.handleRequest(req as never, res as never)

    // After `initialize` the SDK assigns the session id; register it.
    if (isNew && transport.sessionId) {
      sessions.set(transport.sessionId, entry)
    } else if (isNew && sid) {
      sessions.set(sid, entry)
    }
  })

  await new Promise<void>((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, host, () => resolve())
  })
  const actualPort = (httpServer.address() as { port: number }).port

  return {
    port: actualPort,
    close: async () => {
      await Promise.all([...sessions.values()].map((e) => e.transport.close().catch(() => undefined)))
      await new Promise<void>((resolve, reject) => httpServer.close((err) => (err ? reject(err) : resolve())))
    },
  }
}

/** Convenience: log the actual ready URL (used by the bin launcher). */
export function logReady(info: { port: number; path?: string }): void {
  const p = info.path ?? '/mcp'
  console.error(`dsh-onedev-mcp streamable-http listening on http://127.0.0.1:${info.port}${p}`)
}