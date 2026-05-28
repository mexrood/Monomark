// Bundle the sidecar into a single JS file with esbuild.
// Aliases `electron` and `../store` to our shims.

import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

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
  // The MCP tools import `../store` which resolves to electron/store.ts.
  // We override it via a plugin since esbuild `alias` only handles bare specifiers.
  plugins: [{
    name: 'store-redirect',
    setup(build) {
      // Redirect any import of electron/store.ts to our shim
      build.onResolve({ filter: /[\\/]electron[\\/]store(\.ts)?$/ }, () => ({
        path: resolve(__dirname, 'store-shim.ts'),
      }))
    },
  }],
  sourcemap: false,
  minify: false,
  logLevel: 'info',
})
