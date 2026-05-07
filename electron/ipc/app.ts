import { ipcMain, app, BrowserWindow } from 'electron'
import { getAutostartEnabled, setAutostartEnabled } from '../autostart'
import { store } from '../store'

export function registerAppIPC() {
  ipcMain.handle('app:setTheme', (_event, theme: 'dark' | 'light') => {
    store.set('theme', theme)
  })
  ipcMain.handle('app:getAutostartEnabled', () => getAutostartEnabled())

  ipcMain.handle('app:setAutostartEnabled', async (_event, enabled: boolean) => {
    await setAutostartEnabled(enabled)
  })

  ipcMain.handle('app:quit', () => {
    ;(app as typeof app & { isQuitting: boolean }).isQuitting = true
    app.quit()
  })

  ipcMain.handle('app:getVersion', () => app.getVersion())

  ipcMain.handle('app:showWindow', () => {
    const win = BrowserWindow.getAllWindows()[0]
    if (win) {
      win.show()
      win.focus()
    }
  })
}
