/**
 * Build the dsh plugin halves of dsh-onedev into `lib/`:
 *
 *   - lib/index.js   Host half  (cordis plugin: loopback config/probe routes)
 *   - lib/client.js  Client half (browser settings.section, module-loader form)
 *
 * Uses esbuild directly. The `.js`-to-`.ts` resolver lets the Host re-use the
 * MCP package's `src/*` modules (which use NodeNext `.js` specifiers) while
 * still being bundled to plain JS for plain-Node loading by the DSH Loader.
 */
import { build } from 'esbuild'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/**
 * Manifest package name. It is the client-module row id DSH discovers from
 * `dsh.client` (the Loader keys browser modules by the loader specifier), the
 * id the bundle registers into `window.__ModuleLoader__`, and the ownership
 * tag the module system uses for this plugin's `<style>`. Reading it here keeps
 * all three from drifting from `package.json`.
 */
const PACKAGE_NAME = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).name
if (typeof PACKAGE_NAME !== 'string' || PACKAGE_NAME === '') {
  throw new Error('build-plugin: package.json name must be a non-empty string')
}

const BASELINE = [
  'react', 'react/jsx-runtime', 'react-dom', 'react-dom/client', '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-store', '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

/** Resolve a NodeNext-style `./x.js` specifier to the physical `.ts*` source. */
const jsToTs = {
  name: 'dsh-onedev-js-to-ts',
  setup(b) {
    b.onResolve({ filter: new RegExp('^\\.\\.?/') }, (args) => {
      if (!args.path.endsWith('.js')) return null
      const fromJs = join(args.resolveDir, args.path)
      const base = fromJs.slice(0, -'.js'.length)
      for (const ext of ['.ts', '.tsx', '.mjs', '.mts']) {
        const candidate = base + ext
        if (existsSync(candidate)) return { path: candidate }
      }
      return null
    })
  },
}

mkdirSync(join(ROOT, 'lib'), { recursive: true })

// ---- Host half -------------------------------------------------------------
await build({
  entryPoints: [join(ROOT, 'plugin', 'src', 'host.ts')],
  outfile: join(ROOT, 'lib', 'index.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'es2022',
  external: ['@deepseek-ai/cordis'],
  plugins: [jsToTs],
  logLevel: 'info',
})

// ---- Client half (module-loader form) --------------------------------------
await build({
  entryPoints: [join(ROOT, 'plugin', 'src', 'client', 'index.ts')],
  outfile: join(ROOT, 'lib', 'client.js'),
  bundle: true,
  platform: 'browser',
  format: 'cjs',
  target: 'es2020',
  external: BASELINE,
  jsx: 'automatic',
  sourcemap: false,
  // The scoped stylesheet is bundled as text and injected once at apply (the
  // package builds outside the tsdown CSS-Modules pipeline, so `.css` is not a
  // module here).
  loader: { '.css': 'text' },
  // The plugin's own identity comes from the manifest (see PACKAGE_NAME).
  define: { __DSH_ONEDEV_ID__: JSON.stringify(PACKAGE_NAME) },
  // The DSH web assembles dynamic plugin bundles by calling the module-loader
  // handoff; the factory receives the injected `require` (loader module table)
  // and returns the package's exports. The intro declares the CJS bindings the
  // bundled body references.
  banner: { js: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_NAME)}, factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;` },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})

console.log('plugin build complete: lib/index.js (host), lib/client.js (client)')