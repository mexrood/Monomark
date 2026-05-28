import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { PreviewApp } from './PreviewApp'
import { installTauriStub } from './lib/tauri-stub'
import './globals.css'
import './styles/prose.css'
import './styles/code-theme.css'

installTauriStub()

const isPreview = new URLSearchParams(window.location.search).has('preview')

// In main window: listen for "open file" requests from preview window (Tauri events)
if (!isPreview && '__TAURI_INTERNALS__' in window) {
  import('@tauri-apps/api/event').then(({ listen }) => {
    listen<string>('vault:open-file', (e) => {
      // Dynamically import to avoid circular deps at module level
      import('./store/useVaultStore').then(({ useVaultStore }) => {
        useVaultStore.getState().openDocument(e.payload)
      })
    })
  })
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPreview ? <PreviewApp /> : <App />}
  </React.StrictMode>
)
