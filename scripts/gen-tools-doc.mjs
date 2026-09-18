import { TOOLS } from '../dist/tools/index.js'
import { writeFileSync } from 'node:fs'

/**
 * Bilingual documentation generator.
 *
 * Emits two files from the single source of truth (the TOOLS registry):
 *   - docs/tools.md      : English reference.
 *   - docs/tools.zh.md   : Chinese reference (tool names/titles kept as-is, plus
 *                          a Chinese purpose column sourced from ZH map below).
 *
 * Per the project's bilingual-docs rule (see AGENTS.md), every new tool must also
 * be added to the ZH map here so the Chinese reference stays complete.
 */

/** Chinese one-line purpose for each tool name. Keep this complete for every tool. */
const ZH = {
  onedev_api_request: '直连 OneDev REST API，执行任意已认证请求',
  onedev_list_environments: '列出所有已配置的 OneDev 环境（含备注/URL/认证方式/是否主环境），供 AI 感知并按 slug 精确调用',
  onedev_docs_search: '全文检索 OneDev 官方文档（docs.onedev.io），返回按相关度排序的页面与摘要',
  onedev_docs_read: '读取一篇 OneDev 官方文档页面，返回可读文本（标题/列表/链接/代码块）',
  onedev_docs_list: '列出 OneDev 官方文档的页面（可按类目过滤），来自站点 sitemap',
  users_list: '列出用户',
  user_get: '按 ID 获取单个用户',
  user_get_id: '按登录名解析用户 ID',
  user_create: '创建新用户',
  user_update: '更新用户的登录名/全名等字段',
  user_disable: '禁用（锁定）普通用户',
  user_enable: '重新启用被禁用的用户',
  user_set_password: '设置普通用户的密码',
  user_convert_to_service_account: '将普通用户转换为服务账号',
  user_reset_2fa: '重置用户的双重认证（两因素认证）',
  user_access_tokens: '列出某用户创建的访问令牌',
  user_ssh_keys: '列出某用户的 SSH 密钥',
  user_email_addresses: '列出某用户的邮箱地址',
  user_memberships: '列出某用户所属的组（成员关系）',
  groups_list: '列出组',
  group_get: '按 ID 获取单个组',
  group_get_id: '按组名解析组 ID',
  group_create: '创建新组',
  group_update: '更新组的名称/描述',
  group_delete: '按 ID 删除组',
  group_members_list: '列出组成员关系（列出组内用户）',
  group_members_add: '将用户加入组（加入 Administrators 组即授予管理员）',
  group_members_remove: '将用户从组中移除',
  roles_list: '列出角色',
  role_get: '按 ID 获取单个角色',
  role_get_id: '按名称解析角色 ID',
  role_create: '创建新角色',
  role_update: '更新已有角色',
  role_delete: '按 ID 删除角色',
  projects_list: '使用项目页查询语法列出项目',
  project_get: '按 ID 获取单个项目',
  project_get_id: '按路径解析项目 ID',
  project_get_clone_url: '获取项目的 HTTP/SSH 克隆地址',
  project_get_setting: '获取完整的项目设置',
  project_create: '创建新项目（未提供 gitPackConfig/codeAnalysisSetting 时自动补空 {} 以满足服务端非空校验）',
  project_update: '更新项目顶层字段（同上，缺失的嵌套配置自动补空 {}）',
  project_delete: '按 ID 删除项目（不可逆）',
  project_get_user_authorizations: '列出项目上显式授予的用户权限（角色）',
  project_get_group_authorizations: '列出项目上显式授予的组权限（角色）',
  agents_list: '列出构建代理（在线/离线）',
  agent_get: '按 ID 获取单个构建代理',
  agent_attributes_get: '获取构建代理的属性映射',
  agent_attributes_set: '替换构建代理的完整属性映射',
  agent_tokens_list: '列出代理加入令牌',
  agent_token_create: '创建新的代理加入令牌',
  agent_token_delete: '按 ID 撤销代理加入令牌',
  builds_list: '使用构建页查询语法列出构建',
  build_get: '按 ID 获取单个构建',
  build_set_description: '设置构建的文本描述',
  build_labels: '获取构建上附加的标签',
  server_version: '获取所配置实例的 OneDev 服务器版本',
  setting_get: '按名称读取一个全局服务器设置',
  setting_update: '按名称替换一个全局服务器设置',
  access_token_create: '创建新的访问令牌',
  access_token_delete: '按 ID 删除访问令牌',
}

const zh = (name) => ZH[name] ?? null

// ---- English file ----
const rowsEn = TOOLS.map((t) => `| \`${t.name}\` | ${t.title} |`).join('\n')
const mdEn = `# dsh-onedev-mcp — tool reference

Full table of the ${TOOLS.length} MCP tools served by the plugin. When bridged
through DeepSeek Harness with \`serverName: onedev\`, each tool is exposed under a
server-qualified name such as \`mcp__onedev__users_list\`.

| Tool | Title |
|------|-------|
${rowsEn}
`
writeFileSync(new URL('../docs/tools.md', import.meta.url), mdEn)

// ---- Chinese file ----
const rowsZh = TOOLS.map((t) => {
  const purpose = zh(t.name) ?? t.title
  return `| \`${t.name}\` | ${t.title} | ${purpose} |`
}).join('\n')
const mdZh = `# dsh-onedev-mcp —— 工具参考

本插件提供的全部 ${TOOLS.length} 个 MCP 工具。当通过 DeepSeek Harness 以
\`serverName: onedev\` 桥接时，每个工具会以服务限定名（如 \`mcp__onedev__users_list\`）
暴露。工具标识符（name）与标题（title）保持英文，因为它们是稳定的 API 面；
右侧「中文用途」列帮助理解每个工具的行为。

| 工具（name） | 标题（title） | 中文用途 |
|---|---|---|
${rowsZh}
`
writeFileSync(new URL('../docs/tools.zh.md', import.meta.url), mdZh)

// ---- consistency guard ----
const missing = TOOLS.filter((t) => !zh(t.name))
if (missing.length) {
  throw new Error(
    `bilingual doc gap: the following tools have no CHINESE entry in scripts/gen-tools-doc.mjs; ` +
      `add them to the ZH map: ${missing.map((t) => t.name).join(', ')}`,
  )
}

console.log(`wrote docs/tools.md (${mdEn.split('\n').length} lines) and docs/tools.zh.md (${mdZh.split('\n').length} lines)`)