import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'
import log from 'electron-log/main'

/**
 * State machine for the auto-updater. Both the tray menu and the Settings
 * About panel subscribe via onUpdateState() and rebuild themselves on each
 * transition. Manual triggers go through checkForUpdates() / installUpdateNow().
 */
export type UpdateState =
  | { status: 'idle' }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'downloaded'; version: string }
  | { status: 'error'; message: string }

let currentState: UpdateState = { status: 'idle' }
const stateListeners: Array<(s: UpdateState) => void> = []

function setState(s: UpdateState) {
  currentState = s
  log.info('[updater] state ->', s.status, 'status' in s ? '' : '', JSON.stringify(s))
  for (const cb of stateListeners) {
    try { cb(s) } catch (e) { log.error('[updater] listener error', e) }
  }
}

export function getUpdateState(): UpdateState {
  return currentState
}

export function onUpdateState(cb: (s: UpdateState) => void): () => void {
  stateListeners.push(cb)
  return () => {
    const i = stateListeners.indexOf(cb)
    if (i >= 0) stateListeners.splice(i, 1)
  }
}

/**
 * Manually trigger an update check. Idempotent — does nothing if a check
 * or download is already in flight. Safe to call from tray / Settings.
 */
export async function checkForUpdates(): Promise<void> {
  if (!app.isPackaged) {
    setState({ status: 'error', message: 'Updates are only available in packaged builds (npm run build:x64).' })
    return
  }
  if (currentState.status === 'checking' || currentState.status === 'downloading') {
    log.info('[updater] check skipped — already in progress')
    return
  }
  setState({ status: 'checking' })
  try {
    await autoUpdater.checkForUpdates()
  } catch (err: any) {
    setState({ status: 'error', message: err?.message || String(err) })
  }
}

/**
 * Install the pending update and restart. No-op if no update is downloaded.
 */
export function installUpdateNow(): void {
  if (currentState.status !== 'downloaded') {
    log.warn('[updater] installUpdateNow called but state is', currentState.status)
    return
  }
  log.info('[updater] User triggered install — calling quitAndInstall')
  autoUpdater.quitAndInstall()
}

export function initAutoUpdater(mainWindow: BrowserWindow) {
  if (!app.isPackaged) {
    log.info('[updater] dev mode — auto-updater disabled')
    return
  }

  log.initialize()
  log.transports.file.level = 'info'
  autoUpdater.logger = log

  log.info('[updater] init — version:', app.getVersion())
  log.info('[updater] GH_TOKEN present:', Boolean(process.env.GH_TOKEN))
  if (process.env.GH_TOKEN) {
    log.info('[updater] GH_TOKEN prefix:', process.env.GH_TOKEN.slice(0, 8) + '...')
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking' })
  })

  autoUpdater.on('update-available', info => {
    log.info('[updater] Update available:', info.version)
    setState({ status: 'available', version: info.version })
  })

  autoUpdater.on('update-not-available', info => {
    log.info('[updater] Up to date. Latest:', info.version)
    setState({ status: 'up-to-date', version: info.version })
  })

  autoUpdater.on('download-progress', p => {
    const version = currentState.status === 'available' || currentState.status === 'downloading'
      ? (currentState as any).version
      : '?'
    setState({
      status: 'downloading',
      version,
      percent: Math.round(p.percent),
    })
  })

  autoUpdater.on('update-downloaded', info => {
    log.info('[updater] Update downloaded:', info.version)
    setState({ status: 'downloaded', version: info.version })
    // Show a dialog as ambient notification — but the user can also trigger
    // install manually via the tray menu or Settings button at any later time.
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `Monomark ${info.version} has been downloaded.`,
      detail: 'The update will be installed when you quit the app, or you can restart now.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) installUpdateNow()
    })
  })

  autoUpdater.on('error', err => {
    log.error('[updater] Error:', err.message, err.stack)
    setState({ status: 'error', message: err.message })
  })

  // Forward state changes to the renderer so the Settings panel can update.
  // Tray subscribes separately in main.ts.
  onUpdateState(s => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:state', s)
    }
  })

  // First check on startup, then every 4 hours
  log.info('[updater] First check on startup...')
  checkForUpdates()
  setInterval(() => {
    log.info('[updater] Periodic check...')
    checkForUpdates()
  }, 4 * 60 * 60 * 1000)
}
