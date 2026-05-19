import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

// Native / heavy modules must stay external — they cannot be bundled by rollup
// (.node addons, .wasm glue, ESM-only packages reached via dynamic import())
// and are require()'d / import()'d at runtime instead.
const electronExternals = ['electron', 'sql.js', '@xenova/transformers', 'node-llama-cpp']

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
        // Local-AI worker thread — node-llama-cpp runs here, off the main loop.
        entry: 'electron/ai/llama-worker.ts',
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
