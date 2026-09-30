# dsh-onedev-mcp

> **Language:** English · [中文（简体）](README.zh.md)

**dsh-onedev** is a plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) that gives an AI direct, authenticated access to a [OneDev](https://onedev.io) Git / CI / CD server's **REST API for administrator operations** — through the [Model Context Protocol (MCP)](https://modelcontextprotocol.io).

It ships a **standalone MCP server** (`dsh-onedev-mcp`) that connects straight to the OneDev REST API using a OneDev access token. DeepSeek Harness attaches it with the built-in `@deepseek-ai/dsh-mcp-client` bridge, so every OneDev admin operation becomes an ordinary tool the model can call (prefixed `mcp__onedev__…`).

> This is the "direct connection" primitive the plugin is built around: instead of using the web UI, the AI drives OneDev's real REST API (`/~api/*`) with full CRUD for users, groups, membership, roles, projects, build agents, settings and more — or issues *any* request via the generic `onedev_api_request` tool.

---

## Feature overview

- **MCP server with 60 tools**: 56 for administration (users, groups, roles, group membership incl. granting administrator, projects, authorizations, build agents, agent tokens, builds, global settings, access tokens) plus 3 **documentation-query** tools and **environment discovery** (`onedev_list_environments`).
- **Multiple OneDev environments**: configure more than one OneDev server (each with its own URL, credentials, and a free-form **remark**). Every connection-backed tool accepts an optional `environment` slug (defaults to the primary environment), so the AI can target a specific server unambiguously; `onedev_list_environments` lists them all.
- **OneDev documentation query**: `onedev_docs_search` / `onedev_docs_read` / `onedev_docs_list` give the model access to the official OneDev docs at [docs.onedev.io](https://docs.onedev.io/) — full-text search over every page, readable page content, and a category listing. These tools are **standalone**: they need no OneDev connection or credentials and work even before the plugin is configured.
- **Generic direct-connection tool** `onedev_api_request` — execute *any* authenticated request against `ONEDEV_URL/~api/*` when no dedicated wrapper exists (the whole OneDev REST surface stays reachable).
- **Two transports**: `stdio` (for DSH and other stdio MCP clients) and `streamable-http` (for remote/HTTP clients, at `/mcp`).
- **Secure by default**: two authentication modes — a bearer **access token** (`Authorization: Bearer <token>`) **or** a plain **account/password** (`Authorization: Basic base64(user:pass)`), which OneDev authenticates automatically (no token to mint first). Optional **read-only mode** (`ONEDEV_MCP_READONLY=true`) refuses every mutating request; configurable per-call timeout.
- **dsh Web settings tab (OneDev)**: when installed as a dsh bundle this plugin adds a first-level **OneDev** section to the dsh Web GUI (`Settings`). It renders configured environments as **cards** with an **Add environment** button in the top-right; clicking a card opens that environment's edit form (server URL, administrator **username/password** or access token, a display **remark**, and the extra pass-through options), where you can validate a live connection, Save, set it as primary, or delete it. The connection resolves at runtime from the credential store on every tool call, so **no environment variable is required** and edits are picked up without restarting dsh.
- **Set-up GUI** (`npm run setup`): a localhost console where you enter the OneDev URL and either a token or an account/password; it tests the connection against OneDev and persists the credentials. Works with the password mode this removes the "token chicken-and-egg" — you no longer have to log into the OneDev web UI to create a token before the MCP can start.
- **Typed, self-describing tools**: every tool has a title, description and JSON Schema generated from a strict Zod schema, so the model sees clear argument contracts.
- **Complete test + docs**: unit tests, a stdio smoke test, an HTTP smoke test, and full documentation in [`docs/`](docs/).

---

## Repository layout

```
dsh-onedev/
├─ src/
│  ├─ index.ts          # MCP server builder; registers all tools
│  ├─ cli.ts            # stdio / HTTP / setup-console launcher
│  ├─ config.ts         # env + per-environment config resolution (multi-env)
│  ├─ client.ts         # typed OneDev REST client (Bearer / Basic auth, errors)
│  ├─ auth.ts           # auth-header builder + connection probe (used by the GUI)
│  ├─ storage.ts        # multi-environment credential store (save/list/delete/primary, 0600)
│  ├─ setup/            # setup console server + single-file page
│  ├─ http-server.ts    # streamable-HTTP bootstrap (node:http)
│  └─ tools/            # tool definitions by domain
│     ├─ generic.ts     # onedev_api_request (direct connection)
│     ├─ docs.ts        # onedev_docs_* (official docs query, standalone)
│     ├─ environments.ts# onedev_list_environments (environment discovery, standalone)
│     ├─ users.ts  groups.ts  roles.ts  projects.ts  agents.ts  settings.ts
│     └─ index.ts       # combined registry
├─ bin/                 # dsh-onedev-mcp.mjs launcher
├─ plugin/              # dsh plugin surface (Host + browser client halves)
│  ├─ src/host.ts       #   Host: loopback /api/onedev/config + probe routes
│  ├─ src/client/       #   Client: OneDev settings.section + locales
│  └─ tsconfig.json     #   browser/node typecheck for the plugin halves
├─ lib/                 # built plugin: lib/index.js (Host), lib/client.js (Client)
├─ tests/               # unit + stdio smoke + http smoke + host-route smoke
├─ docs/
│  ├─ tools.md          # generated table of all 60 tools
│  ├─ onedev-api.md     # OneDev REST API reference used by the plugin
│  └─ dsh-integration.md# DeepSeek Harness plugin configuration
├─ scripts/
│  ├─ gen-tools-doc.mjs # docs generator
│  ├─ build-plugin.mjs  # esbuild → lib/index.js + lib/client.js
│  └─ restart-dsh.sh    # stop/restart the dsh web profile
├─ cordis.patch.yml     # bundle patch (inserts dsh-onedev + dsh-onedev-mcp rows)
├─ TODOS.md             # task / goal tracker (TODOS.zh.md)
├─ .env.example
└─ package.json
```

---

## Prerequisites

- **Node.js `^22.19.0 || >=24.0.0`** (developed & tested on Node 26). The launcher loads the compiled ESM CLI through `require()`, which needs Node ≥ 20.19/22.12, and the plugin halves run inside DSH, whose own engine range is exactly this.
- **DeepSeek Harness 0.2.x** (`^0.2.0-rc.2`) when installing the plugin as a DSH bundle; the standalone MCP server has no DSH dependency.
- A **OneDev server** reachable over HTTP(S), e.g. `http://localhost:6610`.
- **Authentication**: either a OneDev access token, **or** an account + password.
  - Token auth (`ONEDEV_TOKEN`): the token must carry permission for the operations you want the AI to perform (administrator for most admin endpoints). OneDev REST docs live at `http(s)://<server>/~help/api`; create tokens from the user menu → **Access tokens**, or via the REST API itself.
  - Password auth (`ONEDEV_AUTH_TYPE=password`): just an existing OneDev account/password. It avoids the "login first to create a token" chicken-and-egg.

---

## Installation & build

```bash
npm install        # install dependencies
npm run build      # compile TypeScript → dist/
npm test           # build + unit tests + stdio smoke + HTTP smoke
```

The `bin/dsh-onedev-mcp.mjs` launcher runs the compiled server. `npm start` executes it;
`npm run dev` runs the same code through `tsx` for development.

---

## Set-up console (GUI)

Run the local config GUI once to enter the OneDev URL and credentials, validate them,
and persist them — no manual token-minting needed:

```bash
npm run setup
# or, without argv:
#   node bin/dsh-onedev-mcp.mjs --setup
```

A page opens at `http://127.0.0.1:8770/` (`ONEDEV_MCP_PORT` to change the port) with:

- **Environment slug + remark** — a short name (e.g. `prod`/`staging`) the AI uses to target this server, plus an optional remark; previously saved environments are listed below and can be loaded/edited/deleted or promoted to primary.
- **Server URL** — the OneDev base URL.
- **Authentication mode** — *Account + Password* (default, uses Basic-login auth) or *Access Token*.
- **Test** — validates the credentials against OneDev before any save.
- **Save** — tests, then writes the resolved config to the credential store.
- **Set as primary / Delete** — promote the current slug to the default target, or remove it.

On success the dashboard shows whether the account has administrator access, and the
credentials are stored (owner-only, mode `0600`) at `~/.config/dsh-onedev/config.json`
(respects `XDG_CONFIG_HOME` on Linux/macOS, `%APPDATA%` on Windows, `ONEDEV_CONFIG_FILE`
to override). The MCP server picks this up on later launches even with no env vars set.

---

## dsh Web settings tab (OneDev)

When the plugin is installed into a dsh profile as a bundle (see
[`docs/dsh-integration.md`](docs/dsh-integration.md)), it mounts two pieces:

- **Host half** — loopback routes `GET /api/onedev/config` (list environments),
  `POST /api/onedev/config` (save / set-primary / delete a single environment, or
  `clear:true` for the whole store) and `POST /api/onedev/probe`, reusing the
  multi-environment credential store described above.
- **Client half** — a first-level **OneDev** section in the dsh Web GUI
  (`Settings`). It shows each configured environment as a **card** (slug, remark,
  URL, auth type, primary / not-configured badge) with an **Add environment**
  button at the top-right; clicking a card opens its edit form — a **Back**
  button pinned at the panel's top-left, then the server URL, the administrator
  **username/password** (or an access token), a **remark**, and the extra
  pass-through options — with **Test**, **Save**, **Set as primary**,
  **Delete** and **Open OneDev** actions.

Everything you save is persisted in the multi-environment credential store, and
the form is re-filled from it whenever the page is opened. Secrets are never
echoed back to the browser: the URL, username and other options return in full,
while the password/token/extra-headers fields stay blank and show a *Saved —
leave blank to keep* placeholder. **Test connection therefore works on a reopened
page without retyping anything**: blank secret fields fall back to the targeted
environment's stored credentials (an explicitly typed value still wins), and the
success message tells you when the saved credentials were used.

Because the MCP server resolves its connection from the credential store on
**every tool call**, a Save in the GUI takes effect immediately for subsequent
`mcp__onedev__*` tool calls — no restart, no `ONEDEV_URL`/`ONEDEV_USERNAME`/
`ONEDEV_PASSWORD` environment variables. When multiple environments exist, each
tool targets the chosen `environment` slug (default: the primary environment).
An environment with no URL/credentials starts with its tools reporting a clear
"not configured" message until you save it.

The pass-through parameters the tab controls map to the same options the env
vars provide: `apiBase`, `transport` (`stdio`/`streamable-http`), `httpHost`,
`httpPort`, `readonly`, `apiTimeoutMs`, and `extraHeaders` (a JSON object).

Build the plugin halves with `npm run build` (or `npm run build:plugin`), and
restart dsh to load a fresh bundle (see `scripts/restart-dsh.sh`).

---

## Quick start (standalone)

The fastest path with an existing token:

```bash
export ONEDEV_URL=http://localhost:6610
export ONEDEV_TOKEN=your-access-token
npm start
```

Or skip the token entirely with password auth:

```bash
export ONEDEV_URL=http://localhost:6610
export ONEDEV_AUTH_TYPE=password
export ONEDEV_USERNAME=root
export ONEDEV_PASSWORD="your-password"
npm start
```

Or run `npm run setup` once and then just `npm start` (credentials come from the store).

Test it with any MCP stdio client, or use a manual JSON-RPC exchange over stdin
(you'll see 60 tools listed for `tools/list`). For a quick visual check you can also
run the HTTP variant (below) and point an MCP client or `curl` at it.

### Streamable HTTP mode

```bash
ONEDEV_URL=http://localhost:6610 \
ONEDEV_TOKEN=your-access-token \
ONEDEV_MCP_TRANSPORT=streamable-http \
ONEDEV_MCP_PORT=8765 \
npm start
# MCP endpoint: http://127.0.0.1:8765/mcp
```

---

## Environment variables

| Variable | Default | Required | Meaning |
|---|---|---|---|
| `ONEDEV_URL` | — | no (set in GUI/store) | Base URL of the **primary** OneDev environment (`http://host:6610`). Trailing slash stripped. May come from the credential store set by the dsh Web settings tab or `npm run setup` instead of the environment. |
| `ONEDEV_ENV` | (primary) | — | Environment slug to resolve when no `environment` tool argument is given (defaults to the store's primary environment). |
| `ONEDEV_AUTH_TYPE` | `token` | — | `token` (Bearer) or `password` (Basic login). May come from the store instead. |
| `ONEDEV_TOKEN` | — | if `password` no | OneDev access token (Bearer), used when `ONEDEV_AUTH_TYPE=token`. |
| `ONEDEV_USERNAME` | — | if `password` | OneDev account name, used when `ONEDEV_AUTH_TYPE=password`. |
| `ONEDEV_PASSWORD` | — | if `password` | OneDev account password, used when `ONEDEV_AUTH_TYPE=password`. |
| `ONEDEV_CONFIG_FILE` | (XDG path) | — | Override the credential-store path (env always wins over the store). |
| `ONEDEV_MCP_COMMAND` | — | — | `setup` → launch the config console instead of the MCP transport. |
| `ONEDEV_API_BASE` | `/~api` | — | Prefix appended to the URL for REST calls. |
| `ONEDEV_MCP_TRANSPORT` | `stdio` | — | `stdio` or `streamable-http`. |
| `ONEDEV_MCP_PORT` | `8765` | — | Bind port in HTTP mode (and the setup console). |
| `ONEDEV_MCP_HOST` | `127.0.0.1` | — | Bind host in HTTP mode (and the setup console). |
| `ONEDEV_API_TIMEOUT_MS` | `30000` | — | Per-request timeout for OneDev calls (ms). |
| `ONEDEV_MCP_READONLY` | `false` | — | `true` → refuse all mutating requests (only `GET`/`HEAD`). |
| `ONEDEV_MCP_HEADERS` | — | — | Extra request headers as JSON, e.g. `{"X-Custom":"v"}` (merged over auth). |
| `ONEDEV_DOCS_URL` | `https://docs.onedev.io` | — | Base URL for the documentation-query tools (`onedev_docs_*`); point it at a mirror to serve different docs. |

See `.env.example` for a copyable template.

---

## Tool reference

All 60 tools, with titles, are listed in **[docs/tools.md](docs/tools.md)** (中文：[docs/tools.zh.md](docs/tools.zh.md)). Highlights:

| Domain | Examples |
|---|---|
| Environments | `onedev_list_environments` — discover configured OneDev environments (slug, remark, URL, primary); every other tool takes an optional `environment` slug |
| Direct & info | `onedev_api_request`, `server_version` |
| Documentation | `onedev_docs_search`, `onedev_docs_read`, `onedev_docs_list` — query the official docs at [docs.onedev.io](https://docs.onedev.io/); standalone (no OneDev connection required) |
| Users | `users_list`, `user_get`, `user_get_id`, `user_create`, `user_update`, `user_disable`, `user_enable`, `user_set_password`, `user_convert_to_service_account`, `user_reset_2fa`, `user_access_tokens`, `user_ssh_keys`, `user_email_addresses`, `user_memberships` |
| Groups & admins | `groups_list`, `group_get`, `group_get_id`, `group_create`, `group_update`, `group_delete`, `group_members_list`, `group_members_add`, `group_members_remove` |
| Roles | `roles_list`, `role_get`, `role_get_id`, `role_create`, `role_update`, `role_delete` |
| Projects | `projects_list`, `project_get`, `project_get_id`, `project_get_clone_url`, `project_get_setting`, `project_create`, `project_update`, `project_delete`, `project_get_user_authorizations`, `project_get_group_authorizations` |
| CI/CD | `agents_list`, `agent_get`, `agent_tokens_list`, `agent_token_create`, `agent_token_delete`, `builds_list`, `build_get`, `build_set_description`, `build_labels` |
| Settings | `setting_get`, `setting_update`, `access_token_create`, `access_token_delete` |

> **Making a user an administrator** is modeled as membership in OneDev's built-in
> `Administrators` group: `group_members_add` with `groupId` = that group's id.

---

## Security notes

- Credentials are only ever sent to `ONEDEV_URL` over HTTPS when you configure an `https://` URL; do not use port-forwarded plaintext across untrusted networks.
- In **token mode** the token is read from the environment or the store and is **never** logged. The DSH stdio bridge scrubs ambient `*TOKEN*`/`*SECRET*`-shaped variables from the child environment; you pass `ONEDEV_TOKEN` explicitly in the plugin `env`.
- In **password mode** the account password is sent on every request as HTTP Basic (base64, not encrypted). Prefer `https://`; the credential store is written with owner-only permissions (`0600`), and the GUI redacts secrets when reporting state.
- Use **read-only mode** (`ONEDEV_MCP_READONLY=true`) if the AI should only inspect the server — every `POST`/`PUT`/`DELETE` is refused before reaching OneDev.
- All operations are audited by OneDev itself: each admin mutation is recorded in the OneDev audit log ("… via RESTful API").

---

## DeepSeek Harness integration

Add one plugin entry to your DSH configuration. Full details and worked examples are in **[docs/dsh-integration.md](docs/dsh-integration.md)** (中文：[docs/dsh-integration.zh.md](docs/dsh-integration.zh.md)).

```yaml
# stdio (recommended): spawn the compiled server as an MCP subprocess
- id: dsh-onedev
  name: '@deepseek-ai/dsh-mcp-client'
  config:
    serverName: onedev
    transport: stdio
    command: node
    args: ['/absolute/path/to/dsh-onedev/bin/dsh-onedev-mcp.mjs']
    env:
      ONEDEV_URL: !!js process.env.ONEDEV_URL
      # Either a token:
      ONEDEV_TOKEN: !!js process.env.ONEDEV_TOKEN
      # Or account/password (no token needed):
      # ONEDEV_AUTH_TYPE: 'password'
      # ONEDEV_USERNAME: !!js process.env.ONEDEV_USERNAME
      # ONEDEV_PASSWORD: !!js process.env.ONEDEV_PASSWORD
    toolCallTimeoutMs: 60000
```

If you already ran `npm run setup`, the `env` can even be omitted — the spawned
server loads the stored credentials automatically.

After the harness starts, the tools appear under names like `mcp__onedev__users_list`
and can be called like any native tool.

---

## OneDev REST API reference

The plugin targets OneDev's REST API. A concise map of every endpoint the typed
tools use (plus how authentication works) is in **[docs/onedev-api.md](docs/onedev-api.md)** (中文：[docs/onedev-api.zh.md](docs/onedev-api.zh.md)).
The canonical docs are shipped by your installation at
`http(s)://<server>/~help/api`.

---

## Testing

```bash
npm test
```

Runs (in order):
1. `tsc` build.
2. Unit tests (`tests/client.test.mjs`) — config parsing, URL building, auth header (Bearer + Basic), read-only gate, credential-store round-trip, env-vs-store priority.
3. Docs-tool unit tests (`tests/docs.test.mjs`) — search ranking, page reading/conversion, sitemap listing, caching; `fetch` is mocked (no network).
4. Connection-probe tests (`tests/auth.test.mjs`) — anonymous-vs-authenticated status classification (no network; `fetch` is mocked).
5. stdio smoke (`tests/smoke.mjs`) — boots the server over stdio, verifies all tools are listed.
6. HTTP smoke (`tests/http-smoke.mjs`) — boots it in streamable-http mode and issues a real `initialize` + `tools/list`.

There is also a **live docs self-test** (`node scripts/selftest-docs.mjs`; needs network to docs.onedev.io): it boots the server **without any OneDev credentials** and answers the question "how to configure CI/CD for a project and store sensitive information with OneDev's secret system" using only the `onedev_docs_*` tools.

---

## License

[MIT](LICENSE). Not affiliated with OneDev or DeepSeek; project/trademark names belong to their respective owners.

---

_Further reading:_ [`docs/tools.md`](docs/tools.md) · [`docs/onedev-api.md`](docs/onedev-api.md) · [`docs/dsh-integration.md`](docs/dsh-integration.md) · 中文版：[README.zh.md](README.zh.md)