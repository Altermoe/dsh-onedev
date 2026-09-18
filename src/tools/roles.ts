/**
 * Role administration tools.
 *
 * Maps to `RoleResource` (`/roles`). Roles bundle reusable permission sets that
 * can be assigned to users or groups for project-level access.
 */

import { z } from 'zod'
import { tool, type ToolDefinition } from './types.js'

const roleId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .describe('Numeric role id')

export const roleTools: ToolDefinition[] = [
  tool(
    'roles_list',
    'List Roles',
    'List roles, optionally filtered by name, with paging.',
    z.object({
      name: z.string().optional(),
      offset: z.number().int().min(0).default(0),
      count: z.number().int().min(1).max(1000).default(100),
    }),
    (c, a) => c.get<unknown[]>('/roles', {
      name: a.name as string | undefined,
      offset: a.offset as number,
      count: a.count as number,
    }).then((r) => r.data),
  ),

  tool(
    'role_get',
    'Get Role by ID',
    'Get a single role by numeric id.',
    z.object({ id: roleId }),
    (c, a) => c.get(`/roles/${a.id}`).then((r) => r.data),
  ),

  tool(
    'role_get_id',
    'Get Role ID by Name',
    'Resolve a role numeric id from its name.',
    z.object({ name: z.string().min(1) }),
    (c, a) => c.get(`/roles/ids/${encodeURIComponent(a.name as string)}`).then((r) => r.data),
  ),

  tool(
    'role_create',
    'Create Role',
    'Create a new role.',
    z.object({
      name: z.string().min(1),
      description: z.string().optional(),
      appRights: z.array(z.string()).optional().describe('Application-level permissions, e.g. ["manage_builds"]'),
      projectPrivileges: z.record(z.string(), z.array(z.string())).optional(),
      assignable: z.boolean().optional().describe('Whether the role can be assigned by non-administrators'),
      editable: z.boolean().optional().describe('Whether privilege changes are editable for non-administrators'),
    }),
    (c, a) => c.post('/roles', a).then((r) => ({ id: r.data })),
  ),

  tool(
    'role_update',
    'Update Role',
    'Update an existing role.',
    z.object({
      id: roleId,
      name: z.string().min(1),
      description: z.string().nullish(),
      appRights: z.array(z.string()).nullish(),
      projectPrivileges: z.record(z.string(), z.array(z.string())).nullish(),
      assignable: z.boolean().nullish(),
      editable: z.boolean().nullish(),
    }),
    (c, a) => {
      const { id, ...body } = a
      return c.post(`/roles/${id}`, body).then((r) => ({ ok: true, status: r.status, message: 'done' }))
    },
  ),

  tool(
    'role_delete',
    'Delete Role',
    'Delete a role by numeric id.',
    z.object({ id: roleId }),
    (c, a) => c.delete(`/roles/${a.id}`).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),
]