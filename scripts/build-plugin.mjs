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
import { existsSync, mkdirSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
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
  // The DSH web assembles dynamic plugin bundles by calling the module-loader
  // handoff; the factory receives the injected `require` (loader module table)
  // and returns the package's exports. The intro declares the CJS bindings the
  // bundled body references.
  banner: { js: 'window.__ModuleLoader__.load({ id: "dsh-onedev", factory: (require) => {\nvar module = { exports: {} }; var exports = module.exports;' },
  footer: { js: 'return module.exports; } });' },
  logLevel: 'info',
})

console.log('plugin build complete: lib/index.js (host), lib/client.js (client)')