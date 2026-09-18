# dsh-onedev-mcp —— 工具参考

本插件提供的全部 60 个 MCP 工具。当通过 DeepSeek Harness 以
`serverName: onedev` 桥接时，每个工具会以服务限定名（如 `mcp__onedev__users_list`）
暴露。工具标识符（name）与标题（title）保持英文，因为它们是稳定的 API 面；
右侧「中文用途」列帮助理解每个工具的行为。

| 工具（name） | 标题（title） | 中文用途 |
|---|---|---|
| `onedev_api_request` | OneDev Direct API Request | 直连 OneDev REST API，执行任意已认证请求 |
| `onedev_docs_search` | Search OneDev Documentation | 全文检索 OneDev 官方文档（docs.onedev.io），返回按相关度排序的页面与摘要 |
| `onedev_docs_read` | Read OneDev Documentation Page | 读取一篇 OneDev 官方文档页面，返回可读文本（标题/列表/链接/代码块） |
| `onedev_docs_list` | List OneDev Documentation Pages | 列出 OneDev 官方文档的页面（可按类目过滤），来自站点 sitemap |
| `onedev_list_environments` | List OneDev Environments | 列出所有已配置的 OneDev 环境（含备注/URL/认证方式/是否主环境），供 AI 感知并按 slug 精确调用 |
| `users_list` | List Users | 列出用户 |
| `user_get` | Get User by ID | 按 ID 获取单个用户 |
| `user_get_id` | Get User ID by Login Name | 按登录名解析用户 ID |
| `user_create` | Create User | 创建新用户 |
| `user_update` | Update User | 更新用户的登录名/全名等字段 |
| `user_disable` | Disable User | 禁用（锁定）普通用户 |
| `user_enable` | Enable User | 重新启用被禁用的用户 |
| `user_set_password` | Set User Password | 设置普通用户的密码 |
| `user_convert_to_service_account` | Convert User to Service Account | 将普通用户转换为服务账号 |
| `user_reset_2fa` | Reset Two-Factor Authentication | 重置用户的双重认证（两因素认证） |
| `user_access_tokens` | List User Access Tokens | 列出某用户创建的访问令牌 |
| `user_ssh_keys` | List User SSH Keys | 列出某用户的 SSH 密钥 |
| `user_email_addresses` | List User Email Addresses | 列出某用户的邮箱地址 |
| `user_memberships` | List User Memberships | 列出某用户所属的组（成员关系） |
| `groups_list` | List Groups | 列出组 |
| `group_get` | Get Group by ID | 按 ID 获取单个组 |
| `group_get_id` | Get Group ID by Name | 按组名解析组 ID |
| `group_create` | Create Group | 创建新组 |
| `group_update` | Update Group | 更新组的名称/描述 |
| `group_delete` | Delete Group | 按 ID 删除组 |
| `group_members_list` | List Group Memberships | 列出组成员关系（列出组内用户） |
| `group_members_add` | Add User to Group | 将用户加入组（加入 Administrators 组即授予管理员） |
| `group_members_remove` | Remove User from Group | 将用户从组中移除 |
| `roles_list` | List Roles | 列出角色 |
| `role_get` | Get Role by ID | 按 ID 获取单个角色 |
| `role_get_id` | Get Role ID by Name | 按名称解析角色 ID |
| `role_create` | Create Role | 创建新角色 |
| `role_update` | Update Role | 更新已有角色 |
| `role_delete` | Delete Role | 按 ID 删除角色 |
| `projects_list` | List Projects | 使用项目页查询语法列出项目 |
| `project_get` | Get Project by ID | 按 ID 获取单个项目 |
| `project_get_id` | Get Project ID by Path | 按路径解析项目 ID |
| `project_get_clone_url` | Get Project Clone URLs | 获取项目的 HTTP/SSH 克隆地址 |
| `project_get_setting` | Get Project Settings | 获取完整的项目设置 |
| `project_create` | Create Project | 创建新项目（未提供 gitPackConfig/codeAnalysisSetting 时自动补空 {} 以满足服务端非空校验） |
| `project_update` | Update Project | 更新项目顶层字段（同上，缺失的嵌套配置自动补空 {}） |
| `project_delete` | Delete Project | 按 ID 删除项目（不可逆） |
| `project_get_user_authorizations` | List Project User Permissions | 列出项目上显式授予的用户权限（角色） |
| `project_get_group_authorizations` | List Project Group Permissions | 列出项目上显式授予的组权限（角色） |
| `agents_list` | List Build Agents | 列出构建代理（在线/离线） |
| `agent_get` | Get Build Agent | 按 ID 获取单个构建代理 |
| `agent_attributes_get` | Get Build Agent Attributes | 获取构建代理的属性映射 |
| `agent_attributes_set` | Set Build Agent Attributes | 替换构建代理的完整属性映射 |
| `agent_tokens_list` | List Agent Tokens | 列出代理加入令牌 |
| `agent_token_create` | Create Agent Token | 创建新的代理加入令牌 |
| `agent_token_delete` | Delete Agent Token | 按 ID 撤销代理加入令牌 |
| `builds_list` | List Builds | 使用构建页查询语法列出构建 |
| `build_get` | Get Build | 按 ID 获取单个构建 |
| `build_set_description` | Set Build Description | 设置构建的文本描述 |
| `build_labels` | Get Build Labels | 获取构建上附加的标签 |
| `server_version` | Server Version | 获取所配置实例的 OneDev 服务器版本 |
| `setting_get` | Get Global Setting | 按名称读取一个全局服务器设置 |
| `setting_update` | Update Global Setting | 按名称替换一个全局服务器设置 |
| `access_token_create` | Create Access Token | 创建新的访问令牌 |
| `access_token_delete` | Delete Access Token | 按 ID 删除访问令牌 |
