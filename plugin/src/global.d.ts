/**
 * Ambient declarations for the plugin's client build. `onedev.css` is bundled
 * as text (esbuild `loader: { '.css': 'text' }`) and injected at apply, so tsc
 * must see it as a string-default module.
 */
declare module '*.css' {
  const stylesheet: string
  export default stylesheet
}

/**
 * Package-name identity injected by `scripts/build-plugin.mjs` from
 * `package.json` (`name`). It must equal the client-module row id the Loader
 * discovers from this manifest, so deriving it at build time keeps the
 * registration id, the style ownership tag, and the manifest from drifting.
 */
declare const __DSH_ONEDEV_ID__: string