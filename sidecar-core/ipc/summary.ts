import { ipcMain, BrowserWindow } from 'electron'
import * as path from 'path'
import { getAllFileSummaries } from '../blocks/db'
import { summaryEvents } from '../blocks/summarizer'
import { store } from '../store'

// Phase D — exposes file summaries to the renderer. Summaries are stored
// vault-relative; the renderer keys the sidebar tree by absolute path, so we
// convert here, in the one place that knows the vault root.

function toAbsolute(relPath: string): string {
  const vault = store.get('vaultPath') as string | undefined
  return vault ? path.join(vault, relPath) : relPath
}

export function registerSummaryIPC(): void {
  ipcMain.handle('summary:getAll', () => {
    const out: Record<string, string> = {}
    for (const [rel, summary] of Object.entries(getAllFileSummaries())) {
      out[toAbsolute(rel)] = summary
    }
    return out
  })

  summaryEvents.on('summary', (payload: { file: string; summary: string }) => {
    const msg = { file: toAbsolute(payload.file), summary: payload.summary }
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send('summary:updated', msg)
    }
  })
}
