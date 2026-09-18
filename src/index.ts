/**
 * dsh-onedev-mcp — entry point.
 *
 * Builds the MCP server, registers every admin tool plus the standalone OneDev
 * documentation tools, and serves them over the configured transport:
 *   - `stdio` (default): for the DSH `@deepseek-ai/dsh-mcp-client` plugin and
 *     other stdio MCP clients.
 *   - `streamable-http`: an HTTP/JSON-RPC server for remote clients (path /mcp).
 *
 * This module is transport-agnostic; the concrete launchers live in
 * `src/cli.ts` (stdio + HTTP dispatch) and the `bin/dsh-onedev-mcp.mjs` shim.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { OneDevClient } from './client.js'
import { TOOLS } from './tools/index.js'
import { safeError } from './tools/types.js'
import type { Config } from './config.js'

export { loadConfig, type Config, type AuthType, type TransportKind, resolveConfigFile, redactConfig, listEnvironments, describeEnvironment, type EnvironmentDescriptor } from './config.js'
export { OneDevClient, OneDevApiError } from './client.js'
export { TOOLS, describeTools } from './tools/index.js'
export { startHttpServer } from './http-server.js'
export { probeOneDev, buildAuthHeader, type ProbeOutcome } from './auth.js'
export {
  loadEnvironmentStore, saveEnvironment, deleteEnvironment, setPrimary, clearStoredConfig,
  isValidSlug, defaultConfigFile, type StoredConfig, type EnvironmentStore,
} from './storage.js'

export const VERSION = '0.1.0'

/**
 * Per-tool resolution of the server configuration. The provider is invoked once
 * per tool call so the server picks up credential-store changes (the OneDev
 * settings tab) on the next call — no restart needed, and no boot-time fatal
 * when the store is still empty.
 */
export type ResolvedConfig = { ok: true; config: Config } | { ok: false; error: string }

/** Lazily produce the runtime configuration for one tool call and environment. */
export type ConfigProvider = (envName?: string) => ResolvedConfig

/** Shared `environment` slot merged into every connection-backed tool's schema. */
const ENV_PARAM = z.object({
  environment: z
    .string()
    .min(1)
    .max(32)
    .optional()
    .describe(
      'Target OneDev environment slug (see onedev_list_environments). ' +
        'Defaults to the primary environment; pass it to address a specific server unambiguously.',
    ),
})

/** Build and register the MCP server; does not connect any transport yet. */
export function buildServer(provider: ConfigProvider): McpServer {
  const server = new McpServer(
    { name: 'dsh-onedev-mcp', version: VERSION },
    { capabilities: { tools: {} } },
  )

  for (const def of TOOLS) {
    const standalone = def.standalone === true
    // Standalone tools need no connection and gain no `environment` param.
    const inputSchema = standalone
      ? def.inputSchema
      : ENV_PARAM.merge(def.inputSchema as z.ZodObject<never>)
    const description = standalone
      ? def.description
      : [
          def.description,
          '',
          'You may target a specific configured OneDev environment with the optional ' +
            '`environment` param (a slug). Leave it out to use the primary environment. ' +
            'Call onedev_list_environments to see the configured slugs.',
        ].join('\n')

    server.registerTool(
      def.name,
      {
        title: def.title,
        description,
        inputSchema,
      },
      async (args) => {
        // Standalone tools (docs/env discovery) need no OneDev connection; every
        // other tool resolves config per call for the requested environment so
        // store edits apply without restart.
        let client: OneDevClient | null = null
        if (!standalone) {
          const a = args as Record<string, unknown>
          const envName = typeof a.environment === 'string' ? a.environment : undefined
          const resolved = provider(envName)
          if (!resolved.ok) {
            return {
              isError: true,
              content: [{ type: 'text' as const, text: notConfiguredMessage(resolved.error) }],
            }
          }
          client = new OneDevClient(resolved.config)
        }
        try {
          // The `environment` param is routing-only metadata: it selects WHICH
          // OneDev server to talk to and must never leak into the tool's logical
          // arguments. If it were forwarded, tools that pass their whole args
          // object as the HTTP body (project_create, access_token_create, …)
          // would send `environment` to OneDev, which rejects it with
          // `HTTP 400: Unrecognized field "environment"`. Strip it here, once,
          // for every tool.
          const { environment: _routing, ...logical } = (args ?? {}) as Record<string, unknown>
          // Standalone tools never dereference the client, so the cast is safe.
          const value = await def.run(client as OneDevClient, logical)
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
          }
        } catch (err) {
          return {
            isError: true,
            content: [{ type: 'text' as const, text: `dsh-onedev-mcp error: ${safeError(err)}` }],
          }
        }
      },
    )
  }

  return server
}

/** Human-readable guidance shown by every tool before the connection is saved. */
function notConfiguredMessage(error: string): string {
  return (
    'dsh-onedev-mcp: not configured (' + error + '). ' +
    'Open dsh Settings → OneDev, add an environment (server URL and administrator account), and Save. ' +
    'The change is picked up by the next tool call — no restart required.'
  )
}