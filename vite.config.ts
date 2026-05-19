import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import { resolve } from 'path'

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
              // node-llama-cpp is ESM-only with native .node binaries — it must
              // stay external. engine.ts reaches it via a dynamic import() so
              // rollup keeps it as a real import() the CJS bundle can resolve.
              external: ['electron', 'node-llama-cpp'],
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
              external: ['electron'],
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
              external: ['electron', 'node-llama-cpp'],
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
