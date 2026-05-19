import { Worker } from 'worker_threads'
import * as path from 'path'

// Main-process API around the embedding worker thread. The worker file is
// emitted next to the bundled main process (see vite.config.ts worker entry).

let worker: Worker | null = null
let ready = false
let readyPromise: Promise<void> | null = null
let nextId = 1

interface Pending { resolve: (v: Float32Array) => void; reject: (e: Error) => void }
const pending = new Map<number, Pending>()

const EMBED_TIMEOUT_MS = 30_000

/** Start the worker and load the model. Idempotent — safe to call repeatedly. */
export function initEmbedder(vaultPath: string): Promise<void> {
  if (readyPromise) return readyPromise

  readyPromise = new Promise<void>((resolve, reject) => {
    const cachePath = path.join(vaultPath, '.monomark', 'embeddings.cache')
    const workerPath = path.join(__dirname, 'embedderWorker.js')
    console.log('[embedder] spawning worker:', workerPath)
    worker = new Worker(workerPath)

    worker.on('message', (msg: { id: number; type: string; embedding?: number[]; error?: string }) => {
      if (msg.type === 'ready') {
        ready = true
        resolve()
        return
      }
      const p = pending.get(msg.id)
      if (!p) return
      pending.delete(msg.id)
      if (msg.type === 'error') p.reject(new Error(msg.error ?? 'embed failed'))
      else p.resolve(new Float32Array(msg.embedding ?? []))
    })

    worker.on('error', err => {
      console.error('[embedder] worker error:', err)
      if (!ready) reject(err)
      // Fail any in-flight requests so callers don't hang forever.
      for (const p of pending.values()) p.reject(err)
      pending.clear()
    })

    worker.postMessage({ id: nextId++, type: 'init', cachePath })
  })

  return readyPromise
}

function embedOnce(text: string): Promise<Float32Array> {
  if (!worker) return Promise.reject(new Error('Embedder not initialized'))
  return new Promise<Float32Array>((resolve, reject) => {
    const id = nextId++
    const timer = setTimeout(() => {
      if (pending.delete(id)) reject(new Error('embed timeout'))
    }, EMBED_TIMEOUT_MS)
    pending.set(id, {
      resolve: v => { clearTimeout(timer); resolve(v) },
      reject: e => { clearTimeout(timer); reject(e) },
    })
    worker!.postMessage({ id, type: 'embed', text })
  })
}

/** Embed one block of text. Retries once on failure, then rethrows. */
export async function embed(text: string): Promise<Float32Array> {
  if (!ready) await readyPromise
  try {
    return await embedOnce(text)
  } catch {
    return embedOnce(text)
  }
}

export function isReady(): boolean {
  return ready
}

/** Tear the worker down (e.g. when the vault folder changes). */
export async function disposeEmbedder(): Promise<void> {
  if (worker) {
    await worker.terminate()
    worker = null
  }
  ready = false
  readyPromise = null
  pending.clear()
}
