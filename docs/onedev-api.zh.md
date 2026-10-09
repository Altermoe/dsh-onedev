# OneDev REST API 参考（dsh-onedev-mcp 使用）

插件驱动的是 OneDev 的 REST API。本页是**类型化**工具所用端点的简明、可维护的映射，
以及认证方式的说明。更详尽、随安装提供的交互式参考文档见你部署的 OneDev：

```
http(s)://<your OneDev server url>/~help/api
```

在 OneDev 源码树中，这些资源位于
`server-core/src/main/java/io/onedev/server/rest/resource/`。

---

## 认证

每个请求都通过 OneDev 的安全过滤器之一完成认证。插件支持两种方式：

**1. 访问令牌（Bearer）**（默认，`ONEDEV_AUTH_TYPE` 不设置或为 `token`）：

```
Authorization: Bearer <access token>
```

- 令牌由 OneDev 查找（`SecurityUtils.getBearerToken` + `AccessTokenService.findByValue`）——
  无需用户名/密码。
- bearer 过滤器会绑定**持有该令牌的用户**，因此工具的有效权限即该用户的权限。
  仅管理员可用的端点要求令牌属于某个管理员。

**2. 账号 + 密码**（`ONEDEV_AUTH_TYPE=password`）：

```
Authorization: Basic base64(username:password)
```

- OneDev 的 `BasicAuthenticationFilter` 会先把用户名/密码当作访问令牌值匹配，若都不匹配，
  则回退到一次真实的 Apache Shiro `UsernamePasswordToken` 登录。因此普通账号的 REST 调用
  会被自动认证——**无需先创建访问令牌**（消除了“先登录创建令牌”的鸡蛋悖论）。
- 有效权限即所登录账号的权限；管理员端点仍要求该账号具备管理员角色。
- 由于密码会随每次请求回放，请尽量使用 `https://`，不要在不可信链路上用明文 HTTP 传输密码。

使用无效或过期的凭据会产生 `401`/`403`；插件会在工具结果（`isError`）中给出消息。

URL 的构成：`ONEDEV_URL + ONEDEV_API_BASE + <path>`，其中 `ONEDEV_API_BASE` 默认为 `/~api`
（OneDev 将 REST API 挂载在 `/~api` 之下；交互式文档位于 `/~help/api`）。

---

## 端点映射

### 直连 / 元信息
| 路径 | 方法 | 用于 |
|---|---|---|
| `/server/version` | GET | `server_version` |

### 用户 —— `UserResource` → `/users`
| 路径 | 方法 | 用于 |
|---|---|---|
| `/users` | GET | `users_list`（term/offset/count） |
| `/users` | POST | `user_create` |
| `/users/{id}` | GET | `user_get` |
| `/users/{id}` | POST | `user_update` |
| `/users/ids/{name}` | GET | `user_get_id` |
| `/users/{id}/disable`、`/enable` | POST | `user_disable`、`user_enable` |
| `/users/{id}/password` | POST | `user_set_password` |
| `/users/{id}/convert-to-service-account` | POST | `user_convert_to_service_account` |
| `/users/{id}/two-factor-authentication` | DELETE | `user_reset_2fa` |
| `/users/{id}/access-tokens` | GET | `user_access_tokens` |
| `/users/{id}/ssh-keys` | GET | `user_ssh_keys` |
| `/users/{id}/email-addresses` | GET | `user_email_addresses` |
| `/users/{id}/memberships` | GET | `user_memberships` |

### 组 —— `GroupResource` → `/groups`；成员关系 —— `MembershipResource` → `/memberships`
| 路径 | 方法 | 用于 |
|---|---|---|
| `/groups` | GET / POST | `groups_list`、`group_create` |
| `/groups/{id}` | GET / POST / DELETE | `group_get`、`group_update`、`group_delete` |
| `/groups/ids/{name}` | GET | `group_get_id` |
| `/groups/{id}/memberships` | GET | `group_members_list` |
| `/memberships` | POST | `group_members_add` |
| `/memberships/{id}` | DELETE | `group_members_remove` |

