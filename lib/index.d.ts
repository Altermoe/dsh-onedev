/**
 * Type declarations for the dsh-onedev Host half (built by scripts/build-plugin.mjs).
 * The runtime artifact is `lib/index.js`; this hand-maintained surface mirrors
 * the exported cordis plugin shape for type-aware consumers.
 */

/** Plugin identity registered into the DSH Loader. */
export declare const name: string

/** Required cordis services. */
export declare const inject: readonly string[]

/** Optional plugin configuration. */
export interface PluginConfig {
  /** Override the credential-store path. */
  configFile?: string
}

/** Mount the dsh-onedev loopback config/probe routes. */
export declare function apply(
  ctx: import('@deepseek-ai/cordis').Context,
  config?: PluginConfig,
): void