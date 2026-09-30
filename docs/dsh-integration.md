# DeepSeek Harness integration guide

This plugin is consumed by DeepSeek Harness (DSH) through the built-in
`@deepseek-ai/dsh-mcp-client` bridge, which attaches external MCP servers so their
tools become native harness tools under names like `mcp__onedev__users_list`.

This page explains how to wire `dsh-onedev-mcp` into DSH for **stdio** (recommended)
and **streamable-http** (remote) deployments.

> **Recommended: dsh profile bundle.** As of v0.1.0 the plugin also ships as a
> dsh bundle. Add the package to your profile's `dsh.profile.bundles` (and install
> it); its `cordis.patch.yml` inserts the `dsh-onedev` host plugin (the loopback
> `/api/onedev/config` + `/api/onedev/probe` surface) **and** a
> `dsh-onedev-mcp` `@deepseek-ai/dsh-mcp-client` row that spawns the MCP server
> with `env: {}`. The connection — server URL, administrator account/password or
> access token, and the extra pass-through options — is then configured from the
> dsh Web GUI (`Settings → OneDev`). The MCP server reads the credential store on
> every tool call, so **no `ONEDEV_*` environment variables are required** and a
> Save takes effect without restarting dsh. Build the plugin bundle with
> `npm run build` and restart dsh (`scripts/restart-dsh.sh`) after upgrading.
>
> The inserted `dsh-onedev-mcp` row resolves the launcher from the profile's own
> `node_modules` (`!!js` evaluated against the launcher-provided
> `profileContext`), so the patch ships no machine-specific absolute path. The
> bundle declares `"@deepseek-ai/dsh": "^0.2.0-rc.2"` in `peerDependencies`, so
> DSH's plugin compatibility gate reports an incompatible runtime and skips the
> bundle on older DSH versions instead of failing at spawn time.

---

## How the bridge sees this server

- `@deepseek-ai/dsh-mcp-client` spawns (stdio) or connects to (streamable-http) the
  server and discovers its tools.
- You pick a short, unique `serverName` (here `onedev`); every tool is then exposed
  as `mcp__onedev__<toolName>` regardless of the server's internal name.
- Only tools are bridged. This server exposes exactly tools, so the fit is exact.
- Reconnect is handled automatically by the bridge; edit the config entry to reload.

### Multiple OneDev environments

The server can talk to **several** OneDev servers at once. The store holds one
named **environment** per server (a short slug, e.g. `prod`/`staging`, plus an
optional remark, a URL and its own credentials). Only `onedev_list_environments`
matches *all* environments; every other tool resolves a single environment:

- Call `mcp__onedev__onedev_list_environments` first (optionally `{"query":"…"}`)
  to see the configured slugs, remarks and URLs.
- Pass the matching slug through each tool's optional `environment` argument to
  address that server unambiguously, e.g. `mcp__onedev__users_list` →
  `{"environment":"prod","term":"alice"}`.
- Leaving `environment` out targets the store's **primary** environment (the live
  web GUI's "Set as primary"). Environment selection is per call and purely
  credential-store driven, so **no restart or extra MCP connection is needed**.

---

## Provisioning credentials — kill the token egg-paradox

Two authentication modes remove the "must log into the OneDev web UI first to create a
token" bootstrap:

- **Password mode** (`ONEDEV_AUTH_TYPE=password` + `ONEDEV_USERNAME`/`ONEDEV_PASSWORD`):
  OneDev authenticates the Basic `user:password` header automatically, so no token is
  ever needed.
- **Setup console (GUI)**: run `npm run setup` (binds `http://127.0.0.1:8770/`), enter the
  OneDev URL + an account/password (or a token), click **Save**. The resolved config is
  persisted to the credential store at `~/.config/dsh-onedev/config.json` (mode `0600`,
  override with `ONEDEV_CONFIG_FILE`).

After the setup console has saved credentials, the spawned MCP server below loads them
from the store on every launch — the `env` section can even be omitted entirely. Env vars
always win over the store when both are present.

The same store backs the dsh Web **Settings → OneDev** tab: it renders each configured
environment as a card and opens an edit form when clicked (`POST /api/onedev/config`
saves / deletes / promotes an environment; `POST /api/onedev/probe` tests one). Secrets
are never echoed; blank secret fields fall back to the targeted environment's stored
credentials (the reply's `usedStored` array names which fields were filled from the
store), so re-testing a saved connection never requires retyping the password/token.

---

## Option A — stdio (recommended for local OneDev)

Build the server first (`npm install && npm run build`), then add a plugin entry.

```yaml
# dsh config (e.g. dsh.config.yaml — shapes follow DSH's own conventions)
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
        # Either a token:
        ONEDEV_TOKEN: !!js process.env.ONEDEV_TOKEN
        # Or account/password (no token needed; or via `npm run setup`):
        # ONEDEV_AUTH_TYPE: 'password'
        # ONEDEV_USERNAME: !!js process.env.ONEDEV_USERNAME
        # ONEDEV_PASSWORD: !!js process.env.ONEDEV_PASSWORD
        # optional:
        # ONEDEV_MCP_READONLY: 'true'
        # ONEDEV_API_TIMEOUT_MS: '30000'
      toolCallTimeoutMs: 60000
      failOnStartupError: false
```

Notes:

- `command`/`args` must be an absolute path to the built launcher (or `npx` to a
  published package). The bridge scrubs `*TOKEN*`/`*KEY*`/`*SECRET*`/`DSH_*`
  ambient variables from the child environment, so tokens/credentials are injected
  explicitly via `env` — or pulled from the setup-console store automatically.
- In **password mode** the password is sent as HTTP Basic on each request; when you pass
  it through `env` it never touches the store. When you rely on the setup console store,
  the password lives in `~/.config/dsh-onedev/config.json` (mode `0600`).
- After startup the tools appear; you do **not** need to restart DSH to reload a
  config edit.

### Using npm / tsx dev runs

For development you can point `command` at `npx` with `tsx`:

```yaml
command: npx
args: ['tsx', '/absolute/path/to/dsh-onedev/src/cli.ts']
```

---

## Option B — streamable-http (remote / shared server)

Run the server in HTTP mode on a host reachable from the DSH deployment, then
reference its `/mcp` URL.

```bash
ONEDEV_URL=https://onedev.internal:6610 \
# Either a token:
ONEDEV_TOKEN="$ONEDEV_TOKEN" \
# Or account/password:
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
        # optional auth in front of the MCP endpoint
        # Authorization: 'Bearer <mcp-gateway-token>'
      toolCallTimeoutMs: 60000
```

---

## Example tool invocations

Once bridged, the model can call (all arguments are JSON):

| Goal | Tool call |
|---|---|
| Discover environments | `mcp__onedev__onedev_list_environments` → `{"query":"prod"}`; then pass the `environment` slug to any tool |
| List users (primary env) | `mcp__onedev__users_list` → `{"term":"alice","count":50}` |
| List users (specific env) | `mcp__onedev__users_list` → `{"environment":"staging","term":"alice"}` |
| Make someone an admin | `mcp__onedev__group_get_id` → `{"name":"Administrators"}` then `group_members_add {userId, groupId}` |
| Create a project | `mcp__onedev__project_create` → `{"name":"team/app","codeManagement":true}` |
| Read-only safety | set `ONEDEV_MCP_READONLY=true`; mutating calls are refused |
| Anything unwrapped | `mcp__onedev__onedev_api_request` → `{"method":"GET","path":"/issues?project=app"}` |

---

## Troubleshooting

- **No tools after start.** Confirm the server itself starts (`npm start` prints nothing
  extra on stdout; use `ONEDEV_URL=… ONEDEV_TOKEN=… node bin/dsh-onedev-mcp.mjs` and
  test with `tools/list`). If `failOnStartupError` is false the harness logs but still runs.
- **401/403 on admin tools.** The access token must belong to a user with administrator
  rights, and must not be expired or disabled.
- **HTTP mode connection reset.** Ensure the port is reachable from the harness host and
  `/mcp` is the path (there is a tiny 404 guard for other paths).
- **Tool calls time out.** Increase `ONEDEV_API_TIMEOUT_MS` (server side) and/or
  `toolCallTimeoutMs` (bridge side).