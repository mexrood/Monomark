import { ipcMain, clipboard, shell, dialog } from 'electron'

export function registerWindowIPC() {
  ipcMain.handle('util:showInFolder', (_event, path: string) => {
    shell.showItemInFolder(path)
  })

  ipcMain.handle('util:copyToClipboard', (_event, text: string) => {
    clipboard.writeText(text)
  })

  ipcMain.handle('util:showMessageBox', async (_event, opts: Electron.MessageBoxOptions) => {
    const { response } = await dialog.showMessageBox(opts)
    return response
  })
}
