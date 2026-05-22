import { app, BrowserWindow, shell, ipcMain, protocol, IpcMainInvokeEvent } from 'electron'
import { join, resolve } from 'path'
import { existsSync, mkdirSync } from 'fs'
import windowStateKeeper from 'electron-window-state'
import { registerVaultIPC } from './ipc/vault'
import { registerWindowIPC } from './ipc/window'
import { registerTerminalIPC } from './ipc/terminal'
import { registerAppIPC } from './ipc/app'
import { registerMcpIPC } from './ipc/mcp'
import { registerUpdaterIPC } from './ipc/updater'
import { registerAiIPC } from './ipc/ai'
import { registry } from './ai/registry'
import { LocalLLMProvider } from './ai/providers/local'
import { GeminiProvider } from './ai/providers/gemini'
import { GroqProvider } from './ai/providers/groq'
import { registerIndexIPC } from './ipc/index'
import { registerSearchIPC } from './ipc/search'
import { registerSummaryIPC } from './ipc/summary'
import { mcpServerManager } from './mcp/server'
import { buildIndex } from './mcp/search-index'
import { initDb, closeDb } from './blocks/db'
import { startIndexing } from './blocks/indexer'
import { startWatcher, stopWatcher } from './watcher'
import { store } from './store'
import { initAutoUpdater } from './updater'
import { createTray, destroyTray } from './tray'

let mainWindow: BrowserWindow | null = null
let previewWindow: BrowserWindow | null = null
let pendingOpenPath: string | null = null

const isDev = !app.isPackaged

// ── GPU / compositing flags ───────────────────────────────────────────────────
// backdrop-filter silently fails in packaged Electron on Windows without these.
// Must be set before app.whenReady().
//
// CSSBackdropFilter   – enables the CSS property in all Chromium contexts
// UseSkiaRenderer     – forces Skia (GPU) renderer; SW renderer drops backdrop-filter silently
// ignore-gpu-blocklist – allows GPU acceleration even when the driver is blocklisted
// enable-gpu-rasterization – forces GPU tile rasterization (required for backdrop-filter)
app.commandLine.appendSwitch('enable-features', 'CSSBackdropFilter,UseSkiaRenderer')
app.commandLine.appendSwitch('ignore-gpu-blocklist')
app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-accelerated-compositing')
app.commandLine.appendSwitch('use-angle', 'd3d11')  // force Direct3D 11 on Windows

// ── vault:// custom protocol ─────────────────────────────────────────────────
// Must be registered before app.whenReady so Electron knows it's privileged.
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vault',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
])

// Flag set when the user explicitly chooses "Quit Marrow"
// (as opposed to just closing the window, which hides to tray)
;(app as typeof app & { isQuitting: boolean }).isQuitting = false

// ── Single instance lock ────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()

if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    // Forward the .md path from the second instance to the existing window.
    // When a file arg is present, do NOT auto-show the main window — the renderer
    // will call app:showWindow for vault files, or open a preview window for external
    // files (in which case the main window should stay hidden/minimized).
    const mdArg = argv.find(a => a.endsWith('.md') && existsSync(a))
    if (mainWindow) {
      if (mdArg) {
        // Don't show main window — renderer decides:
        // vault file → showWindow(), external file → preview.open() + window.close()
        mainWindow.webContents.send('file:open', mdArg)
      } else {
        // No file — user just re-launched the app; bring it forward
        if (mainWindow.isMinimized()) mainWindow.restore()
        if (!mainWindow.isVisible()) mainWindow.show()
        mainWindow.focus()
      }
    }
  })
}

// ── macOS: open-file event ──────────────────────────────────────────────────

app.on('open-file', (event, filePath) => {
  event.preventDefault()
  if (mainWindow) {
    mainWindow.webContents.send('file:open', filePath)
    // Don't show main window — renderer decides
  } else {
    pendingOpenPath = filePath
  }
})

// ── Window creation ─────────────────────────────────────────────────────────

// Per-theme --bg-chrome color, used as the window backgroundColor so there is
// no flash-of-wrong-color before the renderer paints. Legacy dark/light values
// are kept so users upgrading from the old binary theme setting still match.
const THEME_BG: Record<string, string> = {
  midnight: '#131313',
  slate: '#0e1116',
  dim: '#1c1f24',
  paper: '#fafafa',
  cream: '#f5f1ea',
  dark: '#131313',
  light: '#fafafa',
}

function createWindow() {
  const winState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 800,
  })

  mainWindow = new BrowserWindow({
    x: winState.x,
    y: winState.y,
    width: winState.width,
    height: winState.height,
    minWidth: 720,
    minHeight: 500,
    frame: false,
    // transparent: true is intentionally REMOVED.
    // On Windows, transparent windows use a compositor mode that silently
    // disables backdrop-filter — no GPU flag can fix this.
    // Windows 11 DWM rounds frameless window corners natively.
    // CSS border-radius + overflow:hidden handles older systems.
    // Match saved theme to avoid flash-of-wrong-color on startup
    backgroundColor: THEME_BG[(store.get('theme') as string | undefined) ?? 'midnight'] ?? '#131313',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      experimentalFeatures: true,
      devTools: true,
    },
    show: false,
  })

  winState.manage(mainWindow)

  // ── vault:// protocol handler ───────────────────────────────────────
  // Serves vault-relative paths as local files so images load correctly
  // even when the renderer is on http://localhost (dev mode).
  mainWindow.webContents.session.protocol.registerFileProtocol('vault', (request, callback) => {
    const vaultPath = store.get('vaultPath') as string | undefined
    if (!vaultPath) { callback({ error: -6 }); return }
    const url = decodeURIComponent(request.url.replace(/^vault:\/\//, ''))
    const abs  = resolve(vaultPath, url)
    if (!abs.startsWith(resolve(vaultPath))) { callback({ error: -6 }); return }
    callback({ path: abs })
  })

  // ── Close → hide to tray (unless explicitly quitting) ──────────────────
  mainWindow.on('close', (e) => {
    const typed = app as typeof app & { isQuitting: boolean }
    if (!typed.isQuitting) {
      e.preventDefault()
      mainWindow!.hide()
    }
  })

  mainWindow.once('ready-to-show', () => {
    // If launched via file association, don't show yet —
    // the renderer will call showWindow() for vault files
    // or hide via window.close() after opening preview for external files.
    if (!pendingOpenPath) {
      mainWindow!.show()
    }

    // System tray
    createTray(mainWindow!)

    // Send pending path (macOS startup open-file or Windows argv)
    if (pendingOpenPath) {
      mainWindow!.webContents.send('file:open', pendingOpenPath)
      pendingOpenPath = null
    }

    // Auto-updater (production only)
    initAutoUpdater(mainWindow!)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
  } else {
    mainWindow.loadFile(join(__dirname, '../dist/index.html'))
  }
}

// ── IPC registration ─────────────────────────────────────────────────────────

registerVaultIPC()
registerWindowIPC()
registerTerminalIPC()
registerAppIPC()
registerMcpIPC()
registerUpdaterIPC()
registerAiIPC()
registerIndexIPC()
registerSearchIPC()
registerSummaryIPC()

// ── LLM provider registry ─────────────────────────────────────────────────────
// All AI features route through registry.getActive(); the saved active id is
// restored inside the registry constructor.
registry.register(new LocalLLMProvider())
registry.register(new GeminiProvider())
registry.register(new GroqProvider())

// ── Per-sender window helpers ────────────────────────────────────────────────
// Using BrowserWindow.fromWebContents(event.sender) lets minimize/maximize/close
// work correctly for both the main window and the preview window.

ipcMain.handle('window:minimize', (event: IpcMainInvokeEvent) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize()
})
ipcMain.handle('window:maximize', (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return
  if (win.isMaximized()) win.unmaximize()
  else win.maximize()
})
// Main window hides to tray; any other window (e.g. preview) actually closes.
ipcMain.handle('window:close', (event: IpcMainInvokeEvent) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win === mainWindow) mainWindow?.hide()
  else win?.destroy()
})
ipcMain.handle('window:isMaximized', (event: IpcMainInvokeEvent) =>
  BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
)

// ── Zoom controls ────────────────────────────────────────────────────────────
const ZOOM_MIN = -2
const ZOOM_MAX = 3

function clampZoom(wc: Electron.WebContents, delta: number) {
  const current = wc.getZoomLevel()
  const next = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, current + delta))
  wc.setZoomLevel(next)
}

ipcMain.handle('zoom:in', (event: IpcMainInvokeEvent) => {
  clampZoom(event.sender, 1)
})
ipcMain.handle('zoom:out', (event: IpcMainInvokeEvent) => {
  clampZoom(event.sender, -1)
})
ipcMain.handle('zoom:reset', (event: IpcMainInvokeEvent) => {
  event.sender.setZoomLevel(0)
})

// ── Preview window ────────────────────────────────────────────────────────────

ipcMain.handle('preview:open', async (_event, { filePath, content }: { filePath: string; content: string }) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.webContents.send('preview:load', { filePath, content })
    if (!previewWindow.isVisible()) previewWindow.show()
    previewWindow.focus()
    return
  }

  previewWindow = new BrowserWindow({
    width: 860,
    height: 680,
    minWidth: 480,
    minHeight: 380,
    frame: false,
    backgroundColor: '#131313',
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  })

  previewWindow.once('ready-to-show', () => {
    previewWindow!.show()
    previewWindow!.webContents.send('preview:load', { filePath, content })
  })

  previewWindow.on('closed', () => { previewWindow = null })

  if (isDev) {
    await previewWindow.loadURL('http://localhost:5173?preview=1')
  } else {
    await previewWindow.loadFile(join(__dirname, '../dist/index.html'), {
      query: { preview: '1' },
    })
  }
})

ipcMain.handle('preview:close', (_event) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.destroy()
    previewWindow = null
  }
})

ipcMain.handle('preview:openInMain', (_event, filePath: string) => {
  if (previewWindow && !previewWindow.isDestroyed()) {
    previewWindow.destroy()
    previewWindow = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    mainWindow.webContents.send('file:open', filePath)
  }
})

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  // Windows: check if opened with a .md file path
  const mdArg = process.argv.find(a => a.endsWith('.md') && existsSync(a))
  if (mdArg) pendingOpenPath = mdArg

  createWindow()

  // ── First-run: create default vault in Documents\Monomark if none set ────
  let existingVault = store.get('vaultPath') as string | undefined
  if (!existingVault) {
    const defaultVault = join(app.getPath('documents'), 'Monomark')
    try {
      mkdirSync(defaultVault, { recursive: true })
      store.set('vaultPath', defaultVault)
      existingVault = defaultVault
      console.log('[main] Created default vault at', defaultVault)
    } catch (e) {
      console.error('[main] Could not create default vault:', e)
    }
  }

  if (existingVault) {
    startWatcher(existingVault)
    buildIndex(existingVault).catch(e =>
      console.error('[main] Search index build failed:', e)
    )

    // Embeddings index (Phase 2) — runs in the background, never blocks the UI.
    initDb(existingVault)
      .then(() => startIndexing(existingVault))
      .catch(e => console.error('[main] Embeddings index failed:', e))
  }

  // Auto-start MCP if it was enabled on last run
  if (store.get('mcpEnabled')) {
    mcpServerManager.start().catch(e =>
      console.error('[main] MCP auto-start failed:', e)
    )
  }

  // macOS: clicking dock icon re-shows the window
  app.on('activate', () => {
    if (mainWindow && !mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  // On macOS let the tray keep the app alive; on Windows/Linux same.
  // We never reach here normally because close is intercepted above.
  // Only reached if window was destroyed programmatically.
  if (process.platform !== 'darwin') {
    const typed = app as typeof app & { isQuitting: boolean }
    if (typed.isQuitting) app.quit()
  }
})

app.on('before-quit', () => {
  // Set flag so the 'close' handler lets the window actually close
  // instead of hiding to tray. Covers app.quit() calls and OS quit signals.
  ;(app as typeof app & { isQuitting: boolean }).isQuitting = true
  stopWatcher()
  closeDb()
  destroyTray()
})
