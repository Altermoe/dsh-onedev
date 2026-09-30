/**
 * dsh-onedev — DeepSeek Harness plugin, Client half (browser).
 *
 * Registers the "OneDev" first-level settings section. Its form configures the
 * administrator account / access token plus the direct-connection pass-through
 * options through the Host half's loopback surface `/api/onedev/config`, and
 * offers a quick entry that opens the configured OneDev web UI.
 *
 * The stylesheet is injected once here (the bundle is esbuild-built, so it is
 * not a CSS module); `onedev.css` uses the shared `--dsw-*` tokens so the card
 * matches the dsh theme. The bundle externalizes the baseline client modules;
 * `slots` and `locale` arrive as injected cordis services (never imported at
 * module scope).
 */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
// Type-only: pulls the `ctx.slots` service onto the client Context.
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import { OneDevSection } from './OneDevSection.tsx'
import type { OneDevSectionProps } from './OneDevSection.tsx'
import onedevCss from './onedev.css'
import { EN, ZH } from './locales.ts'

/** Dictionary namespace owned by this plugin's section. */
const NS = 'settings.onedev'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** The OneDev connection settings section copy. */
    'settings.onedev': keyof typeof ZH
  }
}

/** Plugin identity (the manifest package name, injected at build time). */
export const name = __DSH_ONEDEV_ID__

/** Required services. */
export const inject = ['slots', 'locale'] as const

/**
 * Inject the tokenized stylesheet once, guarded against a duplicate tag. The
 * tag is pre-tagged with `data-plugin` so the client module system's
 * materialization-time `claimStyles` sweep neither steals it for a later
 * plugin nor leaves it behind on this plugin's disposal.
 */
function injectStyles(css: string): void {
  if (typeof document === 'undefined') return
  if (document.head.querySelector('style[data-dsh-onedev="true"]') !== null) return
  const tag = document.createElement('style')
  tag.setAttribute('data-dsh-onedev', 'true')
  tag.setAttribute('data-plugin', __DSH_ONEDEV_ID__)
  tag.textContent = css
  document.head.appendChild(tag)
}

/**
 * Register the OneDev section once the `settings.section` declaration is on the
 * ledger.
 * @param ctx - client root context.
 */
export function apply(ctx: ClientContext): void {
  injectStyles(onedevCss)
  ctx.effect(() => ctx.locale.register(NS, { zh: ZH, en: EN }), 'dsh-onedev: dictionaries')
  const t = (): OneDevSectionProps['t'] => ctx.locale.bind(NS) as OneDevSectionProps['t']
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'onedev',
    order: 120,
    label: () => t()('nav'),
    locale: NS,
    // The composed `settings.section` props include framework seats the section
    // does not consume; the register contract is satisfied at runtime and the
    // bundle type-checks independently of the full SlotMap composition.
  }, OneDevSection as never))
}