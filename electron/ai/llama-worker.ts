// node-llama-cpp runs here, in a worker_thread — model load and inference never
// touch the main process event loop. Built by vite as a separate entry
// (dist-electron/llama-worker.js); the engine spawns it via new Worker().
//
// node-llama-cpp is ESM-only; we reach it through a dynamic import() that
// rollup preserves as a real import() the CJS worker bundle can resolve.

import { parentPort } from 'worker_threads'

type LlamaModule = typeof import('node-llama-cpp')

let mod: LlamaModule | null = null
let llama: any = null
let model: any = null
let context: any = null
let session: any = null

async function loadModule(): Promise<LlamaModule> {
  if (!mod) mod = await import('node-llama-cpp')
  return mod
}

async function disposeModel(): Promise<void> {
  try {
    await context?.dispose?.()
    await model?.dispose?.()
  } catch {
    // best-effort teardown
  }
  session = null
  context = null
  model = null
}

type InMessage =
  | { type: 'load'; modelPath: string }
  | { type: 'prompt'; id: number; text: string }
  | { type: 'dispose' }

parentPort?.on('message', async (msg: InMessage) => {
  if (msg.type === 'load') {
    try {
      await disposeModel()
      const { getLlama, LlamaChatSession } = await loadModule()
      if (!llama) llama = await getLlama()
      model = await llama.loadModel({ modelPath: msg.modelPath })
      context = await model.createContext()
      session = new LlamaChatSession({ contextSequence: context.getSequence() })
      parentPort!.postMessage({ type: 'load-result', ok: true })
    } catch (err) {
      parentPort!.postMessage({ type: 'load-result', ok: false, error: (err as Error).message })
    }
  } else if (msg.type === 'prompt') {
    try {
      if (!session) throw new Error('No model loaded')
      const text = await session.prompt(msg.text, { maxTokens: 256 })
      parentPort!.postMessage({ type: 'prompt-result', id: msg.id, ok: true, text })
    } catch (err) {
      parentPort!.postMessage({
        type: 'prompt-result',
        id: msg.id,
        ok: false,
        error: (err as Error).message,
      })
    }
  } else if (msg.type === 'dispose') {
    await disposeModel()
  }
})
