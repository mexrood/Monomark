import { EventEmitter } from 'events'
import { app } from 'electron'
import { createWriteStream } from 'fs'
import { mkdir, readdir, rm, stat } from 'fs/promises'
import { join } from 'path'
import { CATALOG, getCatalogModel, recommendedModelId } from './catalog'
import { LlamaEngine } from './engine'
import { store } from '../store'
import type { AISnapshot, AIState, DownloadProgress } from './types'

/**
 * Orchestrates the local-AI subsystem: the curated catalog, model downloads,
 * on-disk storage, and the active-model lifecycle (load / unload).
 *
 * Models live under `userData/models/<id>.gguf`. We intentionally do NOT store
 * them inside the vault — multi-GB binaries should never end up in a synced
 * notes folder. (The phase plan suggested `vault/.monomark/models`; this is a
 * deliberate deviation.)
 *
 * Emits:
 *   'state'    → AIState           on any engine/enabled/active change
 *   'download' → DownloadProgress  as a download progresses
 */
class AIManager extends EventEmitter {
  private engine = new LlamaEngine()
  private enabled = false
  private activeModelId: string | null = null
  private engineState: AIState['engineState'] = 'idle'
  private engineError: string | null = null
  /** modelId → AbortController for an in-flight download. */
  private downloads = new Map<string, AbortController>()

  init(): void {
    this.enabled = (store.get('aiEnabled') as boolean | undefined) ?? false
    this.activeModelId = (store.get('aiActiveModel') as string | undefined) || null
  }

  // ── Paths ───────────────────────────────────────────────────────────────

  private modelsDir(): string {
    return join(app.getPath('userData'), 'models')
  }

  private modelPath(id: string): string {
    return join(this.modelsDir(), `${id}.gguf`)
  }

  // ── Snapshot ────────────────────────────────────────────────────────────

  private aiState(): AIState {
    return {
      enabled: this.enabled,
      activeModelId: this.activeModelId,
      engineState: this.engineState,
      engineError: this.engineError,
    }
  }

  async getSnapshot(): Promise<AISnapshot> {
    const [downloadedIds, partialIds] = await Promise.all([
      this.listDownloaded(),
      this.listPartial(),
    ])
    return {
      ...this.aiState(),
      catalog: CATALOG,
      recommendedId: recommendedModelId(),
      downloadedIds,
      partialIds,
    }
  }

  private emitState(): void {
    this.emit('state', this.aiState())
  }

  /** Catalog ids that have a complete (non-partial) file on disk. */
  async listDownloaded(): Promise<string[]> {
    try {
      const files = new Set(await readdir(this.modelsDir()))
      return CATALOG.filter(m => files.has(`${m.id}.gguf`)).map(m => m.id)
    } catch {
      return []
    }
  }

  /** Catalog ids with a partial `.part` file — an interrupted download. */
  async listPartial(): Promise<string[]> {
    try {
      const files = new Set(await readdir(this.modelsDir()))
      return CATALOG.filter(m => files.has(`${m.id}.gguf.part`)).map(m => m.id)
    } catch {
      return []
    }
  }

  // ── Enable / disable ────────────────────────────────────────────────────

  async setEnabled(value: boolean): Promise<void> {
    this.enabled = value
    store.set('aiEnabled', value)
    // Disabling AI frees RAM — the model stays on disk.
    if (!value && this.engine.loaded) await this.unload()
    else this.emitState()
  }

  // ── Downloads ───────────────────────────────────────────────────────────

  async download(modelId: string): Promise<void> {
    const model = getCatalogModel(modelId)
    if (!model) throw new Error(`Unknown model: ${modelId}`)
    if (this.downloads.has(modelId)) return // already downloading

    const controller = new AbortController()
    this.downloads.set(modelId, controller)

    const dir = this.modelsDir()
    const finalPath = this.modelPath(modelId)
    const partPath = `${finalPath}.part`

    const report = (p: Omit<DownloadProgress, 'modelId'>) =>
      this.emit('download', { modelId, ...p } satisfies DownloadProgress)

    try {
      await mkdir(dir, { recursive: true })

      // Resume: if a .part file exists, ask the server for the remaining range.
      let startByte = 0
      try {
        startByte = (await stat(partPath)).size
      } catch {
        startByte = 0
      }

      const headers: Record<string, string> = {}
      if (startByte > 0) headers.Range = `bytes=${startByte}-`

      const res = await fetch(model.url, { signal: controller.signal, headers })
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`)

      // 206 → server honored the range, append. Anything else → start over.
      const resumed = res.status === 206
      if (!resumed) startByte = 0

      let total: number
      if (resumed) {
        // Content-Range: "bytes <start>-<end>/<total>"
        const parsed = Number(res.headers.get('content-range')?.split('/')[1])
        total = Number.isFinite(parsed)
          ? parsed
          : startByte + Number(res.headers.get('content-length') || 0)
      } else {
        total = Number(res.headers.get('content-length')) || model.sizeBytes
      }

      let transferred = startByte
      const out = createWriteStream(partPath, { flags: resumed ? 'a' : 'w' })
      try {
        for await (const chunk of res.body as AsyncIterable<Uint8Array>) {
          // Respect backpressure — these files are multi-GB.
          if (!out.write(chunk)) {
            await new Promise<void>(resolve => out.once('drain', resolve))
          }
          transferred += chunk.byteLength
          report({
            status: 'downloading',
            transferred,
            total,
            percent: total > 0 ? Math.round((transferred / total) * 100) : -1,
          })
        }
      } finally {
        await new Promise<void>((resolve, reject) => {
          out.end((err?: Error | null) => (err ? reject(err) : resolve()))
        })
      }

      // Atomic-ish completion: rename .part → final only once fully written.
      const { rename } = await import('fs/promises')
      await rename(partPath, finalPath)
      report({ status: 'done', transferred, total, percent: 100 })
    } catch (err) {
      // The .part file is intentionally kept so the download can be resumed.
      const aborted = controller.signal.aborted
      report({
        status: 'error',
        transferred: 0,
        total: 0,
        percent: -1,
        error: aborted ? 'Paused' : (err as Error).message,
      })
    } finally {
      this.downloads.delete(modelId)
    }
  }

  /** Pause an in-flight download. The .part file is kept for later resume. */
  cancelDownload(modelId: string): void {
    this.downloads.get(modelId)?.abort()
  }

  async deleteModel(modelId: string): Promise<void> {
    if (this.activeModelId === modelId) await this.unload(true)
    this.cancelDownload(modelId)
    const final = this.modelPath(modelId)
    await Promise.all([
      rm(final, { force: true }).catch(() => {}),
      rm(`${final}.part`, { force: true }).catch(() => {}),
    ])
    this.emitState()
  }

  // ── Lifecycle ───────────────────────────────────────────────────────────

  /** Load a downloaded model into RAM and make it the active model. */
  async activate(modelId: string): Promise<void> {
    const model = getCatalogModel(modelId)
    if (!model) throw new Error(`Unknown model: ${modelId}`)
    const path = this.modelPath(modelId)
    try {
      await stat(path)
    } catch {
      throw new Error('Model is not downloaded')
    }

    this.engineState = 'loading'
    this.activeModelId = modelId
    this.engineError = null
    this.emitState()

    try {
      await this.engine.load(path)
      this.engineState = 'ready'
      store.set('aiActiveModel', modelId)
    } catch (err) {
      this.engineState = 'error'
      this.engineError = (err as Error).message
    }
    this.emitState()
  }

  /** Unload the model and free RAM. `clearActive` also forgets the selection. */
  async unload(clearActive = false): Promise<void> {
    await this.engine.dispose()
    this.engineState = 'idle'
    this.engineError = null
    if (clearActive) {
      this.activeModelId = null
      store.set('aiActiveModel', '')
    }
    this.emitState()
  }

  /** Run a prompt; lazily (re)loads the active model if it was unloaded. */
  async prompt(text: string): Promise<string> {
    if (!this.enabled) throw new Error('AI is disabled')
    if (!this.activeModelId) throw new Error('No model selected')
    if (!this.engine.loaded) await this.activate(this.activeModelId)
    if (this.engineState !== 'ready') {
      throw new Error(this.engineError ?? 'Model failed to load')
    }
    return this.engine.prompt(text)
  }
}

export const aiManager = new AIManager()
