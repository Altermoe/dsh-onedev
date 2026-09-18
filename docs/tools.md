# dsh-onedev-mcp — tool reference

Full table of the 60 MCP tools served by the plugin. When bridged
through DeepSeek Harness with `serverName: onedev`, each tool is exposed under a
server-qualified name such as `mcp__onedev__users_list`.

| Tool | Title |
|------|-------|
| `onedev_api_request` | OneDev Direct API Request |
| `onedev_docs_search` | Search OneDev Documentation |
| `onedev_docs_read` | Read OneDev Documentation Page |
| `onedev_docs_list` | List OneDev Documentation Pages |
| `onedev_list_environments` | List OneDev Environments |
| `users_list` | List Users |
| `user_get` | Get User by ID |
| `user_get_id` | Get User ID by Login Name |
| `user_create` | Create User |
| `user_update` | Update User |
| `user_disable` | Disable User |
| `user_enable` | Enable User |
| `user_set_password` | Set User Password |
| `user_convert_to_service_account` | Convert User to Service Account |
| `user_reset_2fa` | Reset Two-Factor Authentication |
| `user_access_tokens` | List User Access Tokens |
| `user_ssh_keys` | List User SSH Keys |
| `user_email_addresses` | List User Email Addresses |
| `user_memberships` | List User Memberships |
| `groups_list` | List Groups |
| `group_get` | Get Group by ID |
| `group_get_id` | Get Group ID by Name |
| `group_create` | Create Group |
| `group_update` | Update Group |
| `group_delete` | Delete Group |
| `group_members_list` | List Group Memberships |
| `group_members_add` | Add User to Group |
| `group_members_remove` | Remove User from Group |
| `roles_list` | List Roles |
| `role_get` | Get Role by ID |
| `role_get_id` | Get Role ID by Name |
| `role_create` | Create Role |
| `role_update` | Update Role |
| `role_delete` | Delete Role |
| `projects_list` | List Projects |
| `project_get` | Get Project by ID |
| `project_get_id` | Get Project ID by Path |
| `project_get_clone_url` | Get Project Clone URLs |
| `project_get_setting` | Get Project Settings |
| `project_create` | Create Project |
| `project_update` | Update Project |
| `project_delete` | Delete Project |
| `project_get_user_authorizations` | List Project User Permissions |
| `project_get_group_authorizations` | List Project Group Permissions |
| `agents_list` | List Build Agents |
| `agent_get` | Get Build Agent |
| `agent_attributes_get` | Get Build Agent Attributes |
| `agent_attributes_set` | Set Build Agent Attributes |
| `agent_tokens_list` | List Agent Tokens |
| `agent_token_create` | Create Agent Token |
| `agent_token_delete` | Delete Agent Token |
| `builds_list` | List Builds |
| `build_get` | Get Build |
| `build_set_description` | Set Build Description |
| `build_labels` | Get Build Labels |
| `server_version` | Server Version |
| `setting_get` | Get Global Setting |
| `setting_update` | Update Global Setting |
| `access_token_create` | Create Access Token |
| `access_token_delete` | Delete Access Token |