> **管理员**：OneDev 将管理员状态建模为对内置 `Administrators` 组的成员关系。
> 在这里添加/移除用户即可授予/撤销其管理权限。

### 角色 —— `RoleResource` → `/roles`
| 路径 | 方法 | 用于 |
|---|---|---|
| `/roles` | GET / POST | `roles_list`、`role_create` |
| `/roles/{id}` | GET / POST / DELETE | `role_get`、`role_update`、`role_delete` |
| `/roles/ids/{name}` | GET | `role_get_id` |

### 项目 —— `ProjectResource` → `/projects`
| 路径 | 方法 | 用于 |
|---|---|---|
| `/projects` | GET / POST | `projects_list`、`project_create` |
| `/projects/ids/{path}` | GET | `project_get_id` |
| `/projects/{id}` | GET / POST / DELETE | `project_get`、`project_update`、`project_delete` |
| `/projects/{id}/clone-url` | GET | `project_get_clone_url` |
| `/projects/{id}/setting` | GET | `project_get_setting` |
| `/projects/{id}/user-authorizations` | GET | `project_get_user_authorizations` |
| `/projects/{id}/group-authorizations` | GET | `project_get_group_authorizations` |

> **创建/更新要求非空嵌套配置。** `ProjectResource` 会把 `gitPackConfig` 与
> `codeAnalysisSetting` 校验为 `@NotNull`，因此仅发送 `{"name": ...}` 会被以
> `400 must not be null` 拒绝。`project_create`/`project_update` 会对你未设置的
> 这些键自动补上空的 `{}`；如需覆盖，请传入相应的对象。

### CI/CD 代理与构建 —— `AgentResource`、`AgentTokenResource`、`BuildResource`、`BuildLogStreamResource`
| 路径 | 方法 | 用于 |
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
| `/streaming/build-logs/{id}` | GET | `build_log` |

> **构建日志位于另一个资源上。** `BuildResource` 没有 `/log` 操作——
> `GET /builds/{id}/log` 会返回 HTTP 404。真正的端点是
> `GET /streaming/build-logs/{id}`（`BuildLogStreamResource`），其产物为
> `application/octet-stream`：每一帧前有一个 4 字节大端长度前缀（负数 = 状态帧，
> 零 = keepalive，正数 = 一段 JSON `LogEntry`）。通用工具 `onedev_api_request`
> 发送的是 `Accept: application/json`，因此在这里会得到 HTTP 406；
> `build_log` 则以 `Accept: application/octet-stream` 请求并解码该分帧格式。
> 其中 `id` 是构建 **id**，不是构建编号。

### 全局设置 —— `SettingResource` → `/settings`；令牌 —— `AccessTokenResource` → `/access-tokens`
| 路径 | 方法 | 用于 |
|---|---|---|
| `/settings/{name}` | GET | `setting_get`（`system`、`security`、`build`、`issue`、`project`、`job-executors`、`mail-service`、`ssh`、`backup`、`authenticator`、…） |
| `/settings/{name}` | POST | `setting_update` |
| `/access-tokens` | POST | `access_token_create` |
| `/access-tokens/{id}` | DELETE | `access_token_delete` |

> 注意：OneDev **并未**暴露全局的 `GET /access-tokens` 列表端点，因此没有
> `access_tokens_list` 工具。要列出某用户的令牌，请使用 `user_access_tokens`
>（位于 `/users/{id}/access-tokens`），这是 OneDev 确实暴露的端点。

### 其余一切
任何未在上面封装的端点——问题、拉取请求、包（pack）、仓库/工作区文件、迭代、标签等——
都可以通过通用工具 **`onedev_api_request`** 访问，使用相同的 `/~api` 基准与 bearer 认证。

---

## 响应 / 错误约定

- 成功的响应会以 JSON 返回服务器响应体（创建类操作返回 `{ "id": … }`）。
- 非 2xx 响应会转成失败的 MCP 工具结果，并附带类似
  `OneDev API POST /users -> HTTP 409: ...` 的消息。
- 只读标志（`ONEDEV_MCP_READONLY=true`）会在客户端内短路：任何 `GET`/`HEAD` 之外的方法
  都会直接返回明确的拒绝，而不会真的请求 OneDev。