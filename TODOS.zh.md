# TODOS

dsh-onedev 插件的任务与目标跟踪。与 `TODOS.md` 同步。状态：`[ ]` 待办 · `[x]` 完成 · `[~]` 进行中。

## 目标：多个 OneDev 环境 + 卡片设置页 + 环境路由（当前，2026-09-16）

### 已完成

- [x] 多环境存储（`src/storage.ts`）：`{ primary, environments }` 字典，提供
      `loadEnvironmentStore` / `saveEnvironment` / `deleteEnvironment` / `setPrimary`
      （原子写 `0600`；首个环境成为主环境；删除主环境后自动重选）。旧扁平格式
      **故意不迁移**（读为无存储，绝不崩溃）。
- [x] 按环境解析配置（`src/config.ts`）：`loadConfig(env, envName?)` 依次取
      `envName → ONEDEV_ENV → 主环境`；环境变量覆盖仅作用于主环境。新增
      `listEnvironments(env, filter?)`（脱敏描述符）。
- [x] MCP 环境路由（`src/index.ts`）：所有非 standalone 工具获得可选 `environment`
      参数并在描述中提示发现工具；provider 改为 `(envName?) => ResolvedConfig`；
      新增独立工具 `onedev_list_environments({ query? })`（`src/tools/environments.ts`）。
      工具数 60 → 61。
- [x] 宿主路由（`plugin/src/host.ts`）与配置控制台（`src/setup/*`）：多环境
      列表/保存/删除/设为主环境 + 按环境探测。
- [x] 卡片设置 UI（`plugin/src/client/*`）：卡片网格 + 右上角「新增环境」按钮 +
      逐环境编辑视图（slug/备注/字段 + 保存/测试/设为主环境/删除/返回/打开）；
      语言包与 `onedev.css` 扩展。
- [x] 文档与测试：重新生成工具文档（61），README / dsh-integration / `.env.example`
      （ONEDEV_ENV）更新；新增 `tests/storage-env.test.mjs`；client/smoke/http-smoke/
      plugin-host/selftest-docs 适配新 API/数量。`npm run build`、`npm test`、两种
      typecheck、`npm run docs:check` 全部通过。

### 后续目标

- [ ] 手动 GUI 确认（需要用户重建/刷新 web 应用）：打开 dsh 设置 → OneDev，新增一个
      环境（slug + 备注），设为主环境，无需重新输入敏感项直接测试连接，然后在聊天里
      调用 `mcp__onedev__onedev_list_environments` 与一个带 `environment` 的管理工具。
- [ ] 可选：存储变化时重启 `dsh-onedev-mcp` 子进程，让桥接立即重新发布工具
      （mcp-client `startConnection`）。
- [ ] 可选：回环配置桥 HTTPS / 可信代理加固。

## 目标：OneDev 设置页持久化体验——无需重新输入即可重新测试连接（此前，2026-09-11）

### 已完成

- [x] 探测回退使用已存储凭据：`POST /api/onedev/probe` 现在会把提交内容与凭据存储合并
      （地址/用户名/令牌/密码留空时回退使用存储值；显式输入仍然优先；地址仍保留
      `cleanUrl` 校验）。响应新增 `usedStored`，列出哪些字段来自存储。这正是
      “重新打开设置页→想测试连接就得重新输入密码”的根因。
- [x] 客户端呈现存储状态：GET 返回的 `passwordSet`/`tokenSet`/`extraHeadersSet` 现在驱动
      “已保存 · 留空保持不变”占位提示与“已加载已保存配置”提示；保存后刷新标志并清空
      敏感输入框；清除后重置整个表单；测试成功时提示是否使用了已保存凭据
      （`testOkStored`）。
- [x] 文案修正：设置页不再声称“需重启 dsh 生效”——MCP 服务器在每次工具调用时重新读取
      凭据存储（与两份 README 保持一致）。
- [x] 测试：`tests/plugin-host.spec.mjs` 基于本地 mock OneDev 覆盖探测回退（断言由存储的
      密码/令牌构建的精确 `Authorization` 请求头，以及显式输入的优先级）；该用例已接入
      `npm test`（在 `build:plugin` 之后运行）。

### 后续目标

- [ ] 手动 GUI 确认（需要用户的已登录浏览器）：重新打开 dsh 设置 → OneDev，确认表单
      自动回填与“已保存”占位提示，不重新输入密码直接点击测试连接，再调用一次
      `mcp__onedev__*` 工具。
- [ ] 可选：存储变化时重启 `dsh-onedev-mcp` 子进程，让桥接立即重新发布工具
      （mcp-client `startConnection`）。
- [ ] 可选：为回环配置桥增加 HTTPS / 可信代理加固。

## 目标：docs.onedev.io 文档查询（此前，2025-09-07）

### 已完成

- [x] 新增独立工具模块 `src/tools/docs.ts`，包含三个工具：
      `onedev_docs_search`（官方文档全文检索）、`onedev_docs_read`（把一页文档读取为
      含标题/列表/链接/代码块的可读文本并附相关页面链接）、`onedev_docs_list`
      （基于 sitemap 的页面列表，可按类目过滤）。
- [x] 索引按需构建：`https://docs.onedev.io/sitemap.xml` + 每页服务端渲染的
      `<article>` 内容（站点没有公开搜索 API）；内存缓存带 TTL（sitemap 1 小时、
      页面 24 小时）与 `refresh` 标志；抓取并发上限 8；`ONEDEV_DOCS_URL` 可指向镜像。
- [x] `ToolDefinition` 新增 `standalone: true`：文档工具跳过“未配置”门控，
      无需任何 OneDev 连接/凭据即可运行。
- [x] `scripts/gen-tools-doc.mjs` 的 ZH 映射补齐；重新生成
      `docs/tools.md`/`docs/tools.zh.md`（60 个工具）。
- [x] 两版 README 同步更新（60 个工具、文档查询功能条目、环境变量表、工具参考表、
      测试章节）；`.env.example` 补充 `ONEDEV_DOCS_URL` 说明。
- [x] 单元测试 `tests/docs.test.mjs`（8 个用例，mock fetch：排序、缓存、refresh、
      读取转换、URL/外部主机处理、类目列表、SPA 回退守卫）已接入 `npm test`；
      冒烟测试覆盖新工具。
- [x] 在线自测 `scripts/selftest-docs.mjs`：在无凭据条件下经 stdio 启动服务器，
      仅用文档工具回答“如何完整配置一个项目的 CI&CD，并且利用 onedev 的密钥系统写入
      敏感信息”——密钥检索首选 `/tutorials/cicd/job-secrets`，CI/CD 教程页覆盖
      流水线配置；页面读取返回可操作内容。

### 后续目标

- [ ] 手动 GUI 确认（需要用户的已认证浏览器）：OneDev 设置页正常渲染；保存真实服务器/账号后，
      调用 `mcp__onedev__*` 工具保存后无需重启即可生效。
- [ ] 可选：存储变化时重启 `dsh-onedev-mcp` 子进程，使桥立即重新发布工具（mcp-client `startConnection`）。
- [ ] 可选：为回环配置桥增加 HTTPS/受信代理加固。

## 目标：dsh Web 设置集成（此前，2025-09-07）

### 已完成

- [x] 包名更名 `@altermoe/dsh-onedev` → `dsh-onedev`（client-modules 扫描发现浏览器半边所必需）。
- [x] 新增宿主插件（`plugin/src/host.ts` → `lib/index.js`）：回环路由
      `GET/POST /api/onedev/config` 与 `POST /api/onedev/probe`，复用凭据存储
      （`0600`、原子写、留空输入时保留密钥）。
- [x] 新增客户端插件（`plugin/src/client/*` → `lib/client.js`）：注册 OneDev `settings.section`
      （id `onedev`，order 120），含账号/密码表单、额外透传选项、测试按钮与“打开 OneDev”快捷入口；
      语言包 `settings.onedev`。
- [x] ONEDEV_URL 现可从 GUI 存储运行时解析（环境变量或存储，按调用逐次读取）——无需 `ONEDEV_URL` 环境变量；
      存储为空时不再导致 dsh 启动崩溃。
- [x] `Config`/`StoredConfig` 新增透传参数：`apiBase`、`transport`、`httpHost`、`httpPort`、
      `extraHeaders`（src/config.ts、src/storage.ts、src/setup/server.ts、src/client.ts）。
- [x] 打包元数据：`dsh.client`、`dsh.bundle.patch`（`cordis.patch.yml`）、`./client` 导出、`main` → 宿主插件，
      MCP 保留为 `bin`。
- [x] 构建流程：`scripts/build-plugin.mjs`（esbuild）→ `lib/index.js` + `lib/client.js`；
      `npm run build` 同时构建两者；`npm test` 通过。
- [x] 重启脚本：`scripts/restart-dsh.sh`。
- [x] profile 接入：`dsh-onedev` 加入 `~/.dsh/profiles/web` bundles；`deepseek-harness/dsh-onedev` 符号链接。
- [x] 验证：启动图包含 `dsh-onedev`；`dsh-onedev/client.js` 以 module-loader 格式正常下发，
      内含 `settings.section`/`settings.onedev` 注册（在临时 dsh web 实例上验证）。
- [x] UI 对齐 dsh 风格：令牌化、带命名空间前缀的 `onedev.css`（apply 时注入一次），
      使用 `--dsw-alias-*` 令牌——8px 输入框、18px 药丸按钮、16px 圆角卡片、模块填充底色、
      统一焦点环；无内联样式。

### 后续目标

- [ ] 手动 GUI 确认（需要用户的已认证浏览器）：OneDev 设置页正常渲染；保存真实服务器/账号后，
      调用 `mcp__onedev__*` 工具保存后无需重启即可生效。
- [ ] 可选：存储变化时重启 `dsh-onedev-mcp` 子进程，使桥立即重新发布工具（mcp-client `startConnection`）。
- [ ] 可选：为回环配置桥增加 HTTPS/受信代理加固。
- [x] 重新生成 `docs/tools.md`/`docs/tools.zh.md`——已在文档查询目标中完成（工具数量变为 60）。