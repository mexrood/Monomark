// Bundle the sidecar into a single JS file with esbuild.
// Aliases `electron` and `../store` to our shims.

import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { cpSync, mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))

await build({
  entryPoints: [resolve(__dirname, 'index.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: resolve(__dirname, '..', 'binaries', 'sidecar.js'),
  external: [
    // Native modules that can't be bundled
    'sql.js',
    '@xenova/transformers',
    'node-llama-cpp',
  ],
  alias: {
    'electron': resolve(__dirname, 'electron-shim.ts'),
    'electron-store': resolve(__dirname, 'store-shim.ts'),
  },
  // The MCP tools import `../store` which resolves to sidecar-core/store.ts.
  // We override it via a plugin since esbuild `alias` only handles bare specifiers.
  plugins: [{
    name: 'store-redirect',
    setup(build) {
      // Redirect any import of sidecar-core/store.ts to our shim
      build.onResolve({ filter: /[\\/]sidecar-core[\\/]store(\.ts)?$/ }, () => ({
        path: resolve(__dirname, 'store-shim.ts'),
      }))
    },
  }],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
})

// Copy sql.js + WASM into binaries/node_modules/sql.js/ so createRequire
// can find them in production (where global node_modules doesn't exist).
const sqlDest = resolve(__dirname, '..', 'binaries', 'node_modules', 'sql.js', 'dist')
const sqlSrc = resolve(__dirname, '..', '..', 'node_modules', 'sql.js')
mkdirSync(sqlDest, { recursive: true })
cpSync(resolve(sqlSrc, 'dist', 'sql-wasm.js'), resolve(sqlDest, 'sql-wasm.js'))
cpSync(resolve(sqlSrc, 'dist', 'sql-wasm.wasm'), resolve(sqlDest, 'sql-wasm.wasm'))
cpSync(resolve(sqlSrc, 'package.json'), resolve(sqlDest, '..', 'package.json'))
console.log('Copied sql.js + WASM to binaries/node_modules/sql.js/')
