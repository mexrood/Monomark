import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

// Native / heavy modules must stay external — they cannot be bundled by rollup
// (.node addons, dynamic model loading) and are require()'d at runtime instead.
const electronExternals = ['electron', 'sql.js', '@xenova/transformers']

export default defineConfig({
  build: {
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext',
    cssTarget: 'chrome120',
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          build: {
            sourcemap: false,
            outDir: 'dist-electron',
            rollupOptions: {
              external: electronExternals,
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        vite: {
          build: {
            sourcemap: false,
            outDir: 'dist-electron',
            rollupOptions: {
              external: electronExternals,
            },
          },
        },
        onstart(options) {
          options.reload()
        },
      },
      {
        // Embedding worker thread — runs Transformers.js off the main thread.
        // Emitted as dist-electron/embedderWorker.js (see electron/blocks/embedder.ts).
        entry: 'electron/blocks/embedderWorker.ts',
        vite: {
          build: {
            sourcemap: false,
            outDir: 'dist-electron',
            rollupOptions: {
              external: electronExternals,
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
