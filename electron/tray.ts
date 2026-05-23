import { app, BrowserWindow, Menu, Tray, Notification, nativeImage, MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import { onUpdateState, getUpdateState, checkForUpdates, downloadUpdate, installUpdateNow, UpdateState } from './updater'

let tray: Tray | null = null
let unsubscribeUpdater: (() => void) | null = null

function makeTrayIcon() {
  const isDev = !app.isPackaged
  const iconFile = process.platform === 'win32' ? 'tray.ico' : 'tray.png'
  const iconPath = isDev
    ? join(__dirname, '../build', iconFile)
    : join(process.resourcesPath, iconFile)

  const img = nativeImage.createFromPath(iconPath)
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

function notifyUpToDate() {
  if (!Notification.isSupported()) return
  try {
    new Notification({
      title: 'Monomark',
      body: "You're on the latest version.",
    }).show()
  } catch { /* ignore */ }
}

/** Build the tray's "update" menu item based on the current updater state. */
function updateMenuItem(state: UpdateState): MenuItemConstructorOptions {
  switch (state.status) {
    case 'checking':
      return { label: 'Checking for updates...', enabled: false }
    case 'available':
      return {
        label: `Download v${state.version}`,
        click: () => { void downloadUpdate() },
      }
    case 'downloading':
      return { label: `Downloading v${state.version} (${state.percent}%)...`, enabled: false }
    case 'downloaded':
      return {
        label: `Install v${state.version} and restart`,
        click: () => installUpdateNow(),
      }
    case 'installing':
      return { label: 'Installing...', enabled: false }
    case 'error':
      return {
        label: 'Update check failed - Retry',
        click: () => { void checkForUpdates() },
      }
    case 'up-to-date':
    case 'idle':
    default:
      return {
        label: 'Check for updates',
        click: () => {
          const before = getUpdateState().status
          void checkForUpdates().then(() => {
            const after = getUpdateState()
            // Manual tray check with no update found → surface OS notification
            // (otherwise the tray menu just rebuilds silently).
            if (after.status === 'up-to-date' && before !== 'up-to-date') {
              notifyUpToDate()
            }
          })
        },
      }
  }
}

export function createTray(mainWindow: BrowserWindow): Tray {
  tray = new Tray(makeTrayIcon())
  tray.setToolTip('Monomark')

  const rebuildMenu = () => {
    const visible = mainWindow.isVisible()
    const state = getUpdateState()
    const menu = Menu.buildFromTemplate([
      {
        label: visible ? 'Hide Monomark' : 'Open Monomark',
        click: () => {
          if (mainWindow.isVisible()) {
            mainWindow.hide()
          } else {
            mainWindow.show()
            mainWindow.focus()
          }
          rebuildMenu()
        },
      },
      { type: 'separator' },
      updateMenuItem(state),
      { type: 'separator' },
      {
        label: 'Quit Monomark',
        click: () => {
          ;(app as typeof app & { isQuitting: boolean }).isQuitting = true
          app.quit()
        },
      },
    ])
    tray!.setContextMenu(menu)
  }

  rebuildMenu()

  // Double-click on tray icon → show/focus window
  tray.on('double-click', () => {
    if (!mainWindow.isVisible()) {
      mainWindow.show()
      mainWindow.focus()
    } else {
      mainWindow.focus()
    }
    rebuildMenu()
  })

  // Rebuild menu when window visibility OR updater state changes
  mainWindow.on('show', rebuildMenu)
  mainWindow.on('hide', rebuildMenu)
  unsubscribeUpdater = onUpdateState(rebuildMenu)

  return tray
}

export function destroyTray() {
  if (unsubscribeUpdater) {
    unsubscribeUpdater()
    unsubscribeUpdater = null
  }
  if (tray) {
    tray.destroy()
    tray = null
  }
}
