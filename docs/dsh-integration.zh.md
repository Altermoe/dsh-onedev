# DeepSeek Harness 接入指南

本插件由 DeepSeek Harness (DSH) 通过内置的 `@deepseek-ai/dsh-mcp-client` 桥接来使用，
该桥接会挂接外部 MCP 服务器，使其工具以 `mcp__onedev__users_list` 之类的名称成为
Harness 的原生工具。

本页说明如何将 `dsh-onedev-mcp` 以 **stdio**（推荐）和 **streamable-http**（远程）
两种部署方式接入 DSH。

> **推荐：作为 dsh profile bundle。** 自 v0.1.0 起，本插件也以 dsh bundle 形式提供。
> 将该包加入 profile 的 `dsh.profile.bundles`（并安装）；其 `cordis.patch.yml` 会插入
> `dsh-onedev` 宿主插件（回环 `/api/onedev/config` 与 `/api/onedev/probe` 面）**以及**一个
> 以 `env: {}` 生成 MCP 服务器的 `dsh-onedev-mcp` `@deepseek-ai/dsh-mcp-client` 行。
> 连接信息——服务器地址、管理员账号/密码或访问令牌，以及额外的透传选项——改为在 dsh Web
> 界面（`设置 → OneDev`）中配置。MCP 服务器在每次工具调用时读取凭据存储，因此**无需任何
> `ONEDEV_*` 环境变量**，保存后无需重启 dsh 即可生效。升级后请用 `npm run build` 构建插件
> bundle 并重启 dsh（`scripts/restart-dsh.sh`）。
>
> 插入的 `dsh-onedev-mcp` 行从 profile 自身的 `node_modules` 解析启动器（用 `!!js`
> 针对启动器提供的 `profileContext` 求值），因此补丁不含任何机器相关的绝对路径。该 bundle 在
> `peerDependencies` 中声明了 `"@deepseek-ai/dsh": "^0.2.0-rc.2"`，因此在不兼容的旧版 DSH 上，
> DSH 的插件兼容性门禁会给出提示并跳过该 bundle，而不是等到生成子进程时才失败。

---

## 桥接器如何看待本服务器

- `@deepseek-ai/dsh-mcp-client` 会拉起（stdio）或连接（streamable-http）服务器，
  并发现其工具。
- 你选取一个简短、唯一的 `serverName`（此处为 `onedev`）；之后无论服务器的内部名称是什么，
  每个工具都会以 `mcp__onedev__<toolName>` 的形式暴露。
- 桥接的只有工具。本服务器恰好只暴露工具，因此二者完全匹配。
- 断线重连由桥接器自动处理；编辑配置条目即可热重载。

### 多个 OneDev 环境

服务器可以同时连接**多个** OneDev 服务器。存储中按命名**环境**区分每个服务器（一个简短标识，
如 `prod`/`staging`，外加可选备注、URL 与各自独立的凭据）。只有 `onedev_list_environments`
能匹配*所有*环境；其它每个工具都只解析单个环境：

- 先调用 `mcp__onedev__onedev_list_environments`（可选 `{"query":"…"}`）查看已配置的标识、
  备注与 URL。
- 通过每个工具的可选 `environment` 参数传入匹配的标识即可无歧义地指向该服务器，例如
  `mcp__onedev__users_list` → `{"environment":"prod","term":"alice"}`。
- 省略 `environment` 则指向存储中的**主环境**（在 Web 界面里用“设为主环境”选择）。环境选择是
  逐次调用、完全由凭据存储驱动，因此**无需重启，也无需额外的 MCP 连接**。

---

## 凭据配置 —— 消除“令牌鸡蛋悖论”

下面两种方式都能去掉“必须先登录 OneDev Web 创建令牌”的引导步骤：

- **密码模式**（`ONEDEV_AUTH_TYPE=password` + `ONEDEV_USERNAME`/`ONEDEV_PASSWORD`）：
  OneDev 会自动认证 Basic `user:password` 请求头，因此永远不需要令牌。
- **配置控制台（GUI）**：运行 `npm run setup`（绑定 `http://127.0.0.1:8770/`），
  输入 OneDev 地址 + 账号/密码（或令牌），点击 **保存并测试**。解析后的配置会写到
  凭据存储 `~/.config/dsh-onedev/config.json`（权限 `0600`，可用 `ONEDEV_CONFIG_FILE` 覆盖）。

配置控制台保存好凭据后，下面被拉起的 MCP 服务器会在每次启动时自动从存储读取——
`env` 甚至可以完全省略。当两者同时存在时，环境变量始终优先于存储。

dsh Web 的 **设置 → OneDev** 页面使用的也是同一个存储：它以**卡片**展示每个已配置的环境，点击卡片
打开对应环境的编辑表单（`POST /api/onedev/config` 负责保存 / 删除 / 设为主环境；`POST /api/onedev/probe`
负责测试）。敏感项不回显，留空的敏感字段会回退使用该环境在存储中的凭据——响应中的 `usedStored`
数组会列出哪些字段来自存储——因此重新测试已保存的连接无需重新输入密码/令牌。

---

## 方案 A — stdio（推荐用于本地 OneDev）

先构建服务器（`npm install && npm run build`），然后添加插件条目。

```yaml
# dsh 配置（例如 dsh.config.yaml —— 结构遵循 DSH 自身的约定）
plugins:
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
        # 或用账号/密码（无需令牌；也可先用 `npm run setup` 配置）：
        # ONEDEV_AUTH_TYPE: 'password'
        # ONEDEV_USERNAME: !!js process.env.ONEDEV_USERNAME
        # ONEDEV_PASSWORD: !!js process.env.ONEDEV_PASSWORD
        # 可选：
        # ONEDEV_MCP_READONLY: 'true'
        # ONEDEV_API_TIMEOUT_MS: '30000'
      toolCallTimeoutMs: 60000
      failOnStartupError: false
```

注意事项：

- `command`/`args` 必须是编译后启动器的绝对路径（或用 `npx` 调用发布的包）。
  桥接器会从子进程环境中剔除所有 `*TOKEN*`/`*KEY*`/`*SECRET*`/`DSH_*`
  形如的环境变量，因此令牌/凭据需要显式通过 `env` 注入——或由配置控制台存储自动加载。
- **密码模式**下密码会以 HTTP Basic 随每次请求发送；通过 `env` 传入时从不落盘。
  若依赖配置控制台存储，密码保存在 `~/.config/dsh-onedev/config.json`（权限 `0600`）。
- 启动后工具就会出现；编辑配置后**无需**重启 DSH 即可生效。

### 使用 npm / tsx 进行开发运行

开发阶段可以把 `command` 指向带 `tsx` 的 `npx`：

```yaml
command: npx
args: ['tsx', '/absolute/path/to/dsh-onedev/src/cli.ts']
```

---

## 方案 B — streamable-http（远程 / 共享服务器）

在 DSH 部署可达的一台主机上以 HTTP 模式运行服务器，然后引用其 `/mcp` URL。

```bash
ONEDEV_URL=https://onedev.internal:6610 \
# 用令牌：
ONEDEV_TOKEN="$ONEDEV_TOKEN" \
# 或用账号/密码：
# ONEDEV_AUTH_TYPE=password \
# ONEDEV_USERNAME=admin \
# ONEDEV_PASSWORD="$ONEDEV_PASSWORD" \
ONEDEV_MCP_TRANSPORT=streamable-http \
ONEDEV_MCP_HOST=0.0.0.0 \
ONEDEV_MCP_PORT=8765 \
node /absolute/path/to/dsh-onedev/bin/dsh-onedev-mcp.mjs
```

```yaml
plugins:
  - id: dsh-onedev-http
    name: '@deepseek-ai/dsh-mcp-client'
    config:
      serverName: onedev
      transport: streamable-http
      url: http://onedev-mcp-host:8765/mcp
      headers:
        # MCP 端点前的可选认证
        # Authorization: 'Bearer <mcp-gateway-token>'
      toolCallTimeoutMs: 60000
```

---

## 示例工具调用

桥接成功后，模型即可调用（所有参数均为 JSON）：

| 目标 | 工具调用 |
|---|---|
| 发现环境 | `mcp__onedev__onedev_list_environments` → `{"query":"prod"}`；随后给任何工具传入 `environment` 标识 |
| 列出用户（主环境） | `mcp__onedev__users_list` → `{"term":"alice","count":50}` |
| 列出用户（指定环境） | `mcp__onedev__users_list` → `{"environment":"staging","term":"alice"}` |
| 将某人设为管理员 | `mcp__onedev__group_get_id` → `{"name":"Administrators"}`，然后执行 `group_members_add {userId, groupId}` |
| 创建项目 | `mcp__onedev__project_create` → `{"name":"team/app","codeManagement":true}` |
| 只读安全 | 设置 `ONEDEV_MCP_READONLY=true`；修改型调用会被拒绝 |
| 任意未封装接口 | `mcp__onedev__onedev_api_request` → `{"method":"GET","path":"/issues?project=app"}` |

---

## 故障排查

- **启动后没有工具。** 请先确认服务器本身能启动（`npm start` 在 stdout 上不打印多余内容；
  可运行 `ONEDEV_URL=… ONEDEV_TOKEN=… node bin/dsh-onedev-mcp.mjs` 并用 `tools/list` 测试）。
  若 `failOnStartupError` 为 false，Harness 会记录日志但仍会继续运行。
- **管理工具报 401/403。** 访问令牌必须属于具备管理员权限的用户，且未过期、未禁用。
- **HTTP 模式连接被重置。** 确保端口可从 Harness 主机访问，且路径是 `/mcp`
  （对其他路径有简单的 404 守卫）。
- **工具调用超时。** 调大 `ONEDEV_API_TIMEOUT_MS`（服务端）和/或 `toolCallTimeoutMs`（桥接端）。