/**
 * User administration tools.
 *
 * Maps to `io.onedev.server.rest.resource.UserResource` (`/users`). Most
 * mutating endpoints require the authenticated access token to belong to an
 * administrator.
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'

const id = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
const userId = id.describe('Numeric user id')
const userType = z.enum(['ORDINARY', 'SERVICE', 'AI']).default('ORDINARY')

const okText = 'done'

export const userTools: ToolDefinition[] = [
  tool(
    'users_list',
    'List Users',
    'List users matching a search term, with paging. Returns an array of user objects.',
    z.object({
      term: z.string().optional().describe('Any string in login name, full name or email address'),
      offset: z.number().int().min(0).default(0),
      count: z.number().int().min(1).max(1000).default(100),
    }),
    (c, a) => c.get<unknown[]>('/users', {
      term: a.term as string | undefined,
      offset: a.offset as number,
      count: a.count as number,
    }).then((r) => r.data),
  ),

  tool(
    'user_get',
    'Get User by ID',
    'Get a single user (with id, name, fullName, authentication details) by numeric id.',
    z.object({ id: userId }),
    (c, a) => c.get(`/users/${a.id}`).then((r) => r.data),
  ),

  tool(
    'user_get_id',
    'Get User ID by Login Name',
    'Resolve a user numeric id from the login name.',
    z.object({ name: z.string().min(1) }),
    (c, a) => c.get(`/users/ids/${encodeURIComponent(a.name as string)}`).then((r) => r.data),
  ),

  tool(
    'user_create',
    'Create User',
    'Create a new user. Ordinary users need a password and emailAddress; service/AI accounts do not.',
    z.object({
      name: z.string().min(1).describe('Login name'),
      type: userType,
      fullName: z.string().optional(),
      password: z.string().optional().describe('Required for ORDINARY users'),
      emailAddress: z.string().optional().describe('Required for ORDINARY users'),
      notifyOwnEvents: z.boolean().optional(),
      aiSetting: z.record(z.string(), z.unknown()).nullish(),
    }),
    (c, a) => c.post('/users', {
      name: a.name,
      type: a.type,
      fullName: a.fullName,
      password: a.password,
      emailAddress: a.emailAddress,
      notifyOwnEvents: a.notifyOwnEvents,
      aiSetting: a.aiSetting,
    }).then((r) => ({ id: r.data })),
  ),

  tool(
    'user_update',
    'Update User',
    'Update the login name, full name, notify-own-events and keep-email-private for an existing user.',
    z.object({
      id: userId,
      name: z.string().min(1).describe('New login name'),
      fullName: z.string().nullish(),
      notifyOwnEvents: z.boolean().optional(),
      keepEmailAddressesPrivate: z.boolean().nullish(),
    }),
    (c, a) => c.post(`/users/${a.id}`, {
      name: a.name,
      fullName: a.fullName,
      notifyOwnEvents: a.notifyOwnEvents,
      keepEmailAddressesPrivate: a.keepEmailAddressesPrivate,
    }).then((r) => ({ ok: true, status: r.status, message: okText })),
  ),

  tool(
    'user_disable',
    'Disable User',
    'Disable (lock out) a normal (non-root) user.',
    z.object({ id: userId }),
    (c, a) => c.post(`/users/${a.id}/disable`).then((r) => ({ ok: true, status: r.status, message: okText })),
  ),

  tool(
    'user_enable',
    'Enable User',
    'Re-enable a previously disabled normal (non-root) user.',
    z.object({ id: userId }),
    (c, a) => c.post(`/users/${a.id}/enable`).then((r) => ({ ok: true, status: r.status, message: okText })),
  ),

  tool(
    'user_set_password',
    'Set User Password',
    'Set the password of an ORDINARY user.',
    z.object({ id: userId, password: z.string().min(8) }),
    // OneDev reads the raw request body text as the password (it does not
    // JSON-deserialize a string), so we POST the password verbatim rather than
    // JSON-encoded to avoid ending up with a password wrapped in quotes.
    (c, a) => c.postRaw(`/users/${a.id}/password`, a.password as string).then((r) => ({ ok: true, status: r.status, message: okText })),
  ),

  tool(
    'user_convert_to_service_account',
    'Convert User to Service Account',
    'Convert a normal user into a service account.',
    z.object({ id: userId }),
    (c, a) => c.post(`/users/${a.id}/convert-to-service-account`).then((r) => ({ ok: true, status: r.status, message: okText })),
  ),

  tool(
    'user_reset_2fa',
    'Reset Two-Factor Authentication',
    'Reset two-factor authentication for a user (administrator only).',
    z.object({ id: userId }),
    (c, a) => c.delete(`/users/${a.id}/two-factor-authentication`).then((r) => ({ ok: true, message: okText })),
  ),

  tool(
    'user_access_tokens',
    'List User Access Tokens',
    'List access tokens created for a user.',
    z.object({ id: userId }),
    (c, a) => c.get(`/users/${a.id}/access-tokens`).then((r) => r.data),
  ),

  tool(
    'user_ssh_keys',
    'List User SSH Keys',
    'List SSH keys of a user.',
    z.object({ id: userId }),
    (c, a) => c.get(`/users/${a.id}/ssh-keys`).then((r) => r.data),
  ),

  tool(
    'user_email_addresses',
    'List User Email Addresses',
    'List email addresses of a user.',
    z.object({ id: userId }),
    (c, a) => c.get(`/users/${a.id}/email-addresses`).then((r) => r.data),
  ),

  tool(
    'user_memberships',
    'List User Memberships',
    'List groups a user belongs to, plus optional role (project membership) info.',
    z.object({ id: userId }),
    (c, a) => c.get(`/users/${a.id}/memberships`).then((r) => r.data),
  ),
]