import { ipcMain } from 'electron'
import { checkForUpdates, downloadUpdate, installUpdateNow, getUpdateState } from '../updater'

export function registerUpdaterIPC() {
  ipcMain.handle('updater:check', async () => {
    await checkForUpdates()
    return getUpdateState()
  })

  ipcMain.handle('updater:download', async () => {
    await downloadUpdate()
    return getUpdateState()
  })

  ipcMain.handle('updater:install', () => {
    installUpdateNow()
  })

  ipcMain.handle('updater:getState', () => getUpdateState())
}
