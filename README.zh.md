# dsh-onedev-mcp

> **语言：** 简体中文 · [English](README.md)

**dsh-onedev** 是 [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) 的一个插件，它通过 [模型上下文协议（MCP，Model Context Protocol）](https://modelcontextprotocol.io) 赋予 AI 以**经过认证的直连**方式，访问 [OneDev](https://onedev.io) Git / CI / CD 服务器的 **REST API 并执行管理员操作**。

它内置一个**独立的 MCP 服务器**（`dsh-onedev-mcp`），使用 OneDev 访问令牌直连 OneDev REST API。DeepSeek Harness 通过内置的 `@deepseek-ai/dsh-mcp-client` 桥接插件将其挂载进来，于是每一个 OneDev 管理员操作都会变成模型可以直接调用的普通工具（前缀为 `mcp__onedev__…`）。

> 这正是本插件围绕的“直连”原语：无需使用 Web 界面，AI 直接驱动 OneDev 真实的 REST API（`/~api/*`），对用户、组、成员关系、角色、项目、构建代理、设置等进行完整增删改查；凡是尚未封装为专用工具的接口，还可以通过通用的 `onedev_api_request` 工具发起*任意*请求。

---

## 功能概览

- **含 61 个工具的 MCP 服务器**：其中 57 个为管理工具（用户、组、角色、组成员关系（含授予管理员）、项目、授权、构建代理、代理令牌、构建与构建日志、全局设置、访问令牌等），另有 3 个**文档查询**工具与 1 个**环境发现**工具。
- **多个 OneDev 环境**：可同时配置多个 OneDev 服务器（每个环境拥有独立的地址、凭据与可选**备注**）。所有需要连接的请求都接受可选的 `environment` 标识（默认主环境），让 AI 能无歧义地指向特定服务器；`onedev_list_environments` 用于列出全部环境。
- **OneDev 官方文档查询**：`onedev_docs_search` / `onedev_docs_read` / `onedev_docs_list` 让模型能访问位于 [docs.onedev.io](https://docs.onedev.io/) 的 OneDev 官方文档——全部页面的全文检索、可读的页面内容、以及按类目的页面列表。这些工具是**独立（standalone）**的：无需配置 OneDev 连接或凭据，插件未配置时也可使用。
- **通用直连工具** `onedev_api_request`：当没有对应的专用封装时，可对 `ONEDEV_URL/~api/*` 发起*任意*已认证请求（OneDev REST 的全部界面仍然可用）。
- **两种传输方式**：`stdio`（用于 DSH 及其他 stdio MCP 客户端）与 `streamable-http`（用于远程/HTTP 客户端，路径为 `/mcp`）。
- **默认安全**：支持两种认证方式——**访问令牌**（`Authorization: Bearer <token>`）**或**账号密码（`Authorization: Basic base64(user:pass)`，由 OneDev 自动认证，无需先创建令牌）；可选的**只读模式**（`ONEDEV_MCP_READONLY=true`）会拒绝一切修改型请求；并支持可配置的每次调用超时。
- **dsh Web 设置页（OneDev）**：作为 dsh 插件安装后，本插件会在 dsh Web 界面（`设置`）新增一个一级 **OneDev** 设置页。它以**卡片**展示每个已配置的环境，右上角有**新增环境**按钮；点击卡片进入该环境的编辑表单（服务器地址、管理员**用户名/密码**或访问令牌、显示用**备注**，以及额外的透传选项），可实时校验连接后**保存**，并可设为主环境或删除。由于 MCP 服务器在**每次工具调用**时从凭据存储解析连接，因此**无需环境变量**，且保存后无需重启 dsh 即可生效。
- **配置控制台（GUI）**（`npm run setup`）：在本地页面输入 OneDev 地址与账号密码，`Test` 连接后 `Save` 保存到本地凭据存储；结合密码模式即可消除“先登录 Web 创建令牌→再用令牌连接”的鸡蛋悖论。
- **类型化、自描述的工具**：每个工具都有标题、描述以及由严格 Zod schema 生成的 JSON Schema，让模型能看到清晰的参数契约。
- **完整的测试与文档**：单元测试、stdio 冒烟测试、HTTP 冒烟测试，以及位于 [`docs/`](docs/) 的完整文档。

---

## 仓库结构

```
dsh-onedev/
├─ src/
│  ├─ index.ts          # MCP 服务器构建器；注册全部工具
│  ├─ cli.ts            # stdio / HTTP / 配置控制台 启动器
│  ├─ config.ts         # 环境变量 + 按环境的配置解析（多环境）
│  ├─ client.ts         # 类型化 OneDev REST 客户端（Bearer / Basic 认证、错误处理）
│  ├─ auth.ts           # 认证头构建 + 连接探测（供 GUI 使用）
│  ├─ storage.ts        # 多环境凭据存储（save/list/delete/primary，0600 权限）
│  ├─ setup/            # 配置控制台服务器 + 单文件页面
│  ├─ http-server.ts    # streamable-HTTP 引导（node:http）
│  └─ tools/            # 按域划分的工具定义
│     ├─ generic.ts     # onedev_api_request（直连）
│     ├─ docs.ts        # onedev_docs_*（官方文档查询，独立运行）
│     ├─ environments.ts# onedev_list_environments（环境发现，独立运行）
│     ├─ users.ts  groups.ts  roles.ts  projects.ts  agents.ts  settings.ts
│     └─ index.ts       # 合并后的注册表
├─ bin/                 # dsh-onedev-mcp.mjs 启动器
├─ plugin/              # dsh 插件面（宿主 + 浏览器客户端半边）
│  ├─ src/host.ts       #   宿主：回环 /api/onedev/config + probe 路由
│  ├─ src/client/       #   客户端：OneDev settings.section + 语言包
│  └─ tsconfig.json     #   插件两半边的浏览器/Node 类型检查
├─ lib/                 # 构建产物：lib/index.js（宿主）、lib/client.js（客户端）
├─ tests/               # 单元 + stdio 冒烟 + http 冒烟 + 宿主路由冒烟
├─ docs/
│  ├─ tools.md          # 全部 61 个工具的（自动生成的）表格
│  ├─ onedev-api.md     # 本插件使用的 OneDev REST API 参考
│  └─ dsh-integration.md# DeepSeek Harness 插件配置
├─ scripts/
│  ├─ gen-tools-doc.mjs # 文档生成器
│  ├─ build-plugin.mjs  # esbuild → lib/index.js + lib/client.js
│  └─ restart-dsh.sh    # 停止/重启 dsh web profile
├─ cordis.patch.yml     # bundle patch（插入 dsh-onedev 与 dsh-onedev-mcp）
├─ TODOS.md             # 任务/目标跟踪（TODOS.zh.md）
├─ .env.example
└─ package.json
```

---

## 前置条件

- **Node.js `^22.19.0 || >=24.0.0`**（在 Node 26 上开发并测试）。启动器通过 `require()` 加载编译后的 ESM CLI，需要 Node ≥ 20.19/22.12；而插件两半运行在 DSH 内，DSH 自身的引擎范围正是该区间。
- 以 DSH bundle 方式安装插件时需要 **DeepSeek Harness 0.2.x**（`^0.2.0-rc.2`）；独立的 MCP 服务器不依赖 DSH。
- 一个可通过 HTTP(S) 访问的 **OneDev 服务器**，例如 `http://localhost:6610`。
- **认证**：要么提供一个 OneDev 访问令牌，要么提供一个账号 + 密码。
  - 令牌方式（`ONEDEV_TOKEN`）：令牌需具备你希望 AI 执行操作的权限（多数管理端点要求管理员）。OneDev REST 文档位于 `http(s)://<server>/~help/api`；可从用户菜单 → **Access tokens** 创建令牌，也可通过 REST API 本身创建。
  - 密码方式（`ONEDEV_AUTH_TYPE=password`）：直接使用现有的 OneDev 账号/密码，避免“先登录创建令牌”的鸡蛋悖论。

---

## 安装与构建

```bash
npm install        # 安装依赖
npm run build      # 将 TypeScript 编译到 dist/
npm test           # 构建 + 单元测试 + stdio 冒烟 + HTTP 冒烟
```

`bin/dsh-onedev-mcp.mjs` 启动器运行编译后的服务器。`npm start` 执行它；
`npm run dev` 则通过 `tsx` 以开发模式运行同一套代码。

---

## 配置控制台（GUI）

运行本地配置控制台，输入 OneDev 地址与凭据、校验并保存——无需手动创建令牌：

```bash
npm run setup
# 或不带参数，直接：
#   node bin/dsh-onedev-mcp.mjs --setup
```

页面打开于 `http://127.0.0.1:8770/`（可用 `ONEDEV_MCP_PORT` 修改端口），包含：

- **环境标识 + 备注** —— 一个供 AI 选环境的短名（如 `prod`/`staging`）以及可选备注；下方列出已保存的环境，可加载/编辑/删除或设为主环境。
- **服务器地址** —— OneDev 基准 URL。
- **认证方式** —— *账号 + 密码*（默认，使用 Basic 登录认证）或 *访问令牌*。
- **测试连接** — 在保存前先向 OneDev 校验凭据。
- **保存并测试** — 校验通过后，将配置写入本地凭据存储。
- **设为主环境 / 删除** —— 将当前标识提升为默认目标，或移除该环境。

保存成功后会提示该账号是否具备管理员权限；凭据以属主可读（`0600`）写入
`~/.config/dsh-onedev/config.json`（Linux/macOS 遵循 `XDG_CONFIG_HOME`，Windows 用
`%APPDATA%`，可用 `ONEDEV_CONFIG_FILE` 覆盖）。之后即使不设置任何环境变量，MCP
服务器也会在启动时自动读取这些凭据。

---

## dsh Web 设置页（OneDev）

当插件作为 bundle 安装到某个 dsh profile 时（参见
[`docs/dsh-integration.md`](docs/dsh-integration.md)），会挂载两部分：

- **宿主端**——回环路由 `GET /api/onedev/config`（列出环境）、
  `POST /api/onedev/config`（保存 / 设为主环境 / 删除单个环境，或 `clear:true` 清空整库）与
  `POST /api/onedev/probe`，复用上面所述的**多环境**凭据存储。
- **客户端端**——在 dsh Web 界面（`设置`）中新增一级 **OneDev** 设置页。它以**卡片**展示每个
  已配置环境（标识、备注、URL、认证方式、主环境 / 未配置徽标），右上角有**新增环境**按钮；
  点击卡片进入其编辑表单——**返回**按钮固定在面板左上角，随后是服务器地址、管理员
  **用户名/密码**（或访问令牌）、**备注**，以及额外的透传选项——提供 **测试**、**保存**、
  **设为主环境**、**删除**与**打开 OneDev** 等操作。

所有保存的内容都持久化在多环境凭据存储中，每次打开该页面时表单都会自动回填。敏感项不会
回显到浏览器：服务器地址、用户名及其他选项完整返回，而密码/令牌/附加请求头字段保持
空白并显示“已保存 · 留空保持不变”的占位提示。因此**重新打开页面后无需重新输入即可
测试连接**——留空的敏感字段会自动回退使用目标**环境**已保存的凭据（显式输入的值仍然优先），
测试成功时会提示是否使用了已保存的凭据。

由于 MCP 服务器在**每次工具调用**时从凭据存储解析连接，因此在 GUI 中保存后，
后续的 `mcp__onedev__*` 工具调用会立即生效——无需重启，也无需 `ONEDEV_URL`/
`ONEDEV_USERNAME`/`ONEDEV_PASSWORD` 环境变量。当存在多个环境时，每个工具都以所选的
`environment` 标识为目标（默认主环境）。未完成地址/凭据的环境会使其工具返回明确的
“未配置”提示，直到你保存该环境为止。

设置页可控的透传参数与各环境变量含义一致：`apiBase`、`transport`
（`stdio`/`streamable-http`）、`httpHost`、`httpPort`、`readonly`、`apiTimeoutMs`，
以及 `extraHeaders`（JSON 对象）。

用 `npm run build`（或 `npm run build:plugin`）构建插件两部分，然后重启 dsh 以加载
新 bundle（参见 `scripts/restart-dsh.sh`）。

---

## 快速开始（独立运行）

已有令牌时的最快路径：

```bash
export ONEDEV_URL=http://localhost:6610
export ONEDEV_TOKEN=your-access-token
npm start
```

或完全跳过令牌、改用账号密码：

```bash
export ONEDEV_URL=http://localhost:6610
export ONEDEV_AUTH_TYPE=password
export ONEDEV_USERNAME=root
export ONEDEV_PASSWORD="your-password"
npm start
```

或先运行一次 `npm run setup`，之后只需 `npm start`（凭据来自存储）。

可用任意 MCP stdio 客户端测试，或通过 stdin 手动进行 JSON-RPC 交互
（`tools/list` 会返回 61 个工具）。如需可视化检查，也可以运行下方的 HTTP 变体，
并用 MCP 客户端或 `curl` 指向它。

### Streamable HTTP 模式

```bash
ONEDEV_URL=http://localhost:6610 \
ONEDEV_TOKEN=your-access-token \
ONEDEV_MCP_TRANSPORT=streamable-http \
ONEDEV_MCP_PORT=8765 \
npm start
# MCP 端点：http://127.0.0.1:8765/mcp
```

---

## 环境变量

| 变量 | 默认值 | 必填 | 含义 |
|---|---|---|---|
| `ONEDEV_URL` | — | 否（可在 GUI/存储中设置） | **主** OneDev 环境的基准 URL（`http://host:6610`）。尾部斜杠会被去除。也可由 dsh Web 设置页或 `npm run setup` 写入的凭据存储提供，而非环境变量。 |
| `ONEDEV_ENV` | （主环境） | — | 当未给工具传 `environment` 参数时，应解析的环境标识（默认取存储中的主环境）。 |
| `ONEDEV_AUTH_TYPE` | `token` | — | `token`（Bearer）或 `password`（Basic 登录）。也可来自凭据存储。 |
| `ONEDEV_TOKEN` | — | 若用 `password` 则否 | OneDev 访问令牌（Bearer），`ONEDEV_AUTH_TYPE=token` 时使用。 |
| `ONEDEV_USERNAME` | — | 若用 `password` | OneDev 账号名，`ONEDEV_AUTH_TYPE=password` 时使用。 |
| `ONEDEV_PASSWORD` | — | 若用 `password` | OneDev 账号密码，`ONEDEV_AUTH_TYPE=password` 时使用。 |
| `ONEDEV_CONFIG_FILE` | (XDG 路径) | — | 覆盖凭据存储路径（环境变量始终优先于存储）。 |
| `ONEDEV_MCP_COMMAND` | — | — | `setup` → 启动配置控制台，而非 MCP 传输。 |
| `ONEDEV_API_BASE` | `/~api` | — | 追加到 URL 用于 REST 调用的前缀。 |
| `ONEDEV_MCP_TRANSPORT` | `stdio` | — | `stdio` 或 `streamable-http`。 |
| `ONEDEV_MCP_PORT` | `8765` | — | HTTP 模式下的绑定端口（配置控制台同用）。 |
| `ONEDEV_MCP_HOST` | `127.0.0.1` | — | HTTP 模式下的绑定主机（配置控制台同用）。 |
| `ONEDEV_API_TIMEOUT_MS` | `30000` | — | OneDev 调用的单次请求超时（毫秒）。 |
| `ONEDEV_MCP_READONLY` | `false` | — | `true` → 拒绝一切修改型请求（仅允许 `GET`/`HEAD`）。 |
| `ONEDEV_MCP_HEADERS` | — | — | 追加在认证头之上的额外请求头（JSON），例如 `{"X-Custom":"v"}`。 |
| `ONEDEV_DOCS_URL` | `https://docs.onedev.io` | — | 文档查询工具（`onedev_docs_*`）使用的基准 URL；指向镜像站点即可替换文档来源。 |

可参考 `.env.example` 获取可复制的模板。

---

## 工具参考

全部 61 个工具及其标题见 **[docs/tools.md](docs/tools.md)**（中文版见 [docs/tools.zh.md](docs/tools.zh.md)）。部分摘录：

| 域 | 示例 |
|---|---|
| 环境 | `onedev_list_environments` —— 发现已配置的 OneDev 环境（标识、备注、URL、是否主环境）；每个其他工具都接受可选的 `environment` 标识 |
| 直连与信息 | `onedev_api_request`, `server_version` |
| 文档 | `onedev_docs_search`, `onedev_docs_read`, `onedev_docs_list` —— 查询位于 [docs.onedev.io](https://docs.onedev.io/) 的官方文档；独立运行（无需配置 OneDev 连接） |
| 用户 | `users_list`, `user_get`, `user_get_id`, `user_create`, `user_update`, `user_disable`, `user_enable`, `user_set_password`, `user_convert_to_service_account`, `user_reset_2fa`, `user_access_tokens`, `user_ssh_keys`, `user_email_addresses`, `user_memberships` |
| 组与管理员 | `groups_list`, `group_get`, `group_get_id`, `group_create`, `group_update`, `group_delete`, `group_members_list`, `group_members_add`, `group_members_remove` |
| 角色 | `roles_list`, `role_get`, `role_get_id`, `role_create`, `role_update`, `role_delete` |
| 项目 | `projects_list`, `project_get`, `project_get_id`, `project_get_clone_url`, `project_get_setting`, `project_create`, `project_update`, `project_delete`, `project_get_user_authorizations`, `project_get_group_authorizations` |
| CI/CD | `agents_list`, `agent_get`, `agent_tokens_list`, `agent_token_create`, `agent_token_delete`, `builds_list`, `build_get`, `build_set_description`, `build_labels`, `build_log` |
| 设置 | `setting_get`, `setting_update`, `access_token_create`, `access_token_delete` |

> **将用户设为管理员**在 OneDev 中体现为加入内置的 `Administrators` 组：
> 调用 `group_members_add` 并将 `groupId` 设为该组的 id。

---

## 安全说明

- 凭据只会在你配置 `https://` 的 URL 时才通过 HTTPS 发送到 `ONEDEV_URL`；不要在不可信网络上使用端口转发的明文。
- **令牌模式**下令牌从环境变量或存储读取，**绝不会**被写入日志。DSH stdio 桥接会从子进程环境中剔除所有形如 `*TOKEN*`/`*SECRET*` 的环境变量；你需要在插件 `env` 中显式传入 `ONEDEV_TOKEN`。
- **密码模式**下账号密码会以 HTTP Basic（base64，非加密）随每次请求发送。尽量使用 `https://`；凭据存储以属主可读（`0600`）写入，控制台展示状态时会对密钥脱敏。
- 若 AI 只需查看服务器，请使用**只读模式**（`ONEDEV_MCP_READONLY=true`）——所有 `POST`/`PUT`/`DELETE` 都会在到达 OneDev 前被拒绝。
- 所有操作都由 OneDev 本身记录审计：每次管理型修改都会写入 OneDev 的审计日志（“… via RESTful API”）。

---

## DeepSeek Harness 接入

在你的 DSH 配置中新增一条插件即可。完整细节与可运行的示例见 **[docs/dsh-integration.md](docs/dsh-integration.md)**（中文版见 [docs/dsh-integration.zh.md](docs/dsh-integration.zh.md)）。

```yaml
# stdio（推荐）：将编译后的服务器作为 MCP 子进程拉起
- id: dsh-onedev
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: onedev
    transport: stdio
    command: node
    args: ['/absolute/path/to/dsh-onedev/bin/dsh-onedev-mcp.mjs']
    env:
      ONEDEV_URL: !!js process.env.ONEDEV_URL
      # 用令牌：
      ONEDEV_TOKEN: !!js process.env.ONEDEV_TOKEN
      # 或用账号/密码（无需令牌）：
      # ONEDEV_AUTH_TYPE: 'password'
      # ONEDEV_USERNAME: !!js process.env.ONEDEV_USERNAME
      # ONEDEV_PASSWORD: !!js process.env.ONEDEV_PASSWORD
    toolCallTimeoutMs: 60000
```

如果你已经跑过 `npm run setup`，甚至可以省略 `env`——被拉起的服务器会自动读取
存储在磁盘上的凭据。

Harness 启动后，工具会以 `mcp__onedev__users_list` 之类的名称出现，
并可像任何原生工具一样被调用。

---

## OneDev REST API 参考

插件面向 OneDev 的 REST API。有关类型化工具所用每个端点的简明映射（以及认证方式），
见 **[docs/onedev-api.md](docs/onedev-api.md)**（中文版见 [docs/onedev-api.zh.md](docs/onedev-api.zh.md)）。
官方语义化文档由你的安装自带，地址为 `http(s)://<server>/~help/api`。

---

## 测试

```bash
npm test
```

按顺序运行：
1. `tsc` 构建。
2. 单元测试（`tests/client.test.mjs`）——配置解析、URL 构建、认证头（Bearer + Basic）、只读门控、凭据存储往返、环境变量与存储优先级。
3. 文档工具单元测试（`tests/docs.test.mjs`）——搜索排序、页面读取/转换、sitemap 列表、缓存；`fetch` 被 mock（无网络）。
4. 连接探测测试（`tests/auth.test.mjs`）——匿名/已认证状态分类（无网络，`fetch` 被 mock）。
5. stdio 冒烟（`tests/smoke.mjs`）——通过 stdio 启动服务器，校验所有工具都已列出。
6. HTTP 冒烟（`tests/http-smoke.mjs`）——以 streamable-http 模式启动，发起真实的 `initialize` + `tools/list`。

另有一个**文档能力在线自测**（`node scripts/selftest-docs.mjs`；需能访问 docs.onedev.io）：它会在**没有任何 OneDev 凭据**的情况下启动服务器，仅用 `onedev_docs_*` 工具回答“如何为项目配置 CI/CD 并用 OneDev 的密钥系统保存敏感信息”这一问题。

---

## 许可证

[MIT](LICENSE)。与 OneDev 或 DeepSeek 无关联；项目/商标名称归其各自所有者所有。

---

_延伸阅读：_ [`docs/tools.md`](docs/tools.md) · [`docs/onedev-api.md`](docs/onedev-api.md) · [`docs/dsh-integration.md`](docs/dsh-integration.md) · 中文版见对应的 `*.zh.md`