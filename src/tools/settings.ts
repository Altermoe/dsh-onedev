/**
 * Global server settings + server info.
 *
 * Maps to `SettingResource` (`/settings`) and `ServerResource` (`/server/version`).
 * Most OneDev settings are large tree objects, so we expose them as semi-generic
 * tools keyed by a setting name rather than dozens of one-line wrappers.
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'
import { OneDevApiError } from '../client.js'

const settingName = z.enum([
  'system',
  'authenticator',
  'backup',
  'build',
  'groovy-scripts',
  'issue',
  'job-executors',
  'mail-service',
  'service-desk',
  'notification-template',
  'project',
  'pull-request',
  'workspace',
  'security',
  'ssh',
  'contributed-settings',
])

const id = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
const genericId = id.describe('Numeric id')

export const settingTools: ToolDefinition[] = [
  tool(
    'server_version',
    'Server Version',
    'Get the OneDev server version running on the configured instance, if the instance exposes it.',
    z.object({}),
    (c) =>
      c.get('/server/version')
        .then((r) => ({ version: r.data as string }))
        .catch((err) => {
          // Older OneDev releases did not expose /server/version; degrade to a
          // clear note instead of a hard error.
          if (err instanceof OneDevApiError && err.status === 404) {
            return { version: null, note: 'This OneDev instance does not expose /server/version.' }
          }
          throw err
        }),
  ),

  tool(
    'setting_get',
    'Get Global Setting',
    'Read one global server setting by name (system, security, build, issue, job-executors, mail-service, etc.).',
    z.object({ name: settingName }),
    (c, a) => c.get(`/settings/${a.name}`).then((r) => r.data),
  ),

  tool(
    'setting_update',
    'Update Global Setting',
    'Replace a global server setting by name. The `body` must be the full setting object as returned by setting_get for that name.',
    z.object({
      name: settingName,
      body: z.unknown().describe('The complete setting object to store'),
    }),
    (c, a) => c.post(`/settings/${a.name}`, a.body).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),

  tool(
    'access_token_create',
    'Create Access Token',
    'Create a new access token. Body should carry name, permissions and users as OneDev expects.',
    z.object({
      name: z.string().min(1),
      permissions: z.array(z.unknown()).optional(),
      users: z.array(z.unknown()).optional(),
    }),
    (c, a) => c.post('/access-tokens', a).then((r) => ({ id: r.data })),
  ),

  tool(
    'access_token_delete',
    'Delete Access Token',
    'Delete an access token by numeric id.',
    z.object({ id: genericId }),
    (c, a) => c.delete(`/access-tokens/${a.id}`).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),
]