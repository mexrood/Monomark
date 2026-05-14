import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, Notification } from 'electron'
import log from 'electron-log/main'

/**
 * State machine for the auto-updater. Both the tray menu and the Settings
 * About panel subscribe via onUpdateState() and rebuild themselves on each
 * transition. All transitions are explicit — autoDownload is disabled, so the
 * user must press "Download" to move from 'available' → 'downloading', and
 * "Install and restart" to move from 'downloaded' → 'installing'.
 */
export type UpdateState =
  | { status: 'idle'; lastChecked?: number }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string; lastChecked: number }
  | { status: 'available'; version: string; releaseNotes: string; releaseDate: string }
  | { status: 'downloading'; version: string; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string }
  | { status: 'installing' }
  | { status: 'error'; message: string }

let currentState: UpdateState = { status: 'idle' }
const stateListeners: Array<(s: UpdateState) => void> = []

function setState(s: UpdateState) {
  currentState = s
  log.info('[updater] state ->', s.status, JSON.stringify(s))
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
 * Start downloading the available update. No-op if not in 'available' state.
 */
export async function downloadUpdate(): Promise<void> {
  if (currentState.status !== 'available') {
    log.warn('[updater] downloadUpdate called but state is', currentState.status)
    return
  }
  const { version } = currentState
  setState({
    status: 'downloading',
    version,
    percent: 0,
    transferred: 0,
    total: 0,
    bytesPerSecond: 0,
  })
  try {
    await autoUpdater.downloadUpdate()
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
  log.info('[updater] User triggered install — calling quitAndInstall(true, true)')
  setState({ status: 'installing' })
  // quitAndInstall(isSilent, isForceRunAfter)
  //   isSilent: true → NSIS runs without showing the installer UI.
  //   isForceRunAfter: true → installer auto-launches Monomark after the upgrade.
  // For NSIS per-user installs (perMachine: false) this avoids UAC.
  autoUpdater.quitAndInstall(true, true)
}

function notify(title: string, body: string): void {
  if (!Notification.isSupported()) return
  try {
    new Notification({ title, body }).show()
  } catch (e) {
    log.error('[updater] notification error', e)
  }
}

function stringifyReleaseNotes(notes: unknown): string {
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map(n => (typeof n === 'string' ? n : (n && typeof n === 'object' && 'note' in n ? String((n as { note: unknown }).note ?? '') : '')))
      .filter(Boolean)
      .join('\n\n')
  }
  return ''
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

  // Spec: user decides when to download and when to install.
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking' })
  })

  autoUpdater.on('update-available', info => {
    log.info('[updater] Update available:', info.version)
    setState({
      status: 'available',
      version: info.version,
      releaseNotes: stringifyReleaseNotes(info.releaseNotes),
      releaseDate: info.releaseDate ?? '',
    })
  })

  autoUpdater.on('update-not-available', info => {
    log.info('[updater] Up to date. Latest:', info.version)
    setState({ status: 'up-to-date', version: info.version, lastChecked: Date.now() })
  })

  autoUpdater.on('download-progress', p => {
    const version = currentState.status === 'downloading'
      ? currentState.version
      : '?'
    setState({
      status: 'downloading',
      version,
      percent: Math.round(p.percent),
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond,
    })
  })

  autoUpdater.on('update-downloaded', info => {
    log.info('[updater] Update downloaded:', info.version)
    setState({ status: 'downloaded', version: info.version })
    // OS notification — inline UI in Settings + tray show the action button.
    notify('Monomark update ready', `Version ${info.version} is ready to install`)
  })

  autoUpdater.on('error', err => {
    log.error('[updater] Error:', err.message, err.stack)
    setState({ status: 'error', message: err.message })
  })

  // Forward state changes to the renderer so the Settings panel can update.
  // Tray subscribes separately in tray.ts.
  onUpdateState(s => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:state', s)
    }
  })

  // First check 5 seconds after startup (let the renderer load first),
  // then every 4 hours.
  setTimeout(() => {
    log.info('[updater] First check on startup...')
    void checkForUpdates()
  }, 5000)
  setInterval(() => {
    log.info('[updater] Periodic check...')
    void checkForUpdates()
  }, 4 * 60 * 60 * 1000)
}
