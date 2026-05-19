import { ipcMain, BrowserWindow } from 'electron'
import { aiManager } from '../ai/manager'
import { registry } from '../ai/registry'
import { saveApiKey, deleteApiKey, hasApiKey } from '../ai/keyStorage'
import type { ProviderInfo } from '../ai/types'

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

  // ── LLM provider abstraction (local + cloud) ──────────────────────────────

  ipcMain.handle('ai:listProviders', async (): Promise<ProviderInfo[]> => {
    return Promise.all(
      registry.list().map(async p => ({
        id: p.id,
        name: p.name,
        ready: await p.isReady().catch(() => false),
        hasKey: p.id === 'local' ? true : hasApiKey(p.id),
      })),
    )
  })

  ipcMain.handle('ai:getActiveProvider', () => registry.getActiveId())

  ipcMain.handle('ai:setActiveProvider', (_e, id: string) => {
    registry.setActive(id)
    return { ok: true }
  })

  ipcMain.handle('ai:saveApiKey', (_e, providerId: string, key: string) => {
    saveApiKey(providerId, key)
    return { ok: true }
  })

  ipcMain.handle('ai:deleteApiKey', (_e, providerId: string) => {
    deleteApiKey(providerId)
    return { ok: true }
  })

  ipcMain.handle('ai:testProvider', async (_e, providerId: string) => {
    const provider = registry.get(providerId)
    if (!provider) return { ok: false, error: `Unknown provider: ${providerId}` }
    try {
      const result = await provider.generate('Reply with just "OK"', { maxTokens: 10 })
      return { ok: true, response: result.slice(0, 50) }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  })

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
