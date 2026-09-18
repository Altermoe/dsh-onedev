/**
 * Group + membership administration tools.
 *
 * Maps to `GroupResource` (`/groups`) and `MembershipResource` (`/memberships`).
 * Grants/revokes membership (including making a user an administrator) are done
 * through membership tools in this module, because OneDev models "is admin" as
 * membership in the built-in `Administrators` group.
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'
import { OneDevApiError } from '../client.js'
import type { OneDevClient } from '../client.js'

const groupId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .describe('Numeric group id')

interface GroupRow { id: number; name?: string; [k: string]: unknown }

/**
 * Resolve a group id from its name across OneDev versions. Modern OneDev
 * exposes `GET /groups/ids/{name}`; older releases do not, so we fall back to
 * the group list (`GET /groups?name=...`) and match the exact name.
 */
async function resolveGroupId(client: OneDevClient, name: string): Promise<number> {
  try {
    const byName = await client.get<number>('/groups/ids/' + encodeURIComponent(name))
    return byName.data
  } catch (err) {
    if (!(err instanceof OneDevApiError) || err.status !== 404) throw err
    const rows = await client.get<GroupRow[]>('/groups', { name, offset: 0, count: 1000 })
    const hit = rows.data.find((r) => r && r.name === name)
    if (!hit) throw new OneDevApiError(404, 'GET', '/groups/ids/' + name, { message: `No group named "${name}"` })
    return hit.id
  }
}

export const groupTools: ToolDefinition[] = [
  tool(
    'groups_list',
    'List Groups',
    'List groups, optionally filtered by name, with paging.',
    z.object({
      name: z.string().optional(),
      offset: z.number().int().min(0).default(0),
      count: z.number().int().min(1).max(1000).default(100),
    }),
    (c, a) => c.get<unknown[]>('/groups', {
      name: a.name as string | undefined,
      offset: a.offset as number,
      count: a.count as number,
    }).then((r) => r.data),
  ),

  tool(
    'group_get',
    'Get Group by ID',
    'Get a single group by numeric id.',
    z.object({ id: groupId }),
    (c, a) => c.get(`/groups/${a.id}`).then((r) => r.data),
  ),

  tool(
    'group_get_id',
    'Get Group ID by Name',
    'Resolve a group numeric id from the group name.',
    z.object({ name: z.string().min(1) }),
    (c, a) => resolveGroupId(c, a.name as string),
  ),

  tool(
    'group_create',
    'Create Group',
    'Create a new group.',
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
    }),
    (c, a) => c.post('/groups', {
      name: a.name,
      description: a.description,
    }).then((r) => ({ id: r.data })),
  ),

  tool(
    'group_update',
    'Update Group',
    'Update the name/description of a group.',
    z.object({
      id: groupId,
      name: z.string().min(1),
      description: z.string().nullish(),
    }),
    (c, a) => c.post(`/groups/${a.id}`, {
      name: a.name,
      description: a.description,
    }).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),

  tool(
    'group_delete',
    'Delete Group',
    'Delete a group by numeric id.',
    z.object({ id: groupId }),
    (c, a) => c.delete(`/groups/${a.id}`).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),

  tool(
    'group_members_list',
    'List Group Memberships',
    'List membership records of a group (which users are in the group and their excess privileges).',
    z.object({ id: groupId }),
    (c, a) => c.get(`/groups/${a.id}/memberships`).then((r) => r.data),
  ),

  tool(
    'group_members_add',
    'Add User to Group',
    'Add a user to a group. Provide both numeric user and group ids. To grant administrator privileges, add the user to the "Administrators" group.',
    z.object({
      userId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
      groupId: groupId,
    }),
    (c, a) => c.post('/memberships', {
      user: { id: a.userId },
      group: { id: a.groupId },
    }).then((r) => ({ membershipId: r.data })),
  ),

  tool(
    'group_members_remove',
    'Remove User from Group',
    'Remove a membership record (user from a group). You normally get the membership id from group_members_list / user_memberships.',
    z.object({
      membershipId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
    }),
    (c, a) => c.delete(`/memberships/${a.membershipId}`).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),
]