// Shared types for the local-AI (BYOM) subsystem.

/** A model in the curated catalog. Static data — no runtime state. */
export interface CatalogModel {
  /** Stable id, also used as the on-disk filename stem. */
  id: string
  name: string
  /** Human label, e.g. "Llama 3.2 1B". */
  params: string
  /** Approx download size in bytes (for UI; the real size comes from the server). */
  sizeBytes: number
  /** Approx RAM needed when loaded, human string. */
  ram: string
  /** Rough CPU tokens/sec range. */
  speed: string
  /** One-line use-case label shown on the card. */
  useCase: string
  license: string
  /** Direct GGUF download URL. */
  url: string
}

export type EngineState = 'idle' | 'loading' | 'ready' | 'error'

/** Top-level AI state mirrored into the renderer. */
export interface AIState {
  /** Master on/off. When false the engine stays unloaded. */
  enabled: boolean
  /** Catalog id of the model the user activated, or null. */
  activeModelId: string | null
  engineState: EngineState
  engineError: string | null
}

export type DownloadStatus = 'downloading' | 'done' | 'error'

/** Per-model download progress, pushed to the renderer as it changes. */
export interface DownloadProgress {
  modelId: string
  status: DownloadStatus
  /** 0-100; -1 when total size is unknown. */
  percent: number
  transferred: number
  total: number
  error?: string
}

/** Full snapshot returned by `ai:getState`. */
export interface AISnapshot extends AIState {
  catalog: CatalogModel[]
  recommendedId: string
  /** Catalog ids that are fully downloaded on disk. */
  downloadedIds: string[]
  /** Catalog ids with a partial (.part) download that can be resumed. */
  partialIds: string[]
}
