import { create } from 'zustand'
import type {
  AICatalogModel,
  AIDownloadProgress,
  AIEngineState,
  AISnapshot,
} from '../types/window'

interface AIStore {
  /** Whether the local-AI subsystem is available (preload exposes it). */
  available: boolean

  enabled: boolean
  activeModelId: string | null
  engineState: AIEngineState
  engineError: string | null

  catalog: AICatalogModel[]
  recommendedId: string
  downloadedIds: string[]
  /** Catalog ids with a resumable partial download. */
  partialIds: string[]

  /** modelId → in-flight download progress. */
  downloads: Record<string, AIDownloadProgress>

  /** Load the snapshot and subscribe to live updates — call once at startup. */
  init(): Promise<void>
  /** Re-pull downloaded/partial ids from disk. */
  refresh(): Promise<void>
  setEnabled(value: boolean): Promise<void>
  download(modelId: string): Promise<void>
  cancelDownload(modelId: string): Promise<void>
  deleteModel(modelId: string): Promise<void>
  activate(modelId: string): Promise<void>
  unload(): Promise<void>
}

export const useAIStore = create<AIStore>((set, get) => ({
  available: false,
  enabled: false,
  activeModelId: null,
  engineState: 'idle',
  engineError: null,
  catalog: [],
  recommendedId: '',
  downloadedIds: [],
  partialIds: [],
  downloads: {},

  async init() {
    const ai = window.marrow?.ai
    if (!ai) return

    const snap: AISnapshot = await ai.getSnapshot()
    set({
      available: true,
      enabled: snap.enabled,
      activeModelId: snap.activeModelId,
      engineState: snap.engineState,
      engineError: snap.engineError,
      catalog: snap.catalog,
      recommendedId: snap.recommendedId,
      downloadedIds: snap.downloadedIds,
      partialIds: snap.partialIds,
    })

    // Single global listeners — never removed (mirrors useAppStore's MCP wiring).
    ai.onState((state) => {
      set({
        enabled: state.enabled,
        activeModelId: state.activeModelId,
        engineState: state.engineState,
        engineError: state.engineError,
      })
    })

    ai.onDownloadProgress((p) => {
      if (p.status === 'downloading') {
        set(s => ({ downloads: { ...s.downloads, [p.modelId]: p } }))
        return
      }
      // done or error/pause — clear the live entry and re-sync disk state
      // (a paused download leaves a resumable .part file).
      set(s => {
        const downloads = { ...s.downloads }
        delete downloads[p.modelId]
        return { downloads }
      })
      void get().refresh()
    })
  },

  async refresh() {
    const ai = window.marrow?.ai
    if (!ai) return
    const snap = await ai.getSnapshot()
    set({ downloadedIds: snap.downloadedIds, partialIds: snap.partialIds })
  },

  async setEnabled(value) {
    await window.marrow?.ai?.setEnabled(value)
  },

  async download(modelId) {
    await window.marrow?.ai?.download(modelId)
  },

  async cancelDownload(modelId) {
    await window.marrow?.ai?.cancelDownload(modelId)
  },

  async deleteModel(modelId) {
    await window.marrow?.ai?.deleteModel(modelId)
    set(s => ({
      downloadedIds: s.downloadedIds.filter(id => id !== modelId),
      partialIds: s.partialIds.filter(id => id !== modelId),
    }))
  },

  async activate(modelId) {
    await window.marrow?.ai?.activate(modelId)
  },

  async unload() {
    await window.marrow?.ai?.unload()
  },
}))
