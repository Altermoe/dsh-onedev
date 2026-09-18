/**
 * OneDev settings-section. Card layout over the configured OneDev environments.
 *
 * **List view**: a header with an "Add environment" button (top-right) above a
 * grid of environment cards. Each card shows the slug, remark, URL, auth type
 * and a primary/configured badge; clicking a card opens its edit view. An empty
 * state prompts to add the first environment.
 *
 * **Edit view**: the per-environment form (server URL + account/token plus the
 * direct-connection pass-through options), with Save / Test connection /
 * Set-as-primary / Delete and a Back button. A new environment also edits its
 * slug; an existing one shows the (immutable) slug and a remark field.
 *
 * Secrets are never echoed back by the host, so on reopen the password/token/
 * extra-headers fields start blank; the `*Set` flags drive the "saved" placeholders.
 * `POST /api/onedev/probe` falls back to the targeted environment's stored
 * credentials for blank secret fields (reported via `usedStored`).
 *
 * The fetch endpoints are served loopback-only by this package's Host half.
 * Styling comes from `onedev.css` (injected once at apply) using the shared
 * `--dsw-*` tokens, so the section follows the dsh rounded/minimal theme.
 */
import { useEffect, useState } from 'react'
import type { Translate } from '@deepseek-ai/dsh-client-ui-slots'
import type { OneDevKey } from './locales.ts'

/** JSON descriptor returned for each configured environment (secrets redacted). */
interface EnvDescriptor {
  slug: string
  remark: string
  onedevUrl: string
  authType: 'token' | 'password'
  username: string
  tokenSet: boolean
  passwordSet: boolean
  readonly: boolean
  primary: boolean
  configured: boolean
}

/** JSON returned by `GET /api/onedev/config`. */
interface ConfigReply {
  ok: boolean
  primary: string
  envs: EnvDescriptor[]
  error?: string
}

interface ProbeReply {
  ok: boolean
  outcome?: { kind: string; message?: string; status?: number }
  error?: string
  /** Fields the host filled in from the credential store (blank input fallback). */
  usedStored?: string[]
}

type LoadStatus = { kind: 'loading' } | { kind: 'error'; text: string } | { kind: 'idle' }
type ActionStatus =
  | { kind: 'idle' }
  | { kind: 'error'; text: string }
  | { kind: 'success'; text: string }

type View = { kind: 'list' } | { kind: 'edit'; slug: string | null }

/** Edit-form local state (secrets are never round-tripped out of the browser). */
interface EditState {
  slug: string
  remark: string
  url: string
  authType: 'token' | 'password'
  username: string
  password: string
  token: string
  readonly: boolean
  apiTimeoutMs: number
  apiBase: string
  extraHeaders: string
  passwordSet: boolean
  tokenSet: boolean
  extraHeadersSet: boolean
}

const DEFAULT_EDIT: EditState = {
  slug: '',
  remark: '',
  url: '',
  authType: 'password',
  username: '',
  password: '',
  token: '',
  readonly: false,
  apiTimeoutMs: 30000,
  apiBase: '/~api',
  extraHeaders: '',
  passwordSet: false,
  tokenSet: false,
  extraHeadersSet: false,
}

/** The props the `settings.section` slot injects into this component. */
export interface OneDevSectionProps {
  /** Locale `t` seat bound to the `settings.onedev` namespace. */
  t: Translate<OneDevKey>
}

/** Render the OneDev environments settings panel. */
export function OneDevSection(props: OneDevSectionProps): JSX.Element {
  const { t } = props
  const [load, setLoad] = useState<LoadStatus>({ kind: 'loading' })
  const [status, setStatus] = useState<ActionStatus>({ kind: 'idle' })
  const [view, setView] = useState<View>({ kind: 'list' })
  const [envs, setEnvs] = useState<EnvDescriptor[]>([])
  const [primary, setPrimary] = useState('')
  const [editing, setEditing] = useState<EditState>(DEFAULT_EDIT)
  const [busy, setBusy] = useState(false)

  const fetchConfig = async (): Promise<ConfigReply | null> => {
    try {
      const res = await fetch('/api/onedev/config')
      const data = (await res.json()) as ConfigReply
      if (!res.ok || !data.ok) return null
      return data
    } catch {
      return null
    }
  }

  const refresh = async (): Promise<void> => {
    const data = await fetchConfig()
    if (!data) {
      setLoad({ kind: 'error', text: t('testFail') })
      return
    }
    setEnvs(data.envs)
    setPrimary(data.primary)
    setLoad({ kind: 'idle' })
  }

  useEffect(() => {
    void refresh()
    // `t` is stable for the registration's lifetime; guard time is the mount only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const seeded = (d: EnvDescriptor | undefined): EditState => {
    if (!d) return { ...DEFAULT_EDIT }
    return {
      slug: d.slug,
      remark: d.remark,
      url: d.onedevUrl,
      authType: d.authType,
      username: d.username,
      password: '',
      token: '',
      readonly: d.readonly,
      apiTimeoutMs: 30000,
      apiBase: '/~api',
      extraHeaders: '',
      passwordSet: d.passwordSet,
      tokenSet: d.tokenSet,
      extraHeadersSet: false,
    }
  }

  const openNew = (): void => {
    setEditing({ ...DEFAULT_EDIT })
    setStatus({ kind: 'idle' })
    setView({ kind: 'edit', slug: null })
  }

  const openEdit = (slug: string): void => {
    setEditing(seeded(envs.find((e) => e.slug === slug)))
    setStatus({ kind: 'idle' })
    setView({ kind: 'edit', slug })
  }

  const backToList = (): void => {
    setView({ kind: 'list' })
    setStatus({ kind: 'idle' })
  }

  const editBody = (action: string): Record<string, unknown> => ({
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
    extraHeaders: editing.extraHeaders.trim() !== '' ? editing.extraHeaders : undefined,
  })

  const save = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await fetch('/api/onedev/config', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(editBody('save')),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (res.ok && data.ok !== false) {
        // Persisted; secret inputs are never echoed back — refresh & blank them.
        const savedSlug = editing.slug
        const fresh = await fetchConfig()
        if (fresh) {
          setEnvs(fresh.envs)
          setPrimary(fresh.primary)
          setEditing(seeded(fresh.envs.find((e) => e.slug === savedSlug)))
        }
        setStatus({ kind: 'success', text: t('saved') })
      } else {
        setStatus({ kind: 'error', text: data.error ?? t('testFail') })
      }
    } catch {
      setStatus({ kind: 'error', text: t('testFail') })
    } finally {
      setBusy(false)
    }
  }

  const test = async (): Promise<void> => {
    setBusy(true)
    try {
      const res = await fetch('/api/onedev/probe', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...editBody('save'), env: editing.slug }),
      })
      const data = (await res.json().catch(() => ({}))) as ProbeReply
      const kind = data.outcome?.kind
      const usedStoredSecret = (data.usedStored ?? []).includes('password')
        || (data.usedStored ?? []).includes('onedevToken')
      setStatus(kind === 'ok'
        ? { kind: 'success', text: usedStoredSecret ? t('testOkStored') : t('testOk') }
        : kind === 'forbidden'
          ? { kind: 'error', text: t('testNotAdmin') }
          : { kind: 'error', text: data.error ?? t('testFail') })
    } catch {
      setStatus({ kind: 'error', text: t('testFail') })
    } finally {
      setBusy(false)
    }
  }

  const removeEnv = async (): Promise<void> => {
    if (!window.confirm(t('deleteConfirm')) || !editing.slug) return
    setBusy(true)
    try {
      const res = await fetch('/api/onedev/config', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'delete', slug: editing.slug }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string }
      if (res.ok && data.ok !== false) {
        const fresh = await fetchConfig()
        if (fresh) {
          setEnvs(fresh.envs)
          setPrimary(fresh.primary)
        }
        setStatus({ kind: 'idle' })
        setView({ kind: 'list' })
      } else {
        setStatus({ kind: 'error', text: data.error ?? t('testFail') })
      }
    } catch {
      setStatus({ kind: 'error', text: t('testFail') })
    } finally {
      setBusy(false)
    }
  }

  const setPrimaryEnv = async (): Promise<void> => {
    if (!editing.slug) return
    setBusy(true)
    try {
      const res = await fetch('/api/onedev/config', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'setPrimary', slug: editing.slug }),
      })
      const data = await res.json().catch(() => ({})) as { ok?: boolean; error?: string; envs?: EnvDescriptor[] }
      if (res.ok && data.ok !== false) {
        const fresh = data.envs ?? envs
        setEnvs(fresh.map((e) => ({ ...e, primary: e.slug === editing.slug })))
        setPrimary(editing.slug)
        setStatus({ kind: 'success', text: t('setPrimaryDone') })
      } else {
        setStatus({ kind: 'error', text: data.error ?? t('testFail') })
      }
    } catch {
      setStatus({ kind: 'error', text: t('testFail') })
    } finally {
      setBusy(false)
    }
  }

  const open = (): void => {
    if (editing.url.trim() !== '') window.open(editing.url.trim(), '_blank', 'noopener,noreferrer')
  }

  const field = (label: string, control: JSX.Element): JSX.Element => (
    <label className="onedev-field">
      <span className="onedev-label">{label}</span>
      {control}
    </label>
  )

  const input = (value: string, onChange: (v: string) => void, placeholder?: string, type = 'text'): JSX.Element => (
    <input
      className="onedev-input"
      type={type} value={value} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  )

  const isNew = view.kind === 'edit' && view.slug === null
  const editingExisting = view.kind === 'edit' && !isNew

  return (
    <div className="onedev-section">
      <h3 className="onedev-title">{view.kind === 'list' ? t('title') : isNew ? t('newTitle') : t('editTitle')}</h3>
      <p className="onedev-intro">{t('description')}</p>

      {view.kind === 'list' ? (
        <>
          <div className="onedev-head">
            <span className="onedev-head-spacer" />
            <button type="button" className="onedev-btn" onClick={openNew}>{t('addEnv')} +</button>
          </div>

          {load.kind === 'loading' && <p className="onedev-hint">{t('loading')}</p>}
          {load.kind === 'error' && <p className="onedev-error">{load.text}</p>}

          {load.kind === 'idle' && envs.length === 0 && (
            <div className="onedev-empty">
              <span className="onedev-empty-title">{t('empty')}</span>
              <span className="onedev-empty-hint">{t('emptyHint')}</span>
            </div>
          )}

          {load.kind === 'idle' && envs.length > 0 && (
            <div className="onedev-cards">
              {envs.map((d) => (
                <button
                  key={d.slug}
                  type="button"
                  className="onedev-card-item"
                  onClick={() => openEdit(d.slug)}
                  aria-label={`${d.slug} · ${d.onedevUrl}`}
                >
                  <span className="onedev-card-row">
                    <span className="onedev-card-title">{d.slug}</span>
                    {d.primary && <span className="onedev-badge onedev-badge-primary">{t('primary')}</span>}
                    {!d.primary && !d.configured && <span className="onedev-badge">{t('notConfigured')}</span>}
                  </span>
                  {d.remark !== '' && <span className="onedev-card-remark">{d.remark}</span>}
                  <span className="onedev-card-sub">{d.onedevUrl || '—'}</span>
                  <span className="onedev-card-sub">{d.authType === 'token' ? t('tokenAuth') : t('passwordAuth')}</span>
                </button>
              ))}
            </div>
          )}
          <p className="onedev-hint">{t('applyNote')}</p>
        </>
      ) : (
        <>
          <div className="onedev-card">
            {field(
              t('name'),
              input(editing.slug, isNew ? (v) => setEditing({ ...editing, slug: v }) : () => {}, t('nameHint')),
            )}
            {!isNew && <input type="hidden" value={editing.slug} readOnly />}
            {field(t('remark'), input(editing.remark, (v) => setEditing({ ...editing, remark: v }), t('remarkHint')))}
            {field(t('serverUrl'), input(editing.url, (v) => setEditing({ ...editing, url: v }), t('serverUrlPlaceholder')))}

            {field(
              t('authType'),
              <select
                className="onedev-input"
                value={editing.authType}
                onChange={(e) => setEditing({ ...editing, authType: e.target.value as 'token' | 'password' })}
              >
                <option value="password">{t('passwordAuth')}</option>
                <option value="token">{t('tokenAuth')}</option>
              </select>,
            )}

            {editing.authType === 'password' ? (
              <>
                {field(t('username'), input(editing.username, (v) => setEditing({ ...editing, username: v })))}
                {field(t('password'), input(editing.password, (v) => setEditing({ ...editing, password: v }), editing.passwordSet ? t('storedSecretHint') : '••••••••', 'password'))}
              </>
            ) : (
              field(t('token'), input(editing.token, (v) => setEditing({ ...editing, token: v }), editing.tokenSet ? t('storedSecretHint') : 'one-dev-access-token', 'password'))
            )}

            <div className="onedev-grid">
              {field(t('apiBase'), input(editing.apiBase, (v) => setEditing({ ...editing, apiBase: v }), '/~api'))}
              {field(t('apiTimeoutMs'), input(String(editing.apiTimeoutMs) || '30000', (v) => setEditing({ ...editing, apiTimeoutMs: Number(v) || 30000 }), '30000'))}
            </div>

            {field(
              t('extraHeaders'),
              <input type="text" className="onedev-input" value={editing.extraHeaders} placeholder={t('extraHeadersHint')} onChange={(e) => setEditing({ ...editing, extraHeaders: e.target.value })} />,
            )}

            <label className="onedev-check">
              <input type="checkbox" checked={editing.readonly} onChange={(e) => setEditing({ ...editing, readonly: e.target.checked })} />
              <span>{t('readonly')}</span>
            </label>
          </div>

          <div className="onedev-actions">
            <button type="button" className="onedev-btn" disabled={busy} onClick={() => void save()}>
              {busy ? t('saving') : t('save')}
            </button>
            <button type="button" className="onedev-btn-secondary" disabled={busy} onClick={() => void test()}>
              {busy ? t('testing') : t('test')}
            </button>
            {editingExisting && (
              <button
                type="button"
                className="onedev-btn-secondary"
                disabled={busy || primary === editing.slug || envs.length === 1}
                onClick={() => void setPrimaryEnv()}
              >
                {t('setPrimary')}
              </button>
            )}
            {editingExisting && (
              <button type="button" className="onedev-btn-danger" disabled={busy} onClick={() => void removeEnv()}>
                {t('delete')}
              </button>
            )}
            <button type="button" className="onedev-link" onClick={open}>
              {t('open')} ↗
            </button>
            <button type="button" className="onedev-link" disabled={busy} onClick={backToList}>
              ← {t('back')}
            </button>
          </div>

          {status.kind === 'error' && <p className="onedev-error">{status.text}</p>}
          {status.kind === 'success' && <p className="onedev-saved">{status.text}</p>}
          {(editing.passwordSet || editing.tokenSet) && status.kind !== 'success' && (
            <p className="onedev-hint">{t('storedLoaded')}</p>
          )}
          <p className="onedev-hint">{t('applyNote')}</p>
        </>
      )}
    </div>
  )
}