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

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPreview ? <PreviewApp /> : <App />}
  </React.StrictMode>
)
