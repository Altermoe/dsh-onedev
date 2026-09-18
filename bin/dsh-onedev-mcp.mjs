#!/usr/bin/env node
/**
 * dsh-onedev-mcp launcher.
 *
 * Resolves to the compiled CLI (dist/cli.js) built by `npm run build`.
 * For development use `npm run dev` (tsx) instead.
 */
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { main } = require('../dist/cli.js')

main(process.argv.slice(2)).catch((err) => {
  console.error(`[dsh-onedev-mcp] fatal: ${(err && err.stack) || err}`)
  process.exit(1)
})