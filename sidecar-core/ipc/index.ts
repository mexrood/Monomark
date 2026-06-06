import { ipcMain, BrowserWindow } from 'electron'

/** Index status broadcast to the renderer for the progress indicator. */
export type IndexStatus =
  | { kind: 'idle' }
  | { kind: 'initializing' }
  | { kind: 'indexing'; current: number; total: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

let currentStatus: IndexStatus = { kind: 'idle' }

/** Update the index status and push it to every open window. */
export function setIndexStatus(status: IndexStatus): void {
  currentStatus = status
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('indexer:status', status)
  }
}

export function getIndexStatus(): IndexStatus {
  return currentStatus
}

export function registerIndexIPC(): void {
  // Renderer asks for the current status on mount, covering any status
  // changes that fired before its listener was attached.
  ipcMain.handle('index:getStatus', () => currentStatus)
}
