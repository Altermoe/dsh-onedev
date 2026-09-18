/**
 * Ambient declarations for the plugin's client build. `onedev.css` is bundled
 * as text (esbuild `loader: { '.css': 'text' }`) and injected at apply, so tsc
 * must see it as a string-default module.
 */
declare module '*.css' {
  const stylesheet: string
  export default stylesheet
}