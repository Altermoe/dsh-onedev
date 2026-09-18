/**
 * dsh-onedev-mcp — setup console (single-file HTML) page asset.
 *
 * A self-contained page (no external CDN) served by `src/setup/server.ts`. It
 * lets an operator create/edit named OneDev environments (server URL + access
 * token or a plain account/password), validate them with OneDev before saving,
 * set a primary environment, and delete ones they no longer need. The primary
 * UI is the dsh Web settings panel; this console is a lightweight fallback.
 */

export const SETUP_PAGE = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>dsh-onedev-mcp · 配置控制台 / Setup Console</title>
<style>
  :root { color-scheme: light dark; --fg:#1c1e21; --mut:#6b7280; --line:#e5e7eb;
    --accent:#2563eb; --ok:#15803d; --err:#b91c1c; --warn:#b45309; --bg:#f9fafb; }
  @media (prefers-color-scheme: dark) {
    :root { --fg:#e5e7eb; --mut:#9ca3af; --line:#374151; --accent:#3b82f6;
      --ok:#4ade80; --err:#f87171; --warn:#fbbf24; --bg:#111827; }
  }
  * { box-sizing: border-box }
  body { margin:0; font-family: -apple-system, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    background:var(--bg); color:var(--fg); }
  .wrap { max-width: 640px; margin: 0 auto; padding: 32px 20px 60px; }
  h1 { font-size: 20px; } h1 small { display:block; color:var(--mut); font-weight:400; font-size:13px; margin-top:4px; }
  .card { background:var(--bg); border:1px solid var(--line); border-radius:10px; padding:20px; margin-top:18px; }
  label { display:block; font-size:13px; font-weight:600; margin:14px 0 6px; }
  input[type=text], input[type=password], input[type=number] { width:100%; padding:9px 10px; border:1px solid var(--line);
    border-radius:8px; background:transparent; color:var(--fg); font-size:14px; }
  .row { display:flex; gap:10px; align-items:center; }
  .radio { display:flex; gap:18px; align-items:center; margin:6px 0; }
  .radio label { margin:0; font-weight:500; display:flex; gap:6px; align-items:center; }
  button { padding:9px 16px; border:0; border-radius:8px; font-size:14px; cursor:pointer; }
  .btn-primary { background:var(--accent); color:#fff; }
  .btn-quiet { background:transparent; color:var(--mut); border:1px solid var(--line); }
  .btn-danger { background:transparent; color:var(--err); border:1px solid var(--err); }
  button:disabled { opacity:.6; cursor:not-allowed; }
  .status { margin-top:16px; border-top:1px solid var(--line); padding-top:14px; font-size:13px; white-space:pre-wrap; }
  .status.bad { color:var(--err) } .status.good { color:var(--ok) } .status.warn { color:var(--warn) }
  .mut { color:var(--mut); font-size:12px; }
  code { background:var(--line); padding:1px 5px; border-radius:4px; font-size:12px; }
  .hidden { display:none }
  .loader { display:inline-block; width:10px; height:10px; border:2px solid currentColor; border-right-color:transparent;
    border-radius:50%; animation:sp .8s linear infinite; vertical-align:-1px; margin-right:6px }
  @keyframes sp { to { transform: rotate(360deg) } }
  .envlist { margin-top:12px; display:flex; flex-direction:column; gap:8px; }
  .envrow { display:flex; align-items:center; gap:10px; border:1px solid var(--line); border-radius:8px; padding:8px 10px; font-size:13px; }
  .envrow .name { font-weight:600; }
  .envrow .pill { padding:1px 8px; border-radius:10px; font-size:11px; background:var(--line); color:var(--mut); }
  .grow { flex:1 }
</style>
</head>
<body>
<div class="wrap">
  <h1>dsh-onedev-mcp · 配置 / Setup<small>
    管理多个 OneDev 环境：账号密码将用于自动鉴权，无需先在 Web 手动创建 Token。</small></h1>

  <div class="card">
    <div class="row" style="gap:12px">
      <div class="grow" style="min-width:0">
        <label for="slug">环境标识 / Slug <span class="mut">(必填，供 AI 选环境，如 prod/staging)</span></label>
        <input id="slug" type="text" placeholder="prod" autocomplete="off">
      </div>
      <div class="grow" style="min-width:0">
        <label for="remark">备注 / Remark <span class="mut">(可选)</span></label>
        <input id="remark" type="text" placeholder="Production OneDev" autocomplete="off">
      </div>
    </div>

    <label for="url">OneDev 服务器地址 / Server URL</label>
    <input id="url" type="text" placeholder="http://localhost:6610" autocomplete="off">

    <label>认证方式 / Authentication</label>
    <div class="radio">
      <label><input type="radio" name="auth" value="password" checked> 账号密码 / Account+Password</label>
      <label><input type="radio" name="auth" value="token"> 访问令牌 / Access Token</label>
    </div>

    <div id="passFields">
      <label for="username">用户名 / Username</label>
      <input id="username" type="text" autocomplete="username" placeholder="admin / root">
      <label for="password">密码 / Password</label>
      <input id="password" type="password" autocomplete="current-password" placeholder="留空表示保留已保存值 / blank keeps saved">
      <p class="mut">通过 <code>Authorization: Basic base64(user:pass)</code> 直接登录 OneDev（BasicAuthenticationFilter）。</p>
    </div>

    <div id="tokenFields" class="hidden">
      <label for="token">访问令牌 / Access Token</label>
      <input id="token" type="password" autocomplete="off" placeholder="留空表示保留已保存值 / blank keeps saved">
      <p class="mut">OneDev 对 REST 请求同样支持 <code>Authorization: Bearer &lt;token&gt;</code>。</p>
    </div>

    <div class="row" style="margin-top:18px">
      <button id="probe" class="btn-primary">测试连接 / Test</button>
      <button id="save" class="btn-quiet" style="color:var(--ok);border-color:var(--ok)">保存并测试 / Save</button>
      <button id="setPrimary" class="btn-quiet">设为主环境 / Set Primary</button>
      <button id="delete" class="btn-danger">删除 / Delete</button>
    </div>

    <div id="status" class="status"></div>
  </div>

  <div class="card">
    <label>已配置环境 / Configured environments</label>
    <div id="envlist" class="envlist"><p class="mut">加载中… / loading…</p></div>
  </div>
</div>

<script>
(function () {
  var slugEl = document.getElementById('slug');
  var remarkEl = document.getElementById('remark');
  var urlEl = document.getElementById('url');
  var usrEl = document.getElementById('username');
  var passEl = document.getElementById('password');
  var tokEl = document.getElementById('token');
  var passFields = document.getElementById('passFields');
  var tokenFields = document.getElementById('tokenFields');
  var statusEl = document.getElementById('status');
  var listEl = document.getElementById('envlist');
  var envs = [];

  function authType() { return document.querySelector('input[name=auth]:checked').value; }
  function syncFields() {
    var t = authType();
    passFields.classList.toggle('hidden', t !== 'password');
    tokenFields.classList.toggle('hidden', t !== 'token');
  }
  document.querySelectorAll('input[name=auth]').forEach(function (r) { r.addEventListener('change', syncFields); });
  syncFields();

  function status(html, cls) { statusEl.className = 'status ' + (cls || ''); statusEl.innerHTML = html; }
  function payload() {
    return {
      slug: slugEl.value.trim(),
      remark: remarkEl.value.trim(),
      onedevUrl: urlEl.value.trim(),
      authType: authType(),
      onedevToken: authType() === 'token' ? tokEl.value.trim() : '',
      username: authType() === 'password' ? usrEl.value.trim() : '',
      password: authType() === 'password' ? passEl.value : '',
    };
  }
  async function post(path, body) {
    var r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    var txt = await r.text(); var data = txt ? JSON.parse(txt) : {};
    if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
    return data;
  }
  function fmt(o) {
    return o.kind === 'ok' ? '<span style="color:var(--ok)">OK</span>'
      : o.kind === 'forbidden' ? '<span style="color:var(--warn)">已识别 / limited</span>'
      : o.kind === 'unauthorized' ? '<span style="color:var(--err)">未授权 / unauthorized</span>'
      : '<span style="color:var(--err)">错误 / error</span>';
  }

  function render() {
    if (!envs.length) { listEl.innerHTML = '<p class="mut">尚未配置环境 / no environments yet.</p>'; return; }
    listEl.innerHTML = envs.map(function (d) {
      var pill = d.primary ? ' <span class="pill" style="color:var(--ok)">主 / primary</span>' : '';
      return '<div class="envrow">' +
        '<button class="btn-quiet" data-load="' + d.slug + '">编辑/Edit</button>' +
        '<span class="name">' + d.slug + '</span>' +
        '<span class="grow mut">' + (d.remark || '') + ' · ' + (d.onedevUrl || '') + '</span>' +
        pill +
        '<button class="btn-danger" data-del="' + d.slug + '">删/Delete</button>' +
        '</div>';
    }).join('');
  }
  async function refresh() {
    var r = await fetch('/api/config', { method: 'GET' });
    if (!r.ok) return;
    var d = await r.json();
    envs = d.envs || [];
    render();
    if (!envs.length) { slugEl.value = ''; urlEl.value = ''; return; }
    loadEnv(envs[0].slug, false);
  }

  function loadEnv(slug, clearSecrets) {
    var d = envs.find(function (e) { return e.slug === slug; });
    if (!d) return;
    slugEl.value = d.slug;
    remarkEl.value = d.remark;
    urlEl.value = d.onedevUrl;
    var t = d.authType === 'token' ? 'token' : 'password';
    document.querySelector('input[name=auth][value="' + t + '"]').checked = true;
    syncFields();
    usrEl.value = d.username || '';
    if (clearSecrets !== false) { passEl.value = ''; tokEl.value = ''; }
  }

  listEl.addEventListener('click', function (e) {
    var t = e.target;
    if (t.dataset.load) { loadEnv(t.dataset.load); return; }
    if (t.dataset.del) {
      if (!window.confirm('删除环境 ' + t.dataset.del + '？ / delete environment?')) return;
      post('/api/delete', { slug: t.dataset.del }).then(refresh).catch(function (e) { status('删除失败 / failed: ' + e.message, 'bad'); });
    }
  });

  var btnStatusMap = { probe: '正在测试连接… / testing…', save: '正在保存并测试… / saving & testing…' };

  function run(action, path, onOk) {
    status('<span class="loader"></span> ' + (btnStatusMap[action] || '处理中… / working…'), '');
    return post(path, action === 'probe' ? payload() : payload()).then(function (d) {
      if (action === 'probe') {
        status('结果 / Result: ' + fmt(d) + '  HTTP ' + d.status + '\\n' + (d.message || ''), d.kind === 'ok' ? 'good' : (d.kind === 'forbidden' ? 'warn' : 'bad'));
      } else {
        status('结果 / Result: ' + fmt(d) + '  HTTP ' + d.status + '\\n' + (d.message || ''), d.kind === 'ok' ? 'good' : 'bad');
        if (onOk) onOk(d);
      }
    }).catch(function (e) { status('请求失败 / failed: ' + e.message, 'bad'); });
  }

  document.getElementById('probe').addEventListener('click', function () {
    if (!slugEl.value.trim()) { status('请先填写环境标识 / fill in a slug first.', 'bad'); return; }
    run('probe', '/api/probe');
  });
  document.getElementById('save').addEventListener('click', function () {
    if (!slugEl.value.trim()) { status('请先填写环境标识 / fill in a slug first.', 'bad'); return; }
    run('save', '/api/save', function () { window.setTimeout(refresh, 50); });
  });
  document.getElementById('setPrimary').addEventListener('click', function () {
    if (!slugEl.value.trim()) { status('请先填写环境标识 / fill in a slug first.', 'bad'); return; }
    status('<span class="loader"></span> 设置主环境… / setting primary…', '');
    post('/api/primary', { slug: slugEl.value.trim() }).then(function () { status('已设为主环境 / primary set.', 'good'); refresh(); })
      .catch(function (e) { status('设置失败 / failed: ' + e.message, 'bad'); });
  });
  document.getElementById('delete').addEventListener('click', function () {
    if (!slugEl.value.trim()) return;
    if (!window.confirm('删除环境 ' + slugEl.value.trim() + '？ / delete environment?')) return;
    post('/api/delete', { slug: slugEl.value.trim() }).then(function () { status('已删除 / deleted.', 'good'); refresh(); })
      .catch(function (e) { status('删除失败 / failed: ' + e.message, 'bad'); });
  });
  refresh();
})();
</script>
</body>
</html>
`