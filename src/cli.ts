/**
 * CLI entry — dispatches to stdio, streamable-http transports, or the setup
 * console (account/password config GUI).
 */

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { loadConfig } from './config.js'
import { buildServer, type ConfigProvider } from './index.js'
import { startHttpServer, logReady } from './http-server.js'
import { startSetupServer } from './setup/server.js'

/**
 * Resolve the runtime configuration for one environment on every tool call.
 * Env vars win when set (CI/server pinning) for the primary environment;
 * otherwise the environment's values written by the OneDev settings tab drive
 * it. A still-empty store degrades to a per-call "not configured" tool result
 * instead of a boot-time fatal.
 */
function storeProvider(env: NodeJS.ProcessEnv): ConfigProvider {
  return (envName?: string) => {
    try {
      return { ok: true, config: loadConfig(env, envName) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }
}

async function runStdio(): Promise<void> {
  const server = buildServer(storeProvider(process.env))
  const transport = new StdioServerTransport()
  await server.connect(transport)
  // Stdio keeps the process alive until stdin closes.
  await new Promise<void>(() => {})
}

async function runHttp(): Promise<void> {
  const provider = storeProvider(process.env)
  const server = buildServer(provider)
  const base = provider()
  const host = base.ok ? base.config.httpHost : '127.0.0.1'
  const port = base.ok ? base.config.httpPort : 8765
  const handle = await startHttpServer(server, { host, port })
  logReady({ port: handle.port })
  const shutdown = async (): Promise<void> => {
    await handle.close()
    process.exit(0)
  }
  process.on('SIGINT', () => { void shutdown() })
  process.on('SIGTERM', () => { void shutdown() })
}

/**
 * Launch the setup console: a localhost GUI where the operator enters the
 * OneDev URL and either an access token or an account/password, validates the
 * connection, and persists the credentials to the store. The MCP server then
 * auto-authenticates (password mode uses Basic auth so no token is required).
 */
async function runSetup(): Promise<void> {
  const host = process.env['ONEDEV_MCP_HOST'] ?? '127.0.0.1'
  const port = Number(process.env['ONEDEV_MCP_PORT'] ?? '8770')
  const handle = await startSetupServer({ host, port })
  console.error(
    `dsh-onedev-mcp setup console listening on http://${host}:${handle.port}\n` +
    `  credential store: ${handle.configFile}\n` +
    '  open the URL in a browser to configure account/password; press Ctrl+C to exit.',
  )
  await new Promise<void>((resolve) => {
    const shutdown = (): void => { void handle.close().then(resolve) }
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  })
}

/** Parse `argv` (defaults to `process.argv.slice(2)`) for a setup request. */
export function wantsSetup(argv: string[]): boolean {
  if (argv.includes('--setup') || argv.includes('setup')) return true
  const mode = process.env['ONEDEV_MCP_COMMAND']?.trim().toLowerCase()
  return mode === 'setup' || mode === 'config'
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  if (wantsSetup(argv)) return runSetup()

  const mode = process.env['ONEDEV_MCP_TRANSPORT']?.trim().toLowerCase() ?? 'stdio'
  if (mode === 'streamable-http' || mode === 'http') await runHttp()
  else await runStdio()
}