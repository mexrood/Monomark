import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

// Tauri-only build. The Rust shell serves the Vite `dist/` output and the
// sidecar (MCP server) is bundled separately by `src-tauri/sidecar/build.mjs`.
export default defineConfig({
  build: {
    sourcemap: false,
    minify: 'esbuild',
    target: 'esnext',
    cssTarget: 'chrome120',
  },
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  // Vite dev server settings expected by Tauri (`devUrl: http://localhost:5173`)
  server: {
    port: 5173,
    strictPort: true,
  },
})
