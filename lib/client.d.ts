/**
 * Type declarations for the dsh-onedev Client half (built by scripts/build-plugin.mjs).
 * The runtime artifact is `lib/client.js`; this hand-maintained surface mirrors the
 * exported chronical browser plugin shape.
 */

/** Plugin identity registered into the DSH Loader. */
export declare const name: string

/** Required cordis services. */
export declare const inject: readonly string[]

/** Register the OneDev settings.section entry. */
export declare function apply(ctx: import('@deepseek-ai/cordis').Context): void