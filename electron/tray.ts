import { app, BrowserWindow, Menu, Tray, nativeImage } from 'electron'
import { join } from 'path'

let tray: Tray | null = null

/**
 * Resolve the tray icon path.
 * In development: source is in build/ next to the project root.
 * In production: icon is copied to resources/ via extraResources in electron-builder.yml.
 */
function makeTrayIcon() {
  const isDev = !app.isPackaged
  const iconFile = process.platform === 'win32' ? 'tray.ico' : 'tray.png'
  const iconPath = isDev
    ? join(__dirname, '../build', process.platform === 'win32' ? 'icon.ico' : 'icons/32x32.png')
    : join(process.resourcesPath, iconFile)

  const img = nativeImage.createFromPath(iconPath)
  return img.isEmpty() ? nativeImage.createEmpty() : img
}

export function createTray(mainWindow: BrowserWindow): Tray {
  tray = new Tray(makeTrayIcon())
  tray.setToolTip('Monomark')

  const rebuildMenu = () => {
    const visible = mainWindow.isVisible()
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
          // Rebuild so label flips
          rebuildMenu()
        },
      },
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

  // Rebuild menu when visibility changes so label stays accurate
  mainWindow.on('show', rebuildMenu)
  mainWindow.on('hide', rebuildMenu)

  return tray
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
