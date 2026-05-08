import { autoUpdater } from 'electron-updater'
import { app, BrowserWindow, dialog } from 'electron'
import log from 'electron-log/main'

export function initAutoUpdater(mainWindow: BrowserWindow) {
  // Only run in production
  if (!app.isPackaged) return

  // Persistent logging — file at %APPDATA%\Monomark\logs\main.log
  log.initialize()
  log.transports.file.level = 'info'
  autoUpdater.logger = log

  log.info('[updater] init — version:', app.getVersion())
  log.info('[updater] feed URL will be derived from app-update.yml')
  log.info('[updater] GH_TOKEN present:', Boolean(process.env.GH_TOKEN))
  if (process.env.GH_TOKEN) {
    log.info('[updater] GH_TOKEN prefix:', process.env.GH_TOKEN.slice(0, 8) + '...')
  }

  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('checking-for-update', () => {
    log.info('[updater] Checking for updates...')
  })

  autoUpdater.on('update-available', info => {
    log.info('[updater] Update available:', info.version)
    mainWindow.webContents.send('updater:update-available', info.version)
  })

  autoUpdater.on('update-not-available', info => {
    log.info('[updater] Up to date. Latest:', info.version)
  })

  autoUpdater.on('download-progress', p => {
    log.info(`[updater] Download: ${Math.round(p.percent)}% (${p.transferred}/${p.total})`)
  })

  autoUpdater.on('update-downloaded', info => {
    log.info('[updater] Update downloaded:', info.version)
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
    log.error('[updater] Error:', err.message, err.stack)
  })

  // Check on startup, then every 4 hours
  log.info('[updater] First check on startup...')
  autoUpdater.checkForUpdatesAndNotify().catch(err => {
    log.error('[updater] Initial check failed:', err.message)
  })
  setInterval(() => {
    log.info('[updater] Periodic check...')
    autoUpdater.checkForUpdatesAndNotify().catch(err => {
      log.error('[updater] Periodic check failed:', err.message)
    })
  }, 4 * 60 * 60 * 1000)
}
