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
              external: ['electron'],
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
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
})
