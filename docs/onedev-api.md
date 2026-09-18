# OneDev REST API reference (used by dsh-onedev-mcp)

The plugin drives OneDev's REST API. This page is a concise, maintained map of the
endpoints the **typed** tools use, plus how authentication works. The exhaustive,
per-install, interactive reference is shipped with your OneDev at:

```
http(s)://<your OneDev server url>/~help/api
```

In the OneDev source tree the resources live under
`server-core/src/main/java/io/onedev/server/rest/resource/`.

---

## Authentication

Every request is authenticated through one of OneDev's security filters. Two modes
are supported by the plugin:

**1. Bearer access token** (default, `ONEDEV_AUTH_TYPE` unset/`token`):

```
Authorization: Bearer <access token>
```

- The token is looked up by OneDev (`SecurityUtils.getBearerToken` + `AccessTokenService.findByValue`) —
  no username/password is required.
- The bearer filter binds whichever **user** owns the token, so the tool's effective
  permissions are that user's. Administrator-only endpoints require the token to
  belong to an administrator.

**2. Account + password** (`ONEDEV_AUTH_TYPE=password`):

```
Authorization: Basic base64(username:password)
```

- OneDev's `BasicAuthenticationFilter` first tries the username/password as access-token
  values, then falls back to a real Apache Shiro `UsernamePasswordToken` login. So a plain
  account's REST calls authenticate automatically — **no access token needs to be created
  first** (removing the "log in to mint a token" chicken-and-egg).
- The effective permissions are those of the logged-in account; admin endpoints still
  require the account to hold the administrator role.
- Because it is replayed on every request, prefer `https://` and never pass a password
  over plaintext HTTP on untrusted links.

A connection with invalid or expired credentials yields `401`/`403`; the plugin surfaces
the message in the tool result (`isError`).

Base URL shape: `ONEDEV_URL + ONEDEV_API_BASE + <path>`, where `ONEDEV_API_BASE` defaults to `/~api`
(OneDev mounts its REST API under `/~api`; the interactive docs live at `/~help/api`).

---

## Endpoint map

### Direct / meta
| Path | Method | Used by |
|---|---|---|
| `/server/version` | GET | `server_version` |

### Users — `UserResource` → `/users`
| Path | Method | Used by |
|---|---|---|
| `/users` | GET | `users_list` (term/offset/count) |
| `/users` | POST | `user_create` |
| `/users/{id}` | GET | `user_get` |
| `/users/{id}` | POST | `user_update` |
| `/users/ids/{name}` | GET | `user_get_id` |
| `/users/{id}/disable`, `/enable` | POST | `user_disable`, `user_enable` |
| `/users/{id}/password` | POST | `user_set_password` |
| `/users/{id}/convert-to-service-account` | POST | `user_convert_to_service_account` |
| `/users/{id}/two-factor-authentication` | DELETE | `user_reset_2fa` |
| `/users/{id}/access-tokens` | GET | `user_access_tokens` |
| `/users/{id}/ssh-keys` | GET | `user_ssh_keys` |
| `/users/{id}/email-addresses` | GET | `user_email_addresses` |
| `/users/{id}/memberships` | GET | `user_memberships` |

### Groups — `GroupResource` → `/groups`; memberships — `MembershipResource` → `/memberships`
| Path | Method | Used by |
|---|---|---|
| `/groups` | GET / POST | `groups_list`, `group_create` |
| `/groups/{id}` | GET / POST / DELETE | `group_get`, `group_update`, `group_delete` |
| `/groups/ids/{name}` | GET | `group_get_id` |
| `/groups/{id}/memberships` | GET | `group_members_list` |
| `/memberships` | POST | `group_members_add` |
| `/memberships/{id}` | DELETE | `group_members_remove` |

> **Admins**: OneDev models administrator status as membership of the built-in
> `Administrators` group. Add/remove a user there to grant/revoke administration.

### Roles — `RoleResource` → `/roles`
| Path | Method | Used by |
|---|---|---|
| `/roles` | GET / POST | `roles_list`, `role_create` |
| `/roles/{id}` | GET / POST / DELETE | `role_get`, `role_update`, `role_delete` |
| `/roles/ids/{name}` | GET | `role_get_id` |

### Projects — `ProjectResource` → `/projects`
| Path | Method | Used by |
|---|---|---|
| `/projects` | GET / POST | `projects_list`, `project_create` |
| `/projects/ids/{path}` | GET | `project_get_id` |
| `/projects/{id}` | GET / POST / DELETE | `project_get`, `project_update`, `project_delete` |
| `/projects/{id}/clone-url` | GET | `project_get_clone_url` |
| `/projects/{id}/setting` | GET | `project_get_setting` |
| `/projects/{id}/user-authorizations` | GET | `project_get_user_authorizations` |
| `/projects/{id}/group-authorizations` | GET | `project_get_group_authorizations` |

> **Create/update require non-null nested config.** `ProjectResource` validates
> `gitPackConfig` and `codeAnalysisSetting` as `@NotNull`, so a bare `{"name": ...}`
> is rejected with `400 must not be null`. `project_create`/`project_update` therefore
> send an empty `{}` for any of these keys you leave unset; pass an object to override.

### CI/CD agents & builds — `AgentResource`, `AgentTokenResource`, `BuildResource`
| Path | Method | Used by |
|---|---|---|
| `/agents` | GET | `agents_list` |
| `/agents/{id}` | GET | `agent_get` |
| `/agents/{id}/attributes` | GET / POST | `agent_attributes_get` / `agent_attributes_set` |
| `/agent-tokens` | GET / POST | `agent_tokens_list` / `agent_token_create` |
| `/agent-tokens/{id}` | DELETE | `agent_token_delete` |
| `/builds` | GET | `builds_list` |
| `/builds/{id}` | GET | `build_get` |
| `/builds/{id}/description` | POST | `build_set_description` |
| `/builds/{id}/labels` | GET | `build_labels` |

### Global settings — `SettingResource` → `/settings`; tokens — `AccessTokenResource` → `/access-tokens`
| Path | Method | Used by |
|---|---|---|
| `/settings/{name}` | GET | `setting_get` (`system`, `security`, `build`, `issue`, `project`, `job-executors`, `mail-service`, `ssh`, `backup`, `authenticator`, …) |
| `/settings/{name}` | POST | `setting_update` |
| `/access-tokens` | POST | `access_token_create` |
| `/access-tokens/{id}` | DELETE | `access_token_delete` |

> Note: OneDev exposes **no** global `GET /access-tokens` listing endpoint, so
> there is no `access_tokens_list` tool. To list a user's tokens the
> authenticated token is used with `user_access_tokens` (under
> `/users/{id}/access-tokens`), which OneDev does expose.

### Everything else
Any endpoint not wrapped above — issues, pull requests, pack(ages), repository/workspace
files, iteration, labels, etc. — is reachable through the generic **`onedev_api_request`**
tool using the same `/~api` base and bearer authentication.

---

## Response / error conventions

- Successful responses return the server body as JSON (or `{ "id": … }` for creates).
- Non-2xx responses are turned into a failed MCP tool result with a message like
  `OneDev API POST /users -> HTTP 409: ...`.
- The read-only flag (`ONEDEV_MCP_READONLY=true`) short-circuits in the client: any
  method other than `GET`/`HEAD` returns a clear refusal without hitting OneDev.