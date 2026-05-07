import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { PreviewApp } from './PreviewApp'
import './globals.css'
import './styles/prose.css'
import './styles/code-theme.css'

const isPreview = new URLSearchParams(window.location.search).has('preview')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {isPreview ? <PreviewApp /> : <App />}
  </React.StrictMode>
)
