import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const isTauri = !!process.env.TAURI_ENV_PLATFORM

// Native / heavy modules must stay external — they cannot be bundled by rollup
// (.node addons, .wasm glue, ESM-only packages reached via dynamic import())
// and are require()'d / import()'d at runtime instead.
const electronExternals = ['electron', 'sql.js', '@xenova/transformers', 'node-llama-cpp']

export default defineConfig(async () => {
  const plugins = [react()]

  if (!isTauri) {
    const electron = (await import('vite-plugin-electron')).default
    const renderer = (await import('vite-plugin-electron-renderer')).default
    plugins.push(
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
          onstart(options: { reload: () => void }) {
            options.reload()
          },
        },
        {
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
    )
  }

  return {
    build: {
      sourcemap: false,
      minify: 'esbuild',
      target: 'esnext',
      cssTarget: 'chrome120',
    },
    plugins,
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
      },
    },
  }
})
