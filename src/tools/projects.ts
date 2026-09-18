/**
 * Project administration tools.
 *
 * Maps to `ProjectResource` (`/projects`). Create/update/delete projects,
 * list them, and read their settings and clone URLs.
 */

import { z } from 'zod'
import { tool, normalizeQuery, withListQueryHint, type ToolDefinition } from './types.js'

const projectId = z.union([z.number().int().positive(), z.string().regex(/^\d+$/)])
  .describe('Numeric project id')

const projectCreate = z.object({
  name: z.string().min(1),
  key: z.string().optional().describe('Short unique key'),
  description: z.string().optional(),
  parentId: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]).nullish(),
  forkedFromId: z
    .union([z.number().int().positive(), z.string().regex(/^\d+$/)])
    .nullish()
    .describe('Id of the project this one is forked from (optional)'),
  codeManagement: z.boolean().optional(),
  packManagement: z.boolean().optional(),
  issueManagement: z.boolean().optional(),
  timeTracking: z.boolean().optional(),
  serviceDeskEmailAddress: z.string().nullish(),
  gitPackConfig: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Git pack config. OneDev requires it non-null; if omitted it is sent as an empty {} object'),
  codeAnalysisSetting: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Code-analysis config. OneDev requires it non-null; if omitted it is sent as an empty {} object'),
})

export const projectTools: ToolDefinition[] = [
  tool(
    'projects_list',
    'List Projects',
    'List projects using the strict OneDev projects-page search criteria grammar, with paging. '
      + 'Omit `query` to list all projects.',
    z.object({
      query: z.string().optional().describe(
        'OneDev criteria string, e.g. `"Name" is "my-project"`. This is NOT free-text search: '
        + 'a bare word is rejected by OneDev (HTTP 406 Invalid query).'),
      offset: z.number().int().min(0).default(0),
      count: z.number().int().min(1).max(1000).default(100),
    }),
    withListQueryHint(
      (c, a) => c.get<unknown[]>('/projects', {
        query: normalizeQuery(a.query),
        offset: a.offset as number,
        count: a.count as number,
      }).then((r) => r.data),
      'For projects use a quoted field such as `"Name" is "my-project"` (exact match).',
    ),
  ),

  tool(
    'project_get',
    'Get Project by ID',
    'Get a project and its top-level fields by numeric id.',
    z.object({ id: projectId }),
    (c, a) => c.get(`/projects/${a.id}`).then((r) => r.data),
  ),

  tool(
    'project_get_id',
    'Get Project ID by Path',
    'Resolve a project numeric id from its path (e.g. "group/subgroup/name").',
    z.object({ path: z.string().min(1) }),
    (c, a) => c.get(`/projects/ids/${(a.path as string).split('/').map(encodeURIComponent).join('/')}`).then((r) => r.data),
  ),

  tool(
    'project_get_clone_url',
    'Get Project Clone URLs',
    'Get HTTP/SSH clone URLs of a project.',
    z.object({ id: projectId }),
    (c, a) => c.get(`/projects/${a.id}/clone-url`).then((r) => r.data),
  ),

  tool(
    'project_get_setting',
    'Get Project Settings',
    'Get the full project setting (build, issue, pull request, workspaces, named queries).',
    z.object({ id: projectId }),
    (c, a) => c.get(`/projects/${a.id}/setting`).then((r) => r.data),
  ),

  tool(
    'project_create',
    'Create Project',
    'Create a new project. At minimum provide a name; see the schema for optional flags. '
      + 'OneDev requires a non-null gitPackConfig and codeAnalysisSetting, so the tool sends '
      + 'an empty {} for each when you do not supply one.',
    projectCreate,
    (c, a) => {
      const body = {
        ...a,
        gitPackConfig: a.gitPackConfig ?? {},
        codeAnalysisSetting: a.codeAnalysisSetting ?? {},
      }
      return c.post('/projects', body).then((r) => ({ id: r.data }))
    },
  ),

  tool(
    'project_update',
    'Update Project',
    'Update top-level project fields (name, description, parent, enabled modules).',
    projectCreate.partial().extend({
      id: z.union([z.number().int().positive(), z.string().regex(/^\d+$/)]),
    }),
    (c, a) => {
      const { id, ...body } = a
      if (body.gitPackConfig === undefined) body.gitPackConfig = {}
      if (body.codeAnalysisSetting === undefined) body.codeAnalysisSetting = {}
      return c.post(`/projects/${id}`, body).then((r) => ({ ok: true, status: r.status, message: 'done' }))
    },
  ),

  tool(
    'project_delete',
    'Delete Project',
    'Delete a project and all of its data by numeric id. Irreversible.',
    z.object({ id: projectId }),
    (c, a) => c.delete(`/projects/${a.id}`).then((r) => ({ ok: true, status: r.status, message: 'done' })),
  ),

  tool(
    'project_get_user_authorizations',
    'List Project User Permissions',
    'List explicit user authorizations (roles) granted on a project.',
    z.object({ id: projectId }),
    (c, a) => c.get(`/projects/${a.id}/user-authorizations`).then((r) => r.data),
  ),

  tool(
    'project_get_group_authorizations',
    'List Project Group Permissions',
    'List explicit group authorizations (roles) granted on a project.',
    z.object({ id: projectId }),
    (c, a) => c.get(`/projects/${a.id}/group-authorizations`).then((r) => r.data),
  ),
]