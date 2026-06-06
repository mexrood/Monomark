// Engine facade — owns the llama worker_thread and does request/response
// messaging over it. Public API (load / prompt / dispose / loaded) is
// unchanged, so the manager doesn't care that inference moved off-thread.

import { Worker } from 'worker_threads'
import { join } from 'path'

interface Pending {
  resolve: (text: string) => void
  reject: (err: Error) => void
}

export class LlamaEngine {
  private worker: Worker | null = null
  private ready = false
  private reqId = 0
  private pending = new Map<number, Pending>()

  get loaded(): boolean {
    return this.worker !== null && this.ready
  }

  /** Spawn the worker and load a GGUF model. Throws on failure. */
  async load(modelPath: string): Promise<void> {
    await this.dispose()

    const worker = new Worker(join(__dirname, 'llama-worker.js'))
    this.worker = worker

    worker.on('message', (msg: any) => {
      if (msg?.type === 'prompt-result') {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        if (msg.ok) p.resolve(msg.text)
        else p.reject(new Error(msg.error))
      }
    })
    worker.on('error', (err) => this.failAll(err))
    worker.on('exit', () => {
      if (this.worker === worker) {
        this.worker = null
        this.ready = false
      }
    })

    await new Promise<void>((resolve, reject) => {
      const onLoad = (msg: any) => {
        if (msg?.type !== 'load-result') return
        worker.off('message', onLoad)
        if (msg.ok) {
          this.ready = true
          resolve()
        } else {
          reject(new Error(msg.error))
        }
      }
      worker.on('message', onLoad)
      worker.postMessage({ type: 'load', modelPath })
    })
  }

  /** Run a single prompt against the loaded model. */
  async prompt(text: string): Promise<string> {
    if (!this.worker || !this.ready) throw new Error('No model loaded')
    const id = ++this.reqId
    return new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker!.postMessage({ type: 'prompt', id, text })
    })
  }

  /** Terminate the worker and free RAM. Safe when nothing is loaded. */
  async dispose(): Promise<void> {
    const worker = this.worker
    this.worker = null
    this.ready = false
    this.failAll(new Error('Engine disposed'))
    if (worker) {
      try {
        worker.postMessage({ type: 'dispose' })
      } catch {
        // worker may already be gone
      }
      await worker.terminate()
    }
  }

  private failAll(err: Error): void {
    for (const p of this.pending.values()) p.reject(err)
    this.pending.clear()
  }
}
