window.__ModuleLoader__.load({ id: "dsh-onedev", factory: (require) => {
var module = { exports: {} }; var exports = module.exports;
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name2 in all)
    __defProp(target, name2, { get: all[name2], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// plugin/src/client/index.ts
var client_exports = {};
__export(client_exports, {
  apply: () => apply,
  inject: () => inject,
  name: () => name
});
module.exports = __toCommonJS(client_exports);

// plugin/src/client/OneDevSection.tsx
var import_react = require("react");
var import_jsx_runtime = require("react/jsx-runtime");
var DEFAULT_EDIT = {
  slug: "",
  remark: "",
  url: "",
  authType: "password",
  username: "",
  password: "",
  token: "",
  readonly: false,
  apiTimeoutMs: 3e4,
  apiBase: "/~api",
  extraHeaders: "",
  passwordSet: false,
  tokenSet: false,
  extraHeadersSet: false
};
function OneDevSection(props) {
  const { t } = props;
  const [load, setLoad] = (0, import_react.useState)({ kind: "loading" });
  const [status, setStatus] = (0, import_react.useState)({ kind: "idle" });
  const [view, setView] = (0, import_react.useState)({ kind: "list" });
  const [envs, setEnvs] = (0, import_react.useState)([]);
  const [primary, setPrimary] = (0, import_react.useState)("");
  const [editing, setEditing] = (0, import_react.useState)(DEFAULT_EDIT);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const fetchConfig = async () => {
    try {
      const res = await fetch("/api/onedev/config");
      const data = await res.json();
      if (!res.ok || !data.ok) return null;
      return data;
    } catch {
      return null;
    }
  };
  const refresh = async () => {
    const data = await fetchConfig();
    if (!data) {
      setLoad({ kind: "error", text: t("testFail") });
      return;
    }
    setEnvs(data.envs);
    setPrimary(data.primary);
    setLoad({ kind: "idle" });
  };
  (0, import_react.useEffect)(() => {
    void refresh();
  }, []);
  const seeded = (d) => {
    if (!d) return { ...DEFAULT_EDIT };
    return {
      slug: d.slug,
      remark: d.remark,
      url: d.onedevUrl,
      authType: d.authType,
      username: d.username,
      password: "",
      token: "",
      readonly: d.readonly,
      apiTimeoutMs: 3e4,
      apiBase: "/~api",
      extraHeaders: "",
      passwordSet: d.passwordSet,
      tokenSet: d.tokenSet,
      extraHeadersSet: false
    };
  };
  const openNew = () => {
    setEditing({ ...DEFAULT_EDIT });
    setStatus({ kind: "idle" });
    setView({ kind: "edit", slug: null });
  };
  const openEdit = (slug) => {
    setEditing(seeded(envs.find((e) => e.slug === slug)));
    setStatus({ kind: "idle" });
    setView({ kind: "edit", slug });
  };
  const backToList = () => {
    setView({ kind: "list" });
    setStatus({ kind: "idle" });
  };
  const editBody = (action) => ({
    action,
    slug: editing.slug,
    remark: editing.remark,
    onedevUrl: editing.url,
    authType: editing.authType,
    username: editing.username,
    password: editing.password,
    onedevToken: editing.token,
    readonly: editing.readonly,
    apiTimeoutMs: editing.apiTimeoutMs,
    apiBase: editing.apiBase,
    extraHeaders: editing.extraHeaders.trim() !== "" ? editing.extraHeaders : void 0
  });
  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/onedev/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(editBody("save"))
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        const savedSlug = editing.slug;
        const fresh = await fetchConfig();
        if (fresh) {
          setEnvs(fresh.envs);
          setPrimary(fresh.primary);
          setEditing(seeded(fresh.envs.find((e) => e.slug === savedSlug)));
        }
        setStatus({ kind: "success", text: t("saved") });
      } else {
        setStatus({ kind: "error", text: data.error ?? t("testFail") });
      }
    } catch {
      setStatus({ kind: "error", text: t("testFail") });
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/onedev/probe", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...editBody("save"), env: editing.slug })
      });
      const data = await res.json().catch(() => ({}));
      const kind = data.outcome?.kind;
      const usedStoredSecret = (data.usedStored ?? []).includes("password") || (data.usedStored ?? []).includes("onedevToken");
      setStatus(kind === "ok" ? { kind: "success", text: usedStoredSecret ? t("testOkStored") : t("testOk") } : kind === "forbidden" ? { kind: "error", text: t("testNotAdmin") } : { kind: "error", text: data.error ?? t("testFail") });
    } catch {
      setStatus({ kind: "error", text: t("testFail") });
    } finally {
      setBusy(false);
    }
  };
  const removeEnv = async () => {
    if (!window.confirm(t("deleteConfirm")) || !editing.slug) return;
    setBusy(true);
    try {
      const res = await fetch("/api/onedev/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete", slug: editing.slug })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        const fresh = await fetchConfig();
        if (fresh) {
          setEnvs(fresh.envs);
          setPrimary(fresh.primary);
        }
        setStatus({ kind: "idle" });
        setView({ kind: "list" });
      } else {
        setStatus({ kind: "error", text: data.error ?? t("testFail") });
      }
    } catch {
      setStatus({ kind: "error", text: t("testFail") });
    } finally {
      setBusy(false);
    }
  };
  const setPrimaryEnv = async () => {
    if (!editing.slug) return;
    setBusy(true);
    try {
      const res = await fetch("/api/onedev/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "setPrimary", slug: editing.slug })
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.ok !== false) {
        const fresh = data.envs ?? envs;
        setEnvs(fresh.map((e) => ({ ...e, primary: e.slug === editing.slug })));
        setPrimary(editing.slug);
        setStatus({ kind: "success", text: t("setPrimaryDone") });
      } else {
        setStatus({ kind: "error", text: data.error ?? t("testFail") });
      }
    } catch {
      setStatus({ kind: "error", text: t("testFail") });
    } finally {
      setBusy(false);
    }
  };
  const open = () => {
    if (editing.url.trim() !== "") window.open(editing.url.trim(), "_blank", "noopener,noreferrer");
  };
  const field = (label, control) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "onedev-field", children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-label", children: label }),
    control
  ] });
  const input = (value, onChange, placeholder, type = "text") => /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "input",
    {
      className: "onedev-input",
      type,
      value,
      placeholder,
      onChange: (e) => onChange(e.target.value)
    }
  );
  const isNew = view.kind === "edit" && view.slug === null;
  const editingExisting = view.kind === "edit" && !isNew;
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "onedev-section", children: [
    view.kind === "edit" && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
      "button",
      {
        type: "button",
        className: "onedev-back",
        disabled: busy,
        onClick: backToList,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-back-glyph", "aria-hidden": "true", children: "\u2190" }),
          t("back")
        ]
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("h3", { className: "onedev-title", children: view.kind === "list" ? t("title") : isNew ? t("newTitle") : t("editTitle") }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-intro", children: t("description") }),
    view.kind === "list" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "onedev-head", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-head-spacer" }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "onedev-btn", onClick: openNew, children: [
          t("addEnv"),
          " +"
        ] })
      ] }),
      load.kind === "loading" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-hint", children: t("loading") }),
      load.kind === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-error", children: load.text }),
      load.kind === "idle" && envs.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "onedev-empty", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-empty-title", children: t("empty") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-empty-hint", children: t("emptyHint") })
      ] }),
      load.kind === "idle" && envs.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("div", { className: "onedev-cards", children: envs.map((d) => /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
        "button",
        {
          type: "button",
          className: "onedev-card-item",
          onClick: () => openEdit(d.slug),
          "aria-label": `${d.slug} \xB7 ${d.onedevUrl}`,
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("span", { className: "onedev-card-row", children: [
              /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-card-title", children: d.slug }),
              d.primary && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-badge onedev-badge-primary", children: t("primary") }),
              !d.primary && !d.configured && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-badge", children: t("notConfigured") })
            ] }),
            d.remark !== "" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-card-remark", children: d.remark }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-card-sub", children: d.onedevUrl || "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { className: "onedev-card-sub", children: d.authType === "token" ? t("tokenAuth") : t("passwordAuth") })
          ]
        },
        d.slug
      )) }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-hint", children: t("applyNote") })
    ] }) : /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "onedev-card", children: [
        field(
          t("name"),
          input(editing.slug, isNew ? (v) => setEditing({ ...editing, slug: v }) : () => {
          }, t("nameHint"))
        ),
        !isNew && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "hidden", value: editing.slug, readOnly: true }),
        field(t("remark"), input(editing.remark, (v) => setEditing({ ...editing, remark: v }), t("remarkHint"))),
        field(t("serverUrl"), input(editing.url, (v) => setEditing({ ...editing, url: v }), t("serverUrlPlaceholder"))),
        field(
          t("authType"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(
            "select",
            {
              className: "onedev-input",
              value: editing.authType,
              onChange: (e) => setEditing({ ...editing, authType: e.target.value }),
              children: [
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "password", children: t("passwordAuth") }),
                /* @__PURE__ */ (0, import_jsx_runtime.jsx)("option", { value: "token", children: t("tokenAuth") })
              ]
            }
          )
        ),
        editing.authType === "password" ? /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
          field(t("username"), input(editing.username, (v) => setEditing({ ...editing, username: v }))),
          field(t("password"), input(editing.password, (v) => setEditing({ ...editing, password: v }), editing.passwordSet ? t("storedSecretHint") : "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", "password"))
        ] }) : field(t("token"), input(editing.token, (v) => setEditing({ ...editing, token: v }), editing.tokenSet ? t("storedSecretHint") : "one-dev-access-token", "password")),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "onedev-grid", children: [
          field(t("apiBase"), input(editing.apiBase, (v) => setEditing({ ...editing, apiBase: v }), "/~api")),
          field(t("apiTimeoutMs"), input(String(editing.apiTimeoutMs) || "30000", (v) => setEditing({ ...editing, apiTimeoutMs: Number(v) || 3e4 }), "30000"))
        ] }),
        field(
          t("extraHeaders"),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "text", className: "onedev-input", value: editing.extraHeaders, placeholder: t("extraHeadersHint"), onChange: (e) => setEditing({ ...editing, extraHeaders: e.target.value }) })
        ),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("label", { className: "onedev-check", children: [
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("input", { type: "checkbox", checked: editing.readonly, onChange: (e) => setEditing({ ...editing, readonly: e.target.checked }) }),
          /* @__PURE__ */ (0, import_jsx_runtime.jsx)("span", { children: t("readonly") })
        ] })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("div", { className: "onedev-actions", children: [
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "onedev-btn", disabled: busy, onClick: () => void save(), children: busy ? t("saving") : t("save") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "onedev-btn-secondary", disabled: busy, onClick: () => void test(), children: busy ? t("testing") : t("test") }),
        editingExisting && /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
          "button",
          {
            type: "button",
            className: "onedev-btn-secondary",
            disabled: busy || primary === editing.slug || envs.length === 1,
            onClick: () => void setPrimaryEnv(),
            children: t("setPrimary")
          }
        ),
        editingExisting && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("button", { type: "button", className: "onedev-btn-danger", disabled: busy, onClick: () => void removeEnv(), children: t("delete") }),
        /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("button", { type: "button", className: "onedev-link", onClick: open, children: [
          t("open"),
          " \u2197"
        ] })
      ] }),
      status.kind === "error" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-error", children: status.text }),
      status.kind === "success" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-saved", children: status.text }),
      (editing.passwordSet || editing.tokenSet) && status.kind !== "success" && /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-hint", children: t("storedLoaded") }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("p", { className: "onedev-hint", children: t("applyNote") })
    ] })
  ] });
}

// plugin/src/client/onedev.css
var onedev_default = "/*\n * OneDev settings-section styles. Every color and surface resolves through a\n * shared `--dsw-alias-*` token so the card follows the dsh theme (light and\n * dark). Values mirror the Models section: soft round corners (8px inputs,\n * 18px pill buttons, 16px card), the module fill for the editing surface, and\n * the shared focus ring. Class names are prefixed `onedev-` to stay isolated\n * because this sheet is injected as a scoped global style (the bundle is built\n * with esbuild, outside the tsdown CSS-Modules pipeline).\n */\n\n.onedev-section {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n  max-width: 720px;\n  color: var(--dsw-alias-label-primary);\n}\n\n.onedev-title {\n  margin: 0;\n  font-size: 16px;\n  line-height: 24px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-primary);\n}\n\n.onedev-intro {\n  margin: 0;\n  font-size: 14px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* Edit-view back button, pinned to the panel's very top-left; it is the first\n   child of the flex column, so `align-self` keeps it content-sized. */\n.onedev-back {\n  box-sizing: border-box;\n  align-self: flex-start;\n  display: inline-flex;\n  align-items: center;\n  gap: 4px;\n  height: 28px;\n  padding: 0 12px 0 8px;\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  border-radius: 14px;\n  corner-shape: round;\n  background: transparent;\n  color: var(--dsw-alias-label-secondary);\n  font: inherit;\n  font-size: 13px;\n  line-height: 20px;\n  cursor: pointer;\n}\n\n.onedev-back:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n  color: var(--dsw-alias-label-primary);\n}\n\n.onedev-back:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.onedev-back:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n.onedev-back-glyph {\n  font-size: 14px;\n  line-height: 20px;\n}\n\n/* List-view header: add-environment button sits top-right. */\n.onedev-head {\n  display: flex;\n  align-items: center;\n  gap: 10px;\n}\n\n.onedev-head-spacer {\n  flex: 1;\n}\n\n/* Empty state for a fresh install. */\n.onedev-empty {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  border: 1px dashed var(--dsw-alias-border-l4);\n  border-radius: 12px;\n  padding: 18px 16px;\n}\n\n.onedev-empty-title {\n  font-size: 14px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.onedev-empty-hint {\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-tertiary);\n}\n\n/* Environment card grid. */\n.onedev-cards {\n  display: grid;\n  grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));\n  gap: 12px;\n}\n\n.onedev-card-item {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n  text-align: left;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-module-platform);\n  padding: 12px 14px;\n  cursor: pointer;\n  font: inherit;\n  color: var(--dsw-alias-label-primary);\n}\n\n.onedev-card-item:hover {\n  border-color: var(--dsw-alias-border-l2);\n  background: var(--dsw-alias-interactive-bg-hover);\n}\n\n.onedev-card-row {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  flex-wrap: wrap;\n}\n\n.onedev-card-title {\n  font-size: 15px;\n  line-height: 22px;\n  font-weight: 600;\n  color: var(--dsw-alias-label-primary);\n}\n\n.onedev-card-remark {\n  font-size: 13px;\n  line-height: 20px;\n  color: var(--dsw-alias-label-secondary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.onedev-card-sub {\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n  overflow: hidden;\n  text-overflow: ellipsis;\n  white-space: nowrap;\n}\n\n.onedev-badge {\n  display: inline-flex;\n  align-items: center;\n  height: 18px;\n  padding: 0 8px;\n  border-radius: 9px;\n  font-size: 11px;\n  line-height: 18px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-tertiary);\n}\n\n.onedev-badge-primary {\n  background: var(--dsw-alias-interactive-bg-active);\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n/* The editing surface: a filled module on the panel, matching the settings\n   selector fill. */\n.onedev-card {\n  box-sizing: border-box;\n  display: flex;\n  flex-direction: column;\n  gap: 14px;\n  border-radius: 12px;\n  background: var(--dsw-alias-bg-module-platform);\n  padding: 14px 16px;\n}\n\n.onedev-field {\n  display: flex;\n  flex-direction: column;\n  gap: 6px;\n}\n\n.onedev-label {\n  display: inline-flex;\n  align-items: center;\n  gap: 6px;\n  font-size: 12px;\n  line-height: 18px;\n  font-weight: 500;\n  color: var(--dsw-alias-label-secondary);\n}\n\n.onedev-input {\n  box-sizing: border-box;\n  width: 100%;\n  height: 32px;\n  padding: 0 10px;\n  border: 0.5px solid var(--dsw-alias-border-l4);\n  border-radius: 8px;\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  background: var(--dsw-alias-bg-layer-1);\n  color: var(--dsw-alias-label-primary);\n}\n\n.onedev-input:focus {\n  outline: none;\n  border-color: var(--dsw-alias-brand-primary);\n}\n\n.onedev-input::placeholder {\n  color: var(--dsw-alias-label-dimmed);\n}\n\nselect.onedev-input {\n  appearance: none;\n  padding-right: 32px;\n  /* Data-URI SVG cannot resolve CSS variables; #81858C is the caption gray\n     shared by both themes. */\n  background-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12' fill='none'%3E%3Cpath d='M3 4.5L6 7.5L9 4.5' stroke='%2381858C' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\");\n  background-repeat: no-repeat;\n  background-position: right 12px center;\n  background-size: 12px 12px;\n  cursor: pointer;\n}\n\n.onedev-grid {\n  display: grid;\n  grid-template-columns: 1fr 1fr;\n  gap: 12px;\n}\n\n@media (max-width: 520px) {\n  .onedev-grid {\n    grid-template-columns: 1fr;\n  }\n}\n\n.onedev-check {\n  display: flex;\n  align-items: center;\n  gap: 8px;\n  font-size: 14px;\n  line-height: 22px;\n  color: var(--dsw-alias-label-secondary);\n  cursor: pointer;\n}\n\n.onedev-actions {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: center;\n  gap: 8px;\n}\n\n.onedev-btn,\n.onedev-btn-secondary,\n.onedev-btn-danger {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  justify-content: center;\n  gap: 4px;\n  height: 36px;\n  padding: 0 14px;\n  border: none;\n  border-radius: 18px;\n  corner-shape: round;\n  font: inherit;\n  font-size: 14px;\n  line-height: 22px;\n  cursor: pointer;\n}\n\n.onedev-btn {\n  background: var(--dsw-alias-button-primary-fill);\n  color: var(--dsw-alias-label-primary-foreground);\n}\n\n.onedev-btn:hover:not(:disabled) {\n  background: var(--dsw-alias-button-primary-hover);\n}\n\n.onedev-btn-secondary {\n  border: 0.5px solid var(--dsw-alias-border-l3);\n  background: transparent;\n  color: var(--dsw-alias-label-primary);\n}\n\n.onedev-btn-secondary:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-solid);\n}\n\n.onedev-btn-danger {\n  background: transparent;\n  color: var(--dsw-alias-state-error-primary);\n  border: 0.5px solid var(--dsw-alias-state-error-primary);\n}\n\n.onedev-btn-danger:hover:not(:disabled) {\n  background: var(--dsw-alias-interactive-bg-hover-danger);\n}\n\n.onedev-btn:disabled,\n.onedev-btn-secondary:disabled,\n.onedev-btn-danger:disabled {\n  opacity: 0.4;\n  cursor: default;\n}\n\n.onedev-btn:focus-visible,\n.onedev-btn-secondary:focus-visible,\n.onedev-btn-danger:focus-visible {\n  outline: none;\n  box-shadow: 0 0 0 2px var(--dsw-alias-border-l3);\n}\n\n.onedev-link {\n  box-sizing: border-box;\n  display: inline-flex;\n  align-items: center;\n  height: 28px;\n  padding: 0 10px;\n  margin-left: 4px;\n  border: none;\n  border-radius: 14px;\n  corner-shape: round;\n  background: transparent;\n  color: var(--dsw-alias-label-tertiary);\n  font: inherit;\n  font-size: 12px;\n  line-height: 18px;\n  text-decoration: none;\n  cursor: pointer;\n}\n\n.onedev-link:hover {\n  background: var(--dsw-alias-interactive-bg-hover);\n  color: var(--dsw-alias-label-secondary);\n}\n\n.onedev-store {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-dimmed);\n}\n\n.onedev-saved {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-success-primary);\n}\n\n.onedev-error {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-state-error-primary);\n}\n\n.onedev-hint {\n  margin: 0;\n  font-size: 12px;\n  line-height: 18px;\n  color: var(--dsw-alias-label-tertiary);\n}";

// plugin/src/client/locales.ts
var ZH = {
  nav: "OneDev",
  title: "OneDev \u73AF\u5883",
  description: "\u7BA1\u7406\u4E00\u4E2A\u6216\u591A\u4E2A OneDev \u73AF\u5883\uFF08\u6BCF\u73AF\u5883\u72EC\u7ACB\u5730\u5740 / \u51ED\u636E / \u5907\u6CE8\uFF09\u3002\u4FDD\u5B58\u540E\u5BF9\u540E\u7EED\u5DE5\u5177\u8C03\u7528\u7ACB\u5373\u751F\u6548\uFF0CAI \u53EF\u901A\u8FC7\u73AF\u5883\u6807\u8BC6\uFF08slug\uFF09\u65E0\u6B67\u4E49\u5730\u8C03\u7528\u6307\u5B9A\u73AF\u5883\u3002",
  addEnv: "\u65B0\u589E\u73AF\u5883",
  back: "\u8FD4\u56DE",
  empty: "\u5C1A\u672A\u914D\u7F6E\u4EFB\u4F55 OneDev \u73AF\u5883",
  emptyHint: "\u70B9\u51FB\u53F3\u4E0A\u89D2\u300C\u65B0\u589E\u73AF\u5883\u300D\uFF0C\u586B\u5199\u670D\u52A1\u5668\u5730\u5740\u4E0E\u7BA1\u7406\u5458\u51ED\u636E\uFF0C\u5E76\u4E3A\u5176\u8BBE\u7F6E\u4E00\u4E2A\u7B80\u77ED\u7684\u73AF\u5883\u6807\u8BC6\uFF08slug\uFF09\uFF0C\u4F9B AI \u7CBE\u786E\u4F7F\u7528\u3002",
  name: "\u73AF\u5883\u6807\u8BC6",
  nameHint: "\u82F1\u6587\u77ED\u540D slug\uFF0C\u5982 prod / staging\uFF1BAI \u7528\u5B83\u6307\u5B9A\u73AF\u5883",
  remark: "\u5907\u6CE8",
  remarkHint: "\u53EF\u9009\uFF0C\u7528\u4E8E\u5FEB\u901F\u8BC6\u522B\uFF08\u4E5F\u663E\u793A\u5728\u5361\u7247\u4E0E MCP \u53D1\u73B0\u5DE5\u5177\u4E2D\uFF09",
  primary: "\u4E3B\u73AF\u5883",
  setPrimary: "\u8BBE\u4E3A\u4E3B\u73AF\u5883",
  setPrimaryDone: "\u2713 \u5DF2\u8BBE\u4E3A\u4E3B\u73AF\u5883",
  delete: "\u5220\u9664\u73AF\u5883",
  deleteConfirm: "\u786E\u8BA4\u5220\u9664\u8BE5\u73AF\u5883\u53CA\u5176\u5168\u90E8\u51ED\u636E\uFF1F",
  editTitle: "\u7F16\u8F91\u73AF\u5883",
  newTitle: "\u65B0\u589E\u73AF\u5883",
  notConfigured: "\u5C1A\u672A\u914D\u7F6E",
  serverUrl: "\u670D\u52A1\u5668\u5730\u5740",
  serverUrlPlaceholder: "http://localhost:6610",
  authType: "\u8BA4\u8BC1\u65B9\u5F0F",
  passwordAuth: "\u8D26\u53F7 + \u5BC6\u7801",
  tokenAuth: "\u8BBF\u95EE\u4EE4\u724C",
  username: "\u7BA1\u7406\u5458\u7528\u6237\u540D",
  password: "\u7BA1\u7406\u5458\u5BC6\u7801",
  token: "\u8BBF\u95EE\u4EE4\u724C",
  storedSecretHint: "\u5DF2\u4FDD\u5B58 \xB7 \u7559\u7A7A\u4FDD\u6301\u4E0D\u53D8",
  storedLoaded: "\u5DF2\u52A0\u8F7D\u5DF2\u4FDD\u5B58\u7684\u914D\u7F6E\uFF1B\u5BC6\u7801/\u4EE4\u724C\u7B49\u654F\u611F\u9879\u4E0D\u4F1A\u56DE\u663E\uFF0C\u7559\u7A7A\u5373\u4FDD\u6301\u539F\u503C\uFF0C\u53EF\u76F4\u63A5\u70B9\u51FB\u201C\u6D4B\u8BD5\u8FDE\u63A5\u201D\u3002",
  apiBase: "REST \u524D\u7F00",
  apiTimeoutMs: "\u8BF7\u6C42\u8D85\u65F6 (ms)",
  readonly: "\u53EA\u8BFB\u6A21\u5F0F\uFF08\u62D2\u7EDD\u6240\u6709\u5199\u64CD\u4F5C\uFF09",
  extraHeaders: "\u9644\u52A0\u8BF7\u6C42\u5934 (JSON)",
  extraHeadersHint: '\u53EF\u9009\uFF0C\u4F8B\u5982 {"X-Trace":"v"}',
  save: "\u4FDD\u5B58",
  saving: "\u4FDD\u5B58\u4E2D\u2026",
  saved: "\u2713 \u5DF2\u4FDD\u5B58\uFF08\u540E\u7EED\u5DE5\u5177\u8C03\u7528\u7ACB\u5373\u751F\u6548\uFF09",
  test: "\u6D4B\u8BD5\u8FDE\u63A5",
  testing: "\u6D4B\u8BD5\u4E2D\u2026",
  testOk: "\u2713 \u8FDE\u63A5\u4E0E\u8BA4\u8BC1\u6210\u529F\uFF08\u7BA1\u7406\u5458\uFF09",
  testOkStored: "\u2713 \u8FDE\u63A5\u4E0E\u8BA4\u8BC1\u6210\u529F\uFF08\u7BA1\u7406\u5458\uFF0C\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684\u51ED\u636E\uFF09",
  testNotAdmin: "\u51ED\u636E\u6709\u6548\uFF0C\u4F46\u8BE5\u8D26\u53F7\u4E0D\u662F\u7BA1\u7406\u5458",
  testFail: "\u6D4B\u8BD5\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u5730\u5740\u4E0E\u51ED\u636E",
  clear: "\u6E05\u9664\u914D\u7F6E",
  clearConfirm: "\u786E\u8BA4\u6E05\u9664\u5DF2\u4FDD\u5B58\u7684 OneDev \u914D\u7F6E\uFF1F",
  open: "\u6253\u5F00 OneDev",
  applyNote: "\u4FDD\u5B58\u540E\u65E0\u9700\u91CD\u542F dsh\uFF1AMCP \u670D\u52A1\u5668\u5728\u6BCF\u6B21\u5DE5\u5177\u8C03\u7528\u65F6\u91CD\u65B0\u8BFB\u53D6\u6B64\u914D\u7F6E\u3002",
  loading: "\u52A0\u8F7D\u4E2D\u2026"
};
var EN = {
  nav: "OneDev",
  title: "OneDev environments",
  description: "Manage one or more OneDev environments (each with its own URL / credentials / remark). Changes apply to subsequent tool calls immediately; the AI targets a specific server unambiguously via its environment slug.",
  addEnv: "Add environment",
  back: "Back",
  empty: "No OneDev environment configured yet",
  emptyHint: "Click \u201CAdd environment\u201D in the top-right, enter the server URL and administrator credentials, and give it a short slug so the AI can reference it precisely.",
  name: "Environment name",
  nameHint: "Short slug, e.g. prod / staging; the AI uses it to pick the environment",
  remark: "Remark",
  remarkHint: "Optional, for quick identification (shown on cards and in the MCP discovery tool)",
  primary: "Primary",
  setPrimary: "Set as primary",
  setPrimaryDone: "\u2713 Set as primary",
  delete: "Delete environment",
  deleteConfirm: "Delete this environment and all its credentials?",
  editTitle: "Edit environment",
  newTitle: "New environment",
  notConfigured: "Not configured",
  serverUrl: "Server URL",
  serverUrlPlaceholder: "http://localhost:6610",
  authType: "Authentication",
  passwordAuth: "Account + password",
  tokenAuth: "Access token",
  username: "Administrator username",
  password: "Administrator password",
  token: "Access token",
  storedSecretHint: "Saved \u2014 leave blank to keep",
  storedLoaded: "Saved configuration loaded; secrets are never echoed \u2014 leave them blank to keep the stored values, then just press \u201CTest connection\u201D.",
  apiBase: "REST prefix",
  apiTimeoutMs: "Request timeout (ms)",
  readonly: "Read-only mode (refuse every write)",
  extraHeaders: "Extra request headers (JSON)",
  extraHeadersHint: 'Optional, e.g. {"X-Trace":"v"}',
  save: "Save",
  saving: "Saving\u2026",
  saved: "\u2713 Saved (applied to subsequent tool calls)",
  test: "Test connection",
  testing: "Testing\u2026",
  testOk: "\u2713 Connection and authentication OK (administrator)",
  testOkStored: "\u2713 Connection and authentication OK (administrator, using saved credentials)",
  testNotAdmin: "Credentials accepted, but this account is not an administrator",
  testFail: "Test failed \u2014 check the URL and credentials",
  clear: "Clear config",
  clearConfirm: "Clear all saved OneDev config?",
  open: "Open OneDev",
  applyNote: "No dsh restart needed \u2014 the MCP server re-reads this config on every tool call.",
  loading: "Loading\u2026"
};

// plugin/src/client/index.ts
var NS = "settings.onedev";
var name = "dsh-onedev";
var inject = ["slots", "locale"];
function injectStyles(css) {
  if (typeof document === "undefined") return;
  if (document.head.querySelector('style[data-dsh-onedev="true"]') !== null) return;
  const tag = document.createElement("style");
  tag.setAttribute("data-dsh-onedev", "true");
  tag.setAttribute("data-plugin", "dsh-onedev");
  tag.textContent = css;
  document.head.appendChild(tag);
}
function apply(ctx) {
  injectStyles(onedev_default);
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), "dsh-onedev: dictionaries");
  const t = () => ctx.locale.bind(NS);
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "onedev",
    order: 120,
    label: () => t()("nav"),
    locale: NS
    // The composed `settings.section` props include framework seats the section
    // does not consume; the register contract is satisfied at runtime and the
    // bundle type-checks independently of the full SlotMap composition.
  }, OneDevSection));
}
return module.exports; } });
