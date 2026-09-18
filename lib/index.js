// src/auth.ts
function buildAuthHeader(c) {
  if (c.authType === "token") {
    if (!c.onedevToken) throw new Error("token auth requires an access token");
    return `Bearer ${c.onedevToken}`;
  }
  if (!c.username || !c.password) throw new Error("password auth requires username and password");
  return `Basic ${Buffer.from(`${c.username}:${c.password}`, "utf8").toString("base64")}`;
}
async function probeOneDev(c) {
  const apiBase = (c.apiBase ?? process.env["ONEDEV_API_BASE"] ?? "/~api").replace(/\/+$/, "");
  const timeoutMs = c.timeoutMs ?? 3e4;
  const url = new URL(`${c.onedevUrl.replace(/\/+$/, "")}${apiBase}/users?offset=0&count=1`);
  const send = async (auth) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: {
          Accept: "application/json",
          ...auth ? { Authorization: auth } : {}
        },
        signal: controller.signal
      });
      return { status: res.status, text: await res.text() };
    } finally {
      clearTimeout(timer);
    }
  };
  let anonymous;
  try {
    anonymous = await send(void 0);
  } catch (err) {
    return { kind: "error", status: 0, message: `cannot reach OneDev server: ${err.message}` };
  }
  let authHeader;
  try {
    authHeader = buildAuthHeader(c);
  } catch (err) {
    return { kind: "error", status: 400, message: err.message };
  }
  let authed;
  try {
    authed = await send(authHeader);
  } catch (err) {
    return { kind: "error", status: 0, message: `request failed during authentication probe: ${err.message}` };
  }
  const status = authed.status;
  if (status === 200) {
    return { kind: "ok", status, admin: true, message: "connection and authentication OK (administrator access)." };
  }
  if (status === 403) {
    return {
      kind: "forbidden",
      status,
      authenticated: !sameDenial(anonymous.status, status),
      message: "credentials are accepted, but this account is not an administrator \u2014 most tools require the admin role."
    };
  }
  if (status === 401) {
    return { kind: "unauthorized", status, message: "credentials were rejected (HTTP 401) \u2014 check username/password or token." };
  }
  if (status === 406) {
    return {
      kind: "error",
      status,
      message: "the probe endpoint answered HTTP 406 (missing required query params) \u2014 this is an endpoint-contract mismatch with this OneDev version, not a credential problem."
    };
  }
  if (!sameDenial(anonymous.status, status)) {
    return { kind: "error", status, message: `endpoint answered HTTP ${status}; credentials may or may not be valid.` };
  }
  return { kind: "unauthorized", status, message: `authentication not accepted (HTTP ${status}, same as anonymous).` };
}
function sameDenial(a, b) {
  return a === b;
}

// src/storage.ts
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, renameSync, chmodSync, copyFileSync } from "fs";
import { dirname } from "path";
function isValidSlug(slug) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(slug);
}
function loadEnvironmentStore(configFile) {
  if (!existsSync(configFile)) return null;
  let text;
  try {
    text = readFileSync(configFile, "utf8");
  } catch (err) {
    throw new Error(`cannot read credential store at ${configFile}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(`credential store at ${configFile} is not valid JSON: ${err.message}`);
  }
  return normalizeStore(parsed);
}
function normalizeStore(parsed) {
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed;
  const rawEnvs = obj["environments"];
  if (typeof rawEnvs !== "object" || rawEnvs === null || Array.isArray(rawEnvs)) {
    return null;
  }
  const environments = {};
  for (const [key, value] of Object.entries(rawEnvs)) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      environments[key] = value;
    }
  }
  const primary = typeof obj["primary"] === "string" && environments[obj["primary"]] !== void 0 ? obj["primary"] : Object.keys(environments)[0] ?? "";
  return { primary, environments };
}
function saveEnvironment(configFile, slug, partial) {
  if (!isValidSlug(slug)) {
    throw new Error(
      `invalid environment name "${slug}": use 1-32 chars [A-Za-z0-9._-], starting with a letter or digit`
    );
  }
  const store = readForMutation(configFile);
  const merged = { ...store.environments[slug] ?? {}, ...partial };
  for (const k of ["onedevToken", "password", "username"]) {
    if (merged[k] === void 0 || merged[k] === "") delete merged[k];
  }
  if (!merged.authType) merged.authType = "token";
  store.environments[slug] = merged;
  if (!store.primary || store.environments[store.primary] === void 0) store.primary = slug;
  writeEnvironmentStore(configFile, store);
  return configFile;
}
function deleteEnvironment(configFile, slug) {
  const store = readForMutation(configFile);
  if (!store.environments[slug]) return false;
  delete store.environments[slug];
  const remaining = Object.keys(store.environments);
  store.primary = store.environments[store.primary] !== void 0 ? store.primary : remaining[0] ?? "";
  writeEnvironmentStore(configFile, store);
  return true;
}
function setPrimary(configFile, slug) {
  const store = readForMutation(configFile);
  if (!store.environments[slug]) throw new Error(`environment "${slug}" does not exist`);
  store.primary = slug;
  writeEnvironmentStore(configFile, store);
  return true;
}
function clearStoredConfig(configFile) {
  if (!existsSync(configFile)) return false;
  rmSync(configFile, { force: true });
  return true;
}
function readForMutation(configFile) {
  try {
    return loadEnvironmentStore(configFile) ?? { primary: "", environments: {} };
  } catch {
    return { primary: "", environments: {} };
  }
}
function writeEnvironmentStore(configFile, store) {
  const dir = dirname(configFile);
  mkdirSync(dir, { recursive: true });
  const tmp = `${configFile}.tmp-${process.pid}-${Date.now()}`;
  writeFileSync(tmp, JSON.stringify(store, null, 2) + "\n", { mode: 384, encoding: "utf8" });
  try {
    try {
      renameSync(tmp, configFile);
    } catch {
      copyFileSync(tmp, configFile);
    }
  } finally {
    if (existsSync(tmp)) {
      try {
        rmSync(tmp);
      } catch {
      }
    }
  }
  try {
    chmodSync(configFile, 384);
  } catch {
  }
}

// src/config.ts
function describeEnvironment(slug, s, primarySlug) {
  const hasSecret = s.authType === "password" ? Boolean(s.password) : Boolean(s.onedevToken);
  return {
    slug,
    remark: s.remark ?? "",
    onedevUrl: s.onedevUrl ?? "",
    authType: s.authType ?? "token",
    username: s.username ?? "",
    tokenSet: Boolean(s.onedevToken),
    passwordSet: Boolean(s.password),
    readonly: s.readonly ?? false,
    primary: slug === primarySlug,
    configured: Boolean(s.onedevUrl) && hasSecret
  };
}
function resolveConfigFile(env = process.env) {
  const explicit = env["ONEDEV_CONFIG_FILE"];
  if (explicit !== void 0 && explicit.trim() !== "") return explicit;
  if (process.platform === "win32") {
    const appData = env["APPDATA"] ?? "";
    if (appData !== "") return `${appData.replace(/[\\/]+$/, "")}\\dsh-onedev\\config.json`;
  }
  const home = env["HOME"] ?? env["USERPROFILE"];
  if (!home) return "";
  const configHome = env["XDG_CONFIG_HOME"] ?? `${home}/.config`;
  return `${configHome}/dsh-onedev/config.json`;
}

// plugin/src/host.ts
var name = "dsh-onedev";
var inject = ["webServer"];
function apply(ctx, config = {}) {
  ctx.effect(() => {
    const configFile = config.configFile ?? resolveConfigFile();
    const guards = makeLoopbackGuard();
    const disposers = [
      ctx.webServer.register({ kind: "exact", path: "/api/onedev/config", handler: handleConfig(configFile, guards) }),
      ctx.webServer.register({ kind: "exact", path: "/api/onedev/probe", handler: handleProbe(configFile, guards) })
    ];
    return () => {
      for (const dispose of disposers) dispose();
    };
  }, "dsh-onedev: config surface");
}
function handleConfig(configFile, guards) {
  return async (req, res) => {
    if (!guards.trusted(req, res)) return;
    if (req.method === "GET") {
      sendJson(res, 200, { ok: true, configFile, ...listView(configFile) });
      return;
    }
    if (req.method === "POST") {
      const body = await readJson(req);
      if (body && body.clear === true) {
        const cleared = clearStoredConfig(configFile);
        sendJson(res, 200, { ok: true, cleared });
        return;
      }
      try {
        const action = body?.action ?? "save";
        if (action === "delete") {
          const removed = body.slug ? deleteEnvironment(configFile, body.slug) : false;
          sendJson(res, 200, { ok: true, removed, ...listView(configFile) });
          return;
        }
        if (action === "setPrimary") {
          if (!body.slug) throw new Error("missing environment slug");
          setPrimary(configFile, body.slug);
          sendJson(res, 200, { ok: true, ...listView(configFile) });
          return;
        }
        const slug = strip(body?.slug);
        if (!slug) throw new Error("missing environment slug");
        const saved = saveEnvironment(configFile, slug, toStored(configFile, slug, body));
        const view = listView(configFile);
        sendJson(res, 200, { ok: true, configFile: saved, primary: view.primary, envs: view.envs, saved: view.envs.find((e) => e.slug === slug) });
      } catch (err) {
        sendJson(res, 400, { ok: false, error: err.message });
      }
      return;
    }
    sendJson(res, 405, { ok: false, error: "method not allowed" });
  };
}
function handleProbe(configFile, guards) {
  return async (req, res) => {
    if (!guards.trusted(req, res)) return;
    if (req.method !== "POST") {
      sendJson(res, 405, { ok: false, error: "method not allowed" });
      return;
    }
    const body = await readJson(req);
    const slug = strip(body.slug) || strip(body.env) || "";
    const stored = safeLoad(configFile).environments[slug] ?? {};
    const usedStored = [];
    const pick = (submitted, storedValue, key) => {
      const s = strip(submitted);
      if (s !== "") return s;
      const fallback = storedValue ?? "";
      if (fallback !== "") usedStored.push(key);
      return fallback;
    };
    try {
      const outcome = await probeOneDev({
        onedevUrl: cleanUrl(pick(body.onedevUrl, stored.onedevUrl, "onedevUrl")),
        authType: (body.authType ?? stored.authType) === "token" ? "token" : "password",
        onedevToken: pick(body.onedevToken, stored.onedevToken, "onedevToken"),
        username: pick(body.username, stored.username, "username"),
        password: (() => {
          if (body.password !== void 0 && body.password !== "") return body.password;
          if (stored.password) usedStored.push("password");
          return stored.password ?? "";
        })(),
        apiBase: (() => {
          const s = strip(body.apiBase);
          return s !== "" ? s : stored.apiBase;
        })(),
        timeoutMs: typeof body.apiTimeoutMs === "number" ? body.apiTimeoutMs : stored.apiTimeoutMs
      });
      sendJson(res, outcome.kind === "ok" ? 200 : outcome.kind === "forbidden" ? 202 : 400, {
        ok: outcome.kind === "ok",
        outcome,
        usedStored
      });
    } catch (err) {
      sendJson(res, 400, { ok: false, error: err.message, usedStored });
    }
  };
}
function makeLoopbackGuard() {
  return {
    trusted(req, res) {
      const address = req.socket.remoteAddress ?? "";
      if (address !== "127.0.0.1" && address !== "::1" && address !== "::ffff:127.0.0.1") {
        sendJson(res, 403, { ok: false, error: "forbidden" });
        return false;
      }
      const origin = req.headers.origin;
      if (origin !== void 0 && req.headers.host !== void 0 && new URL(origin).host !== req.headers.host) {
        sendJson(res, 403, { ok: false, error: "forbidden: cross-origin" });
        return false;
      }
      return true;
    }
  };
}
function cleanUrl(v) {
  const s = strip(v).replace(/\/+$/, "");
  if (!s) throw new Error("OneDev server URL is required, e.g. http://localhost:6610");
  if (!/^https?:\/\//i.test(s)) throw new Error(`invalid OneDev URL: "${s}" (must start with http:// or https://)`);
  return s;
}
function toStored(configFile, slug, b) {
  const known = safeLoad(configFile).environments[slug];
  const authType = b.authType === "token" ? "token" : "password";
  const username = strip(b.username);
  const password = b.password ?? "";
  const token = strip(b.onedevToken);
  if (!known && authType === "password" && (username === "" || password === "")) {
    throw new Error("a new password-auth environment needs a username and password");
  }
  if (!known && authType === "token" && token === "") {
    throw new Error("a new token-auth environment needs an access token");
  }
  return {
    remark: strip(b.remark) || void 0,
    onedevUrl: cleanUrl(b.onedevUrl),
    authType,
    ...authType === "token" && token !== "" ? { onedevToken: token } : {},
    ...authType === "password" && username !== "" ? { username } : {},
    ...authType === "password" && password !== "" ? { password } : {},
    ...typeof b.readonly === "boolean" ? { readonly: b.readonly } : {},
    ...typeof b.apiTimeoutMs === "number" ? { apiTimeoutMs: b.apiTimeoutMs } : {},
    ...b.apiBase !== void 0 && strip(b.apiBase) !== "" ? { apiBase: strip(b.apiBase).replace(/\/+$/, "") } : {},
    ...b.transport === "stdio" || b.transport === "streamable-http" ? { transport: b.transport } : {},
    ...b.httpHost !== void 0 && strip(b.httpHost) !== "" ? { httpHost: strip(b.httpHost) } : {},
    ...typeof b.httpPort === "number" ? { httpPort: b.httpPort } : {},
    ...b.extraHeaders !== void 0 && strip(b.extraHeaders) !== "" ? { extraHeaders: strip(b.extraHeaders) } : {}
  };
}
function listView(configFile) {
  const store = safeLoad(configFile);
  const primary = store.primary;
  const envs = Object.entries(store.environments).map(([slug, s]) => describeEnvironment(slug, s, primary));
  return { primary, envs };
}
function safeLoad(configFile) {
  try {
    return loadEnvironmentStore(configFile) ?? { primary: "", environments: {} };
  } catch {
    return { primary: "", environments: {} };
  }
}
function strip(v) {
  return typeof v === "string" ? v.trim() : "";
}
async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.trim() === "") return {};
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`invalid JSON body: ${err.message}`);
  }
}
function sendJson(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}
export {
  apply,
  inject,
  name
};
