# TODOS

Task and goal tracker for the dsh-onedev plugin. Mirrored in `TODOS.zh.md`.
Status values: `[ ]` pending · `[x]` done · `[~]` in progress.

## Goal: multiple OneDev environments + card settings UI + env routing (current, 2026-09-16)

### Done

- [x] Multi-environment store (`src/storage.ts`): `{ primary, environments }` map
      with `loadEnvironmentStore` / `saveEnvironment` / `deleteEnvironment` /
      `setPrimary` (atomic `0600`; first env primary; deleting primary reassigns).
      Legacy flat format intentionally NOT migrated (reads as no-store, never crashes).
- [x] Per-environment config resolution (`src/config.ts`): `loadConfig(env, envName?)`
      targets `envName → ONEDEV_ENV → primary`; env-var overrides apply only to the
      primary env. Added `listEnvironments(env, filter?)` (redacted descriptors).
- [x] MCP env routing (`src/index.ts`): every non-standalone tool gains an optional
      `environment` param + a discovery pointer in its description; provider is now
      `(envName?) => ResolvedConfig`; new standalone tool
      `onedev_list_environments({ query? })` (`src/tools/environments.ts`). 60 → 61 tools.
- [x] Host routes (`plugin/src/host.ts`) + setup console (`src/setup/*`): multi-env
      list/save/delete/set-primary + per-env probe.
- [x] Card settings UI (`plugin/src/client/*`): card grid + "Add environment" header
      button + per-env edit view (slug/remark/fields + Save/Test/Set-primary/Delete/
      Back/Open); locales + `onedev.css` extended.
- [x] Docs + tests: regenerated tool docs (61), READMEs / dsh-integration / `.env.example`
      (ONEDEV_ENV) updated; new `tests/storage-env.test.mjs`; client/smoke/http-smoke/
      plugin-host/selftest-docs retargeted. `npm run build`, `npm test`, both typechecks,
      `npm run docs:check` green.

### Next goals

- [ ] Manual GUI confirmation (needs the user's rebuilt/refreshed web app): open
      dsh Settings → OneDev, add an environment (slug + remark), set it as primary,
      test without retyping secrets, then call `mcp__onedev__onedev_list_environments`
      and an `environment`-scoped admin tool.
- [ ] Optional: respawn the `dsh-onedev-mcp` child when the store changes, so the
      bridge re-publishes tools immediately (mcp-client `startConnection`).
- [ ] Optional: HTTPS / trusted-proxy hardening for the loopback config bridge.

## Goal: persistent OneDev settings UX — re-test without retyping credentials (previous, 2026-09-11)

### Done

- [x] Probe fallback to stored credentials: `POST /api/onedev/probe` merges the
      submitted body over the credential store (blank URL/username/token/password
      fields fall back to stored values; explicit input still wins; URL keeps its
      `cleanUrl` validation). The reply reports `usedStored` — the fields filled
      from the store. This was the root cause of "reopen settings → must retype
      the password to test".
- [x] Client surfaces the store state: `passwordSet`/`tokenSet`/`extraHeadersSet`
      from the redacted GET now drive "Saved — leave blank to keep" placeholders
      plus a "saved configuration loaded" hint; Save refreshes the flags and
      blanks the secret inputs; Clear resets the whole form; a successful test
      says when the saved credentials were used (`testOkStored`).
- [x] Copy fix: the section no longer claims a dsh restart is required — the MCP
      server re-reads the store on every tool call (now consistent with the
      READMEs).
- [x] Tests: `tests/plugin-host.spec.mjs` covers the probe fallback against a
      local mock OneDev (asserts the exact `Authorization` header built from the
      stored password/token and the override precedence); the spec is wired into
      `npm test` after `build:plugin`.

### Next goals

- [ ] Manual GUI confirmation (needs the user's authenticated browser): reopen
      dsh Settings → OneDev, confirm the pre-filled form + "Saved" placeholders,
      press Test connection without retyping, then call an `mcp__onedev__*` tool.
- [ ] Optional: respawn the `dsh-onedev-mcp` child when the store changes, so
      the bridge re-publishes tools immediately (mcp-client `startConnection`).
- [ ] Optional: HTTPS / trusted-proxy hardening for the loopback config bridge.

## Goal: documentation query over docs.onedev.io (previous, 2025-09-07)

### Done

- [x] New standalone tool module `src/tools/docs.ts` with three tools:
      `onedev_docs_search` (full-text search over the official docs),
      `onedev_docs_read` (one page as readable text with headings/lists/links/
      code blocks and related-page links), `onedev_docs_list` (sitemap listing
      with category filter).
- [x] Index built on demand from `https://docs.onedev.io/sitemap.xml` + the
      server-rendered `<article>` of every page (no public search API exists);
      in-memory cache with TTL (sitemap 1 h, pages 24 h) and a `refresh` flag;
      bounded fetch concurrency (8); `ONEDEV_DOCS_URL` override for mirrors.
- [x] `standalone: true` on `ToolDefinition`: docs tools skip the "not
      configured" gate and run without any OneDev connection/credentials.
- [x] ZH map entries in `scripts/gen-tools-doc.mjs`; regenerated
      `docs/tools.md`/`docs/tools.zh.md` (60 tools).
- [x] READMEs updated (60 tools, docs-query feature bullet, env-var table,
      tool-reference table, testing section) in both languages; `.env.example`
      documents `ONEDEV_DOCS_URL`.
- [x] Unit tests `tests/docs.test.mjs` (8 tests, mocked fetch: ranking,
      caching, refresh, read conversion, URL/foreign-host handling, category
      list, SPA-fallback guard) wired into `npm test`; smoke tests cover the
      new tools.
- [x] Live self-test `scripts/selftest-docs.mjs`: boots the server over stdio
      without credentials and answers the question "how to fully configure
      CI/CD for a project and use OneDev's secret system to store sensitive
      information" via the docs tools — search surfaces
      `/tutorials/cicd/job-secrets` first for secrets, CI/CD tutorials for
      pipeline configuration; page reads return actionable content.

### Next goals

- [ ] Manual GUI confirmation (needs the user's authenticated browser): the
      OneDev settings tab renders; saving a real server/account then an
      `mcp__onedev__*` tool works after save (no restart).
- [ ] Optional: respawn the `dsh-onedev-mcp` child when the store changes, so
      the bridge re-publishes tools immediately (mcp-client `startConnection`).
- [ ] Optional: HTTPS / trusted-proxy hardening for the loopback config bridge.

## Goal: dsh Web settings integration (previous, 2025-09-07)

### Done

- [x] Rename package `@altermoe/dsh-onedev` → `dsh-onedev` (required for the
      client-modules scan to discover the browser half).
- [x] Add Host plugin (`plugin/src/host.ts` → `lib/index.js`): loopback routes
      `GET/POST /api/onedev/config` and `POST /api/onedev/probe`, reusing the
      credential store (`0600`, atomic, secrets preserved on blank input).
- [x] Add Client plugin (`plugin/src/client/*` → `lib/client.js`): registers the
      OneDev `settings.section` (id `onedev`, order 120) with a username/password
      form, extra pass-through options, a Test button, and an "Open OneDev"
      quick entry; locale namespace `settings.onedev`.
- [x] ONEDEV_URL now resolvable at runtime from the GUI store (env-or-store,
      per tool call) — no `ONEDEV_URL` env required; an empty store no longer
      fatals the dsh boot.
- [x] Extra pass-through params in `Config`/`StoredConfig`: `apiBase`,
      `transport`, `httpHost`, `httpPort`, `extraHeaders` (src/config.ts,
      src/storage.ts, src/setup/server.ts, src/client.ts).
- [x] Bundle metadata: `dsh.client`, `dsh.bundle.patch` (`cordis.patch.yml`),
      `./client` export, `main` → host plugin, MCP stays a `bin`.
- [x] Build pipeline: `scripts/build-plugin.mjs` (esbuild) → `lib/index.js` +
      `lib/client.js`; `npm run build` builds both; `npm test` green.
- [x] Restart helper: `scripts/restart-dsh.sh`.
- [x] Profile wiring: `dsh-onedev` added to `~/.dsh/profiles/web` bundles;
      `deepseek-harness/dsh-onedev` symlink.
- [x] Verification: boot graph includes `dsh-onedev`; `dsh-onedev/client.js`
      served in module-loader format with the `settings.section`/
      `settings.onedev` registration (on a disposable dsh web instance).
- [x] UI restyle to dsh look: tokenized namespaced `onedev.css` (injected once
      at apply) using `--dsw-alias-*` tokens — 8px inputs, 18px pill buttons,
      16px card radius, module fill, shared focus ring; no inline styles.

### Next goals

- [ ] Manual GUI confirmation (needs the user's authenticated browser): the
      OneDev settings tab renders; saving a real server/account then an
      `mcp__onedev__*` tool works after save (no restart).
- [ ] Optional: respawn the `dsh-onedev-mcp` child when the store changes, so
      the bridge re-publishes tools immediately (mcp-client `startConnection`).
- [ ] Optional: HTTPS / trusted-proxy hardening for the loopback config bridge.
- [x] Regenerate `docs/tools.md`/`docs/tools.zh.md` — done in the docs-query
      goal (tool count changed to 60).