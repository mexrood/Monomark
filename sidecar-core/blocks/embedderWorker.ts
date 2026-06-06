import { parentPort } from 'worker_threads'

// Heavy Transformers.js inference runs here, off the main thread.
// `@xenova/transformers` is ESM-only — load it via dynamic import so this
// worker can stay CommonJS (consistent with the rest of the electron build).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let extractor: any = null

type InMessage =
  | { id: number; type: 'init'; cachePath: string }
  | { id: number; type: 'embed'; text: string }

async function init(cachePath: string): Promise<void> {
  console.log('[embedder-worker] loading @xenova/transformers…')
  const { pipeline, env } = await import('@xenova/transformers')
  env.cacheDir = cachePath
  env.allowLocalModels = false
  env.allowRemoteModels = true
  console.log('[embedder-worker] loading model (first run downloads ~120MB to', cachePath + ')…')
  extractor = await pipeline('feature-extraction', 'Xenova/multilingual-e5-small')
  console.log('[embedder-worker] model ready')
}

async function embed(text: string): Promise<number[]> {
  if (!extractor) throw new Error('Extractor not initialized')
  // e5 models expect a task prefix for semantic search.
  const output = await extractor(`query: ${text}`, { pooling: 'mean', normalize: true })
  return Array.from(output.data as Float32Array)
}

parentPort!.on('message', async (msg: InMessage) => {
  try {
    if (msg.type === 'init') {
      await init(msg.cachePath)
      parentPort!.postMessage({ id: msg.id, type: 'ready' })
    } else if (msg.type === 'embed') {
      const embedding = await embed(msg.text)
      parentPort!.postMessage({ id: msg.id, type: 'result', embedding })
    }
  } catch (err) {
    parentPort!.postMessage({
      id: msg.id,
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    })
  }
})
