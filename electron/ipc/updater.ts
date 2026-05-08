import { ipcMain } from 'electron'
import { checkForUpdates, installUpdateNow, getUpdateState } from '../updater'

export function registerUpdaterIPC() {
  ipcMain.handle('updater:check', async () => {
    await checkForUpdates()
    return getUpdateState()
  })

  ipcMain.handle('updater:install', () => {
    installUpdateNow()
  })

  ipcMain.handle('updater:getState', () => getUpdateState())
}
