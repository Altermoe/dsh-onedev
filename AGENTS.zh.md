# AGENTS 迭代协作规则（Agent Collaboration Rules）

> 本文档适用于在本仓库工作的每一次代码代理迭代（`AGENTS.md` 为英文版，`AGENTS.zh.md` 为中文版）。
> 每次改动、提交或新增功能前，必须先阅读并遵守以下规则。

## 1. 硬性要求：双语文档（Bilingual Documentation Mandate)

**项目中每一份英文 Markdown 文档，都必须提供等价的 `*.zh.md`（简体中文）版本。**
二者必须保持内容一致、同步更新。

- 英文 `README.md` ←→ 中文 `README.zh.md`
- 英文 `docs/*.md` ←→ 中文 `docs/*.zh.md`

规则清单：

1. **成对存在**：任何 `foo.md` 都对应一个 `foo.zh.md`；反之亦然。不存在“只有英文”
   或“只有中文”的单语文档。
2. **同步修改**：改动/新增任一语言版本时，必须**在同一个迭代中**同步更新另一版本，
   不能遗留未同步的语言。
3. **内容对等**：两份文档表达同一事实，仅语言不同；命令、表格、路径、工具名、链接指向
   等可执行内容不得差异，允许按各自语言惯例微调排版。
4. **生成式文档**：凡由脚本生成的文档（如 `docs/tools.md` 与 `docs/tools.zh.md`），
   一律通过 `npm run docs` 重新生成，保持单一数据源，**禁止手改生成物**；当数据源
   （工具注册表、`scripts/gen-tools-doc.mjs` 中的中文映射）发生变化时，必须重新生成。
5. **数量校验**：每次迭代提交前运行一致性检查，确保全部 `*.md` 都有对等 `*.zh.md`。

> 仓库根目录 `README.md` 顶部应保留语言跳转链接（英文 / 中文）。

## 2. 文档新增流程（Adding a New Document）

新增任何 `.md` 时，按以下步骤完成，否则视为未完成：

1. 编写英文版 `foo.md`。
2. 立即编写对等中文版 `foo.zh.md`（翻译、内容对齐），并在**同一提交内**完成。
3. 若该文档由脚本生成，则只改数据源/生成器，运行 `npm run docs` 生成两版，校验后提交。
4. 更新相关文档中的链接清单（例如 README 的“延伸阅读”），确保同时给出中英文链接。

## 3. 工具演进规则（Tool Evolution）

新增、重命名或删除任何一个 MCP 工具时：

1. 在 `src/tools/*` 中修改工具定义（名称、标题、描述、Zod schema）。
2. **同时**在 `scripts/gen-tools-doc.mjs` 的 `ZH` 映射中新增/更新/删除该工具的中文用途说明。
3. 运行 `npm run docs` 重新生成 `docs/tools.md` 与 `docs/tools.zh.md`。
4. 若工具行为涉及文档（API 映射、集成示例），同步更新 `docs/onedev-api.md` 与
   `docs/onedev-api.zh.md`、`docs/dsh-integration.md` 与 `docs/dsh-integration.zh.md`。
5. 若工具数量相关数字发生变化（如 README 中的“57 个工具”），两版 README 均需同步。

## 4. 必做校验（Before Every Commit）

每次改动后，**至少**运行：

```bash
npm run build   # 必须通过
npm test        # 单元 + stdio 冒烟 + HTTP 冒烟，必须全绿
npm run docs    # 重新生成双语工具文档
```

以及双语完整性检查（见第 5 节），确认没有遗漏的 `*.zh.md`。

## 5. 双语完整性检查脚本

可将以下命令作为一次性校验，或在 CI / `npm run` 脚本中接入：

```bash
# 找出所有英文 .md，检查是否每个都有对等 .zh.md（只检查仓库自身文档，跳过 node_modules）
find . -path ./node_modules -prune -o -name '*.md' -print |
  grep -v '\.zh\.md$' |
  sed 's/\.md$//' |
  while read -r base; do
    [ -f "${base}.zh.md" ] || echo "MISSING zh: ${base}.md"
  done
```

期望输出为空；出现任何 `MISSING` 都必须补齐后再合入。

> 注：`AGENTS.md` 本身也遵循此规则——其中文版为 `AGENTS.zh.md`。

## 6. 其它协作约定

- **不要关闭/中断正在运行的 DSH 进程或会话**；改动一律在源码与文件中完成，无需重启作业。
- 改动聚焦于当前迭代目标，避免无关的大规模重构。
- 文档与代码同批评审：任何影响外部行为的改动，必须连同其双语文档一起交付。
- 若某个单词/术语保留英文（如工具名、环境变量名、`Bearer`、`stdio`），两版文档应保持一致，
  并可用中文加以说明。

## 7. 开发日志与后续目标

> 便于后续迭代接续的工作笔记。本节须在 `AGENTS.md` 与 `AGENTS.zh.md` 之间保持同步；
> 当前目标的任务清单以 `TODOS.md` / `TODOS.zh.md` 为准。

### 进度（2026-09-30 会话，设置页返回按钮布局）

- **环境编辑视图**：**返回**按钮从底部操作行移到面板的**左上角**（`.onedev-back`，
  作为 flex 列的第一个子元素并设 `align-self: flex-start`），无需滚动表单即可退出当前环境的
  编辑。底部 `onedev-link` 返回按钮已移除；**打开 OneDev** 仍保留在操作行。已同步更新
  `README.md`/`README.zh.md`；`npm run build:plugin`、`plugin` 类型检查与 `npm test` 均通过，
  运行中的 `dsh web`（客户端 HMR 产物监听）已下发重新构建的 `lib/client.js`
  （通过 `/plugins/events` 的图事件核实）。

### 进度（2026-09-30 会话，dsh-v0.2.0-rc.2 兼容性）

- **已在真实 `dsh-v0.2.0-rc.2` 运行时上验证**（隔离的 `DSH_HOME`）：profile bundle 组合
  （`--dump-config`）、`dsh plugin add`（兼容性门禁无告警）、隔离启动 `dsh web`（客户端图行
  `dsh-onedev` 且 `/plugins/dsh-onedev/client.js` 正常下发、`GET /api/onedev/config` 可用、
  成功生成 `dsh-onedev-mcp` 子进程），并用 0.2.0-rc.2 的声明对 `plugin/src` 做了完整类型检查
  （0 错误；`settings.section` 注册即使去掉原先的 `as never` 强转也能通过）。
- **修复项**：
  * `package.json` 的 `files` 现在包含 `cordis.patch.yml` —— 此前它被排除在 npm 包之外，
    从 registry 安装时整个 bundle 会被静默跳过。
  * `cordis.patch.yml` 不再硬编码绝对启动路径：`dsh-onedev-mcp` 行通过针对启动器提供的
    `profileContext` 的 `!!js` 表达式解析
    `<profile>/node_modules/dsh-onedev/bin/dsh-onedev-mcp.mjs`。
  * `engines.node` 修正为 `^22.19.0 || >=24.0.0`（启动器用 `require()` 加载 ESM CLI，
    与 DSH 自身的引擎范围一致），并新增 `engines.dsh`。
  * 新增 `peerDependencies["@deepseek-ai/dsh"] = "^0.2.0-rc.2"`，使 DSH 的插件兼容性门禁
    会校验本 bundle（`0.1.x` 会被判为不兼容）。
  * devDependencies 升级到 `@deepseek-ai/dsh-*@^0.2.0-rc.2`，使仓库自身的类型检查针对运行时
    版本（锁文件已更新）。
  * 注入的样式表标签现在带 `data-plugin`，因此 client-modules 在 materialize 时的
    `claimStyles` 扫描既不会把它算作后续插件的样式，也不会在本插件卸载时泄漏。
  * `scripts/build-plugin.mjs` 从 `package.json.name` 推导注册 id（以及客户端的
    `name`/样式标签），使 manifest、bundle id 与模块表键不再漂移。
- **检查**：`npm run build`、`npm test`、两个 `tsc` 类型检查、`npm run docs`、
  `npm run docs:check` 全部通过。

### 进度（2026-09-17 会话，修复 OneDev 使用日志中 MCP 报错刷屏）

- **根因 A — `environment` 泄漏进请求体（HTTP 400 `Unrecognized field "environment"`）**。
  按调用路由用的 `environment` 参数被合并进每个工具的输入 schema，并被转发进逻辑参数，
  于是那些把整个参数对象当作 POST body 的工具（`project_create`、`project_update`、
  `role_create`、`role_update`、`access_token_create`）会把 `environment` 发给 OneDev，
  从而被拒绝。**修复**：`src/index.ts` 的 `buildServer` 现在在调用 `def.run` 之前，
  一次性、集中地把 `environment` 剔除 —— 路由元数据不再进入任何工具 body/query。
- **根因 B — 列表工具对严格的 `query` 语法描述有误（HTTP 406 `Invalid query`）**。
  原有描述推荐的示例（`project is "foo"`、裸词 `"dsh"`）会被 OneDev 的 criteria 解析器拒绝。
  **修复**：`src/tools/types.ts` 新增 `normalizeQuery`（丢弃空白 query）与
  `withListQueryHint`（把 406/400 “Invalid query” 转成建设性的语法提示）。
  `projects_list` 与 `builds_list` 现在给出合法语法示例（`"Name" is "x"`、`"Project"/"Job"/"Version"
  is …`）并使用该封装。
- **根因 C — 不存在的端点（HTTP 404/405）**。
  * 移除没有后端支持的 `access_tokens_list`（OneDev 不暴露全局 `GET /access-tokens`；
    按用户列出的方式在 `user_access_tokens` 中）。工具数 **61 → 60**；docs/README 计数与
    自动生成的 `docs/tools.md`/`.zh.md` 均已更新（另有 `docs/onedev-api` 说明、
    `scripts/selftest-docs.mjs`、`scripts/gen-tools-doc.mjs` 的中文映射表）。
  * `group_get_id`：`GET /groups/ids/{name}` 仅在新版 OneDev 存在；遇到 404 时回退到
    `GET /groups?name=…` + 精确匹配（`src/tools/groups.ts` 中的 `resolveGroupId`）。
  * `server_version`：在缺少 `/server/version` 的实例上降级为 `{version: null, note}`
    （硬错误 → 友好说明）。
- **测试**：新增 `tests/tools-regression.test.mjs`（7 个用例）通过“内存 MCP 传输 + 模拟 fetch”
  驱动真实服务器 —— 验证 create/update body 不再含 `environment`、`access_tokens_list` 已移除、
  空白 query 会被丢弃、非法 query 给出语法提示、以及 `server_version` 的成功与降级路径。
  已接入 `npm test`。
- **验证**：`npm run build`、`npm test`（全部套件通过，stdio/HTTP 均列 60 个工具）、
  两个 `tsc` 类型检查、`npm run docs`、`npm run docs:check` 干净、在线
  `scripts/selftest-docs.mjs` 通过。针对真实 OneDev 16.6.1 在线校验：`group_get_id`
  走 `/groups/ids/{name}`；旧版 localhost 回退到列表路径；`server_version` 返回 16.6.1，
  旧实例返回友好说明。

### 进度（2026-09-16 会话，多环境 + 卡片设置页 + 环境路由）

- **多环境存储**（`src/storage.ts`）：凭据存储改为“命名环境”字典（
  `{ primary, environments: { <slug>: StoredConfig } }`，每个环境自带独立的地址/凭据
  /`remark`）。新 API `loadEnvironmentStore` / `saveEnvironment` / `deleteEnvironment`
  / `setPrimary`（原子写 `0600`，首个环境自动成为主环境，删除主环境后自动重选）。
  **旧版扁平单一配置格式故意不迁移**：无法识别的文件一律读为“无存储”（`null`），
  绝不让启动崩溃，配置退化为仅环境变量。
- **按环境解析配置**（`src/config.ts`）：`loadConfig(env, envName?)` 依次取
  `envName → ONEDEV_ENV → 存储主环境`。环境变量覆盖（`ONEDEV_URL` 等）**仅作用于主环境**
  ，保留了传统 CLI 路径。新增 `listEnvironments(env, filter?)` → 脱敏的
  `EnvironmentDescriptor[]`（slug/remark/url/authType/凭据标志/primary/configured）并导出。
- **MCP 环境路由**（`src/index.ts`）：所有非 standalone 工具自动获得可选 `environment`
  参数（合并进 zod schema），并在描述中提示调用 `onedev_list_environments`；按次调用的
  配置提供器改为 `(envName?) => ResolvedConfig`。新增独立发现工具
  `onedev_list_environments({ query? })`（`src/tools/environments.ts`）列出已配置环境，
  让 AI 能感知/检索并随后无歧义地指向特定服务器。工具数 60 → **61**。
- **宿主路由**（`plugin/src/host.ts`）：`/api/onedev/config` 现以 GET 返回环境列表、
  POST 按操作分发（`save`/`delete`/`setPrimary`，或 `clear:true`）；`/api/onedev/probe`
  针对单个环境（`env`/`slug`），留空的敏感字段回退该环境已存凭据。配置控制台
  （`src/setup/*`）同步更新为多环境 API（list/save/delete/set-primary）。
- **卡片设置 UI**（`plugin/src/client/*`）：OneDev 设置页改为卡片网格，右上角
  **新增环境**按钮；点击卡片进入该环境的编辑表单（slug + 备注 + 原有字段），提供
  保存 / 测试 / 设为主环境 / 删除 / 返回 / 打开。语言包与 `onedev.css` 补充了卡片、
  头部与空态样式。
- **文档 + 测试**：`scripts/gen-tools-doc.mjs` 补中文字典并重新生成
  `docs/tools.md`/`.zh.md`（61）；两份 README、`docs/dsh-integration.md`/`.zh.md` 与
  `.env.example` 更新（多环境、`ONEDEV_ENV`）；新增 `tests/storage-env.test.mjs`；
  `tests/client.test.mjs`、`tests/smoke.mjs`、`tests/http-smoke.mjs`、
  `tests/plugin-host.spec.mjs` 与 `scripts/selftest-docs.mjs` 适配新 API/数量。
  `npm run build`、`npm test`、两种 typecheck、`npm run docs:check` 全部通过。

### 后续目标

1. **手动 GUI 确认（需要用户的已登录浏览器）**：用户重建/刷新 web 应用后，打开 dsh
   设置 → OneDev，确认卡片列表，新增一个环境（slug + 备注），设为主环境，不重新输入
   敏感项直接测试连接，然后在聊天里调用 `mcp__onedev__onedev_list_environments` 与
   一个带 `environment` 的管理工具并确认可用。
2. 运行时 MCP 重启：如今存储编辑会在运行中进程的下一次工具调用生效；若希望桥接立即
   重新发布工具，评估在存储变化时重启 `dsh-onedev-mcp` 子进程（参见
   `@deepseek-ai/dsh-mcp-client` 的 `startConnection`）。
3. 回环配置桥（config bridge）可选 HTTPS/可信代理加固，超出当前同源 + 回环守卫。
4. 若将来需要“每个环境一个 MCP 连接”（`mcp__onedev-<name>__*`），那将需要 dsh 运行时
   动态增减 `mcp-client` 实例——超出当前“单连接 + environment 参数”的设计范围。
5. 若文档站点迁移（非 Docusaurus 布局），需重审 `src/tools/docs.ts` 中的
   `articleToText`/`listDocPaths`——转换器目前针对当前 Docusaurus 标记
   （`<article>`、`<pre>`、标题）编写。

### 进度（2026-09-11 会话，设置页持久化体验）

- **找到并修复根因**：配置本身一直都是持久化的（凭据存储
  `~/.config/dsh-onedev/config.json`），但 `POST /api/onedev/probe` 完全忽略了存储
  （原来的代码 `void configFile`）。由于 `GET /api/onedev/config` 刻意不回显任何密钥，
  重新打开的设置页密码/令牌字段是空的，因此每次点“测试连接”都会失败，必须重新输入
  凭据。
- **探测现在会回退到存储**（`plugin/src/host.ts`）：提交内容与存储配置合并——
  留空的地址/用户名/令牌/密码字段回退使用存储值，显式输入仍然优先，地址保留
  `cleanUrl` 校验。探测响应新增 `usedStored: string[]`，列出哪些字段来自存储。
  `apiBase`/`apiTimeoutMs` 同样回退到存储。
- **客户端呈现存储状态**（`plugin/src/client/OneDevSection.tsx`）：脱敏 GET 返回的
  `passwordSet`/`tokenSet`/`extraHeadersSet` 标志现在驱动敏感字段的“已保存 ·
  留空保持不变”占位提示，并额外显示“已加载已保存的配置”提示。保存成功后用返回的
  快照刷新标志并清空敏感输入框（已持久化、不回显）；清除后重置整个表单；使用已保存
  凭据探测成功时显示 `testOkStored`。
- **文案修正**：设置页不再声称“重启 dsh 生效”——MCP 服务器在每次工具调用时重新读取
  存储，与两份 README 一致。`description`/`saved`/`applyNote` 在两种语言中同步更新。
- **测试**：`tests/plugin-host.spec.mjs` 基于本地 mock OneDev 服务器覆盖探测回退
  （断言由存储的密码/令牌构建的精确 `Authorization` 请求头，以及显式密码的覆盖优先级；
  不访问外部网络）。该用例已接入 `npm test`（在 `build:plugin` 之后运行）。

### 已验证（设置持久化会话）

- `npm run build`、`npx tsc -p plugin/tsconfig.json --noEmit`、`npm test` 全部通过：
  13 个客户端/存储单元测试、8 个文档测试、60 工具 stdio + streamable-http 冒烟、
  7 个认证测试，以及扩展后的 plugin-host 用例（配置往返、回环守卫、清除、探测校验、
  已存凭据探测回退）。
- `npm run docs:check` 干净——每个 `*.md` 都有对应的 `*.zh.md`。

### 后续目标

1. **手动 GUI 确认（需要用户的已登录浏览器）**：重新打开 dsh 设置 → OneDev，确认表单
   自动回填与“已保存”占位提示，不重新输入密码直接点击**测试连接**，然后在聊天里调用
   一次 `mcp__onedev__*` 工具并确认可用。
2. 运行时 MCP 重启：如今存储编辑会在运行中进程的下一次工具调用生效；若希望桥接立即
   重新发布工具，评估在存储变化时重启 `dsh-onedev-mcp` 子进程（参见
   `@deepseek-ai/dsh-mcp-client` 的 `startConnection`）。
3. 在现有同源 + 回环守卫之外，为回环配置桥做可选的 HTTPS/可信代理加固。
4. 若文档站点迁移（非 Docusaurus 布局），重新审视 `src/tools/docs.ts` 中的
   `articleToText`/`listDocPaths`——转换器针对当前 Docusaurus 标记
   （`<article>`、`<pre>`、标题）编写。

### 进度（2025-09-07 会话，文档查询能力）

- **新增文档查询 MCP 能力**（`src/tools/docs.ts`）——面向位于 https://docs.onedev.io/ 的
  OneDev 官方文档的三个工具：
  - `onedev_docs_search` —— 全文检索。该站点没有公开搜索 API（`/search` 页面走客户端
    Algolia；`/search-index.json` 只是 SPA 回退），因此工具按需自建索引：sitemap → 各页 →
    `<article>` 文本。排序权重为标题 > 路径 > 正文命中，另加“全部词都命中”与整句短语加分；
    结果附带文本摘要。非英文（CJK）查询回退为原始子串匹配，未命中时返回“文档为英文”的提示。
  - `onedev_docs_read` —— 把一页文档读取为可读文本：标题（`#`）、列表、链接（转绝对地址）、
    图片 alt、围栏代码块；`related` 携带页面内指向其他文档页的链接。接受路径或完整 URL；
    拒绝外部主机；未知路径仍会尝试抓取（并标注 `inSitemap: false`）。
  - `onedev_docs_list` —— 基于 sitemap 的页面列表，附各类目计数，可按类目子串过滤；
    列表标题由 slug 推导（精确标题请用 read/search）。
- **独立（standalone）工具**：`ToolDefinition` 新增 `standalone?: boolean`
  （`tool(..., { standalone: true })`）。在 `buildServer`（`src/index.ts`）中，standalone 工具
  跳过按调用解析配置的门控，以 null 客户端运行——文档工具在完全没有任何 OneDev 凭据、
  插件尚未配置时即可使用。其余工具行为不变。
- **索引缓存**：按文档基址各存一份内存缓存；sitemap TTL 1 小时、页面 TTL 24 小时；
  每个工具都接受 `refresh: true`。抓取并发上限 8，单请求超时 15 秒。
  `ONEDEV_DOCS_URL`（每次调用时读取）可把文档基址指向镜像。若 sitemap 返回的是无
  `<loc>` 的 SPA 回退 HTML（HTTP 200），会显式报错而不是得到空索引。
- **双语文档 + 测试**：`scripts/gen-tools-doc.mjs` 补齐 ZH 映射；重新生成
  `docs/tools.md`/`docs/tools.zh.md`（现为 60 个工具）；两版 README 同步更新
  （工具数量、功能条目、环境变量表、工具参考表、测试章节）；`.env.example` 补充
  `ONEDEV_DOCS_URL`。新增单元测试 `tests/docs.test.mjs`（mock fetch，无网络）并接入
  `npm test`；冒烟测试覆盖新工具；在线自测脚本见 `scripts/selftest-docs.mjs`。

### 已验证（文档查询会话）

- `npm run build`、`npm test` 全绿：stdio 与 streamable-http 下均列出 60 个工具；
  `tests/docs.test.mjs` 8/8（排序、缓存、refresh、读取转换、URL 处理、列表过滤、SPA 守卫）。
- `npm run docs:check` 无缺失——每个 `*.md` 都有对应的 `*.zh.md`。
- 在线自测 `node scripts/selftest-docs.mjs`（真实 docs.onedev.io，无 OneDev 凭据）：
  tools/list → 60 个工具；中文原句提问即可命中；英文检索 “job secrets sensitive information”
  首位即 `/tutorials/cicd/job-secrets`（其后为 `branch-job-secret`、`appendix/job-variables`）；
  CI/CD 检索命中 `understanding-pipeline`、`reuse-buildspec`、`plain-old-build` 等；
  `onedev_docs_list` category=tutorials/cicd → 35 页；页面读取返回可操作内容。

### 后续目标

1. **手动 GUI 验证（需要用户的已认证浏览器）**：打开 dsh 设置 → 确认出现 **OneDev** 页；保存真实的
   服务器/账号；然后在对话中调用 `mcp__onedev__*` 工具，确认保存后无需重启即可生效。
2. 运行时 MCP 重启：目前存储改动对运行中进程的下一次调用即生效；若希望桥自动重新发布工具，可评估在存储
   变化时重启 `dsh-onedev-mcp` 子进程（参见 `@deepseek-ai/dsh-mcp-client` 的 `startConnection`）。
3. 可选加固：在现有“同源 + 回环”守卫之外，为回环配置桥增加 HTTPS/受信代理支持。
4. 若文档站点改版（不再是 Docusaurus 布局），需要重新审视 `src/tools/docs.ts` 中的
   `articleToText`/`listDocPaths`——转换器按当前 Docusaurus 标记（`<article>`、`<pre>`、标题）编写。

### 进度（2025-09-07 会话，dsh-onedev → dsh Web 设置集成）

- **包名更名** `@altermoe/dsh-onedev` → `dsh-onedev`。这一步是**必需的**：client-modules 扫描器
  以 loader 的模块说明符为键，通过向上查找 `name` 与之相等的最近一层 `package.json`
  （`packages/client/modules` 中的 `locatePkgJson`/`nearestPackage`）判断某行是否为“客户端包”。
  包名不一致会导致插件被静默排除在 Web 启动图之外。
- **在 MCP 服务之上新增 dsh 插件面**：
  - `plugin/src/host.ts` → `lib/index.js`：一个 cordis 宿主插件（`webServer`），挂载回环路由
    `GET/POST /api/onedev/config`（读取 / 保存 / `clear:true`）与 `POST /api/onedev/probe`。
    复用 `src/storage.ts` 中的凭据存储；仅当提交非空值时才覆盖密钥；保存为 `0600` + 原子写。
  - `plugin/src/client/*` → `lib/client.js`：一个 Web 客户端插件，注册一级 **OneDev 设置页**
    （`settings.section`，id `onedev`，order 120，语言包 `settings.onedev`），包含管理员账号/密码表单、
    额外的透传选项、测试按钮，以及一个“打开 OneDev”快捷入口。客户端通过同源 `fetch` 访问宿主路由。
  - 打包元数据：`dsh.client` 清单（platform `web`）、`dsh.bundle.patch` → `cordis.patch.yml`
    （插入 `dsh-onedev` 与一个 `env: {}` 的 `dsh-onedev-mcp` `@deepseek-ai/dsh-mcp-client` 行），
    包 `main` 现指向宿主插件，MCP 服务仍保留为 `bin`。
- **ONEDEV_URL 改为从 GUI 配置，而非环境变量。** MCP 服务在**每次工具调用**时按“环境变量优先、其次凭据
  存储”惰性解析配置（`src/index.ts` 的 `buildServer(ConfigProvider)`；`src/cli.ts` 的 `storeProvider`）。
  设置页写入的凭据存储下一次调用即可生效——无需重启、无需 `ONEDEV_URL` 环境变量；存储为空时也不再导致
  dsh 启动崩溃（工具返回友好的“未配置”提示）。
- **新增透传参数** 到 `Config`/`StoredConfig`：`apiBase`、`transport`、`httpHost`、`httpPort`、
  `extraHeaders`（环境变量或存储，环境变量优先）。由 `src/config.ts`、`src/storage.ts`、
  `src/setup/server.ts` 处理。
- **重启脚本**：`scripts/restart-dsh.sh` 停止并重启 `web` profile（`pnpm dsh web --no-open`）并等待就绪。
- **UI 对齐 dsh 风格**：OneDev 设置页现通过一份令牌化、带命名空间前缀的样式表
  （`plugin/src/client/onedev.css`，在 apply 时注入一次）渲染，全部使用共享的 `--dsw-alias-*` 令牌——
  8px 圆角输入框、18px 药丸按钮、16px 圆角卡片、模块填充底色与统一的焦点环。不再使用内联样式或纯色；
  由于 bundle 由 esbuild 构建（`loader: { '.css': 'text' }`），该样式表是一份作用域的全局样式而非 CSS Module。
- **profile 接入**：`~/.dsh/profiles/web/package.json` 将 `dsh-onedev` 加入 `dsh.profile.bundles`；
  `deepseek-harness/dsh-onedev` 是指向本包的符号链接。

### 已验证

- `npm run build` 与 `npm test` 通过（MCP 57 个工具，单元测试 + stdio + HTTP 冒烟）。
- 插件类型检查（`npx tsc -p plugin/tsconfig.json`）通过。
- `node tests/plugin-host.spec.mjs` 通过（配置读写、回环守卫、清除、探测校验；文件权限 `0600`）。
- 惰性无配置：生成的 MCP 服务列出 57 个工具，工具调用返回“未配置”提示而非崩溃；存在存储时访问会发起真实请求
  （证明按调用逐次读取存储的运行时行为）。
- 在一个临时 `dsh web` 实例上，启动图已包含 `dsh-onedev`，`dsh-onedev/client.js` 以 module-loader 格式
  正常下发，内含 `settings.section`/`settings.onedev` 注册。

### 后续目标

1. **手动 GUI 验证（需要用户的已认证浏览器）**：打开 dsh 设置 → 确认出现 **OneDev** 页；保存真实的
   服务器/账号；然后在对话中调用 `mcp__onedev__*` 工具，确认保存后无需重启即可生效。
2. 运行时 MCP 重启：目前存储改动对运行中进程的下一次调用即生效；若希望桥自动重新发布工具，可评估在存储
   变化时重启 `dsh-onedev-mcp` 子进程（参见 `@deepseek-ai/dsh-mcp-client` 的 `startConnection`）。
3. 可选加固：在现有“同源 + 回环”守卫之外，为回环配置桥增加 HTTPS/受信代理支持。
4. 若任何工具数量或描述发生变化，再更新生成的 `docs/tools.md`/`docs/tools.zh.md`（本次无变化）。