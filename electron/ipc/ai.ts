import { ipcMain, BrowserWindow } from 'electron'
import { aiManager } from '../ai/manager'

export function registerAiIPC() {
  aiManager.init()

  ipcMain.handle('ai:getSnapshot', () => aiManager.getSnapshot())

  ipcMain.handle('ai:setEnabled', (_e, value: boolean) => aiManager.setEnabled(value))

  ipcMain.handle('ai:download', (_e, modelId: string) => {
    // Fire-and-forget — progress is pushed via the 'ai:download-progress' event.
    void aiManager.download(modelId)
  })

  ipcMain.handle('ai:cancelDownload', (_e, modelId: string) =>
    aiManager.cancelDownload(modelId)
  )

  ipcMain.handle('ai:deleteModel', (_e, modelId: string) =>
    aiManager.deleteModel(modelId)
  )

  ipcMain.handle('ai:activate', (_e, modelId: string) => aiManager.activate(modelId))

  ipcMain.handle('ai:unload', () => aiManager.unload())

  ipcMain.handle('ai:prompt', (_e, text: string) => aiManager.prompt(text))

  // ── Forward events to every renderer ──────────────────────────────────────
  aiManager.on('state', (state) => {
    BrowserWindow.getAllWindows().forEach(w => w.webContents.send('ai:state', state))
  })
  aiManager.on('download', (progress) => {
    BrowserWindow.getAllWindows().forEach(w =>
      w.webContents.send('ai:download-progress', progress)
    )
  })
}
