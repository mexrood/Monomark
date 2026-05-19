import * as os from 'os'
import type { CatalogModel } from './types'

const MB = 1024 * 1024

/**
 * Curated 5-model catalog. We deliberately do NOT surface all of HuggingFace —
 * choice paralysis. GGUF URLs point at bartowski's Q4_K_M quants, the de-facto
 * standard hosts. `sizeBytes` is approximate; the downloader uses the real
 * Content-Length once the request starts.
 */
export const CATALOG: CatalogModel[] = [
  {
    id: 'smollm2-360m',
    name: 'SmolLM2 360M',
    params: '360M',
    sizeBytes: 230 * MB,
    ram: '~500 MB',
    speed: '50-80 tok/s',
    useCase: 'Tagging only — fast, basic',
    license: 'Apache 2.0',
    url: 'https://huggingface.co/bartowski/SmolLM2-360M-Instruct-GGUF/resolve/main/SmolLM2-360M-Instruct-Q4_K_M.gguf?download=true',
  },
  {
    id: 'qwen2.5-0.5b',
    name: 'Qwen 2.5 0.5B',
    params: '0.5B',
    sizeBytes: 380 * MB,
    ram: '~600 MB',
    speed: '40-60 tok/s',
    useCase: 'Fast tagging + short summaries',
    license: 'Apache 2.0',
    url: 'https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf?download=true',
  },
  {
    id: 'llama3.2-1b',
    name: 'Llama 3.2 1B',
    params: '1B',
    sizeBytes: 750 * MB,
    ram: '~1.2 GB',
    speed: '25-40 tok/s',
    useCase: 'Recommended — smart Claude context',
    license: 'Llama 3.2 Community License',
    url: 'https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf?download=true',
  },
  {
    id: 'gemma2-2b',
    name: 'Gemma 2 2B',
    params: '2B',
    sizeBytes: 1600 * MB,
    ram: '~2.5 GB',
    speed: '12-20 tok/s',
    useCase: 'High-quality summaries',
    license: 'Gemma Terms of Use',
    url: 'https://huggingface.co/bartowski/gemma-2-2b-it-GGUF/resolve/main/gemma-2-2b-it-Q4_K_M.gguf?download=true',
  },
  {
    id: 'phi3.5-mini',
    name: 'Phi-3.5 Mini 3.8B',
    params: '3.8B',
    sizeBytes: 2200 * MB,
    ram: '~4 GB',
    speed: '6-10 tok/s',
    useCase: 'Best quality — slower',
    license: 'MIT',
    url: 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf?download=true',
  },
]

export function getCatalogModel(id: string): CatalogModel | undefined {
  return CATALOG.find(m => m.id === id)
}

/** Pick a recommended model from total system RAM. */
export function recommendedModelId(): string {
  const gb = os.totalmem() / (1024 * 1024 * 1024)
  if (gb >= 30) return 'gemma2-2b'
  if (gb >= 14) return 'llama3.2-1b'
  return 'smollm2-360m'
}
