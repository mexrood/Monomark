import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'

export function initAutoUpdater(mainWindow: BrowserWindow) {
  // Only run in production
  if (!app.isPackaged) return

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', info => {
    console.log(`[updater] Update available: ${info.version}`)
    mainWindow.webContents.send('updater:update-available', info.version)
  })

  autoUpdater.on('update-downloaded', info => {
    console.log(`[updater] Update downloaded: ${info.version}`)
    dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: 'Update ready',
      message: `Monomark ${info.version} has been downloaded.`,
      detail: 'The update will be installed when you quit the app, or you can restart now.',
      buttons: ['Restart now', 'Later'],
      defaultId: 0,
    }).then(({ response }) => {
      if (response === 0) autoUpdater.quitAndInstall()
    })
  })

  autoUpdater.on('error', err => {
    console.error('[updater] Error:', err.message)
  })

  // Check on startup, then every 4 hours
  autoUpdater.checkForUpdatesAndNotify()
  setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000)
}
