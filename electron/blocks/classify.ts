// Phase B — Tier 0 intent detection.
//
// Pure embedding classification: no LLM. Each block already has an e5-small
// embedding in the index DB. We embed a handful of template phrases per intent
// once, average them into a centroid, and assign every block to its nearest
// centroid by cosine similarity.

import { embed, isReady } from './embedder'
import { getDb, deserializeEmbedding, isDbReady } from './db'

export type Intent = 'decision' | 'question' | 'todo' | 'observation'

export const INTENTS: Intent[] = ['decision', 'question', 'todo', 'observation']

// A few representative phrasings per intent. Averaged into one centroid each —
// more phrasings make the centroid robust to how a given note happens to be
// worded. Embedded with the same model (and `query:` prefix) as block text.
const INTENT_TEMPLATES: Record<Intent, string[]> = {
  decision: [
    'We decided to go with this approach.',
    'The final decision is to proceed with this plan.',
    'I have chosen this option over the alternatives.',
    'Decision: we will adopt this going forward.',
  ],
  question: [
    'How should we handle this case?',
    'What is the best way to do this?',
    'I am not sure whether this will work.',
    'This is still an open question that needs an answer.',
  ],
  todo: [
    'TODO: finish this task.',
    'I still need to do this.',
    'The next step is to implement this.',
    'This is an action item that must be completed.',
  ],
  observation: [
    'I noticed that this behaves unexpectedly.',
    'It turns out this is the case.',
    'An interesting observation about how the system works.',
    'I observed the following pattern while looking into it.',
  ],
}

export interface FileIntents {
  counts: Record<Intent, number>
  /** Number of blocks that were classified. */
  total: number
}

function zeroCounts(): Record<Intent, number> {
  return { decision: 0, question: 0, todo: 0, observation: 0 }
}

let centroids: Record<Intent, Float32Array> | null = null
let initPromise: Promise<void> | null = null

function normalize(v: Float32Array): Float32Array {
  let norm = 0
  for (let i = 0; i < v.length; i++) norm += v[i] * v[i]
  norm = Math.sqrt(norm) || 1
  const out = new Float32Array(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

function average(vecs: Float32Array[]): Float32Array {
  const dim = vecs[0].length
  const out = new Float32Array(dim)
  for (const v of vecs) for (let i = 0; i < dim; i++) out[i] += v[i]
  for (let i = 0; i < dim; i++) out[i] /= vecs.length
  return out
}

/** Dot product — both operands are L2-normalised, so this is cosine. */
function cosine(a: Float32Array, b: Float32Array): number {
  let sum = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) sum += a[i] * b[i]
  return sum
}

/** Embed the intent templates into centroids. Lazy, idempotent. */
export function initClassifier(): Promise<void> {
  if (!initPromise) {
    initPromise = (async () => {
      const built = {} as Record<Intent, Float32Array>
      for (const intent of INTENTS) {
        const embs = await Promise.all(INTENT_TEMPLATES[intent].map(t => embed(t)))
        built[intent] = normalize(average(embs))
      }
      centroids = built
    })()
  }
  return initPromise
}

/** Nearest-centroid intent for a block embedding. Null until centroids load. */
export function classifyEmbedding(emb: Float32Array): Intent | null {
  if (!centroids) return null
  let best: Intent = 'observation'
  let bestScore = -Infinity
  for (const intent of INTENTS) {
    const score = cosine(emb, centroids[intent])
    if (score > bestScore) {
      bestScore = score
      best = intent
    }
  }
  return best
}

// Headings, code, tables and images carry no intent — only prose-like blocks
// are classified. Mirrors search.ts's substantial-content guard.
const CLASSIFIABLE = new Set(['paragraph', 'list_item', 'blockquote'])

/** Classify every prose block of one vault file, aggregating intent counts. */
export async function classifyFile(relPath: string): Promise<FileIntents> {
  if (!isDbReady() || !isReady()) return { counts: zeroCounts(), total: 0 }
  await initClassifier()

  const rows = getDb()
    .prepare('SELECT block_type, text, embedding FROM blocks WHERE file = ?')
    .all(relPath) as { block_type: string; text: string; embedding: Uint8Array }[]

  const counts = zeroCounts()
  let total = 0
  for (const row of rows) {
    if (!CLASSIFIABLE.has(row.block_type)) continue
    if (row.text.replace(/\s+/g, '').length < 24) continue
    const intent = classifyEmbedding(deserializeEmbedding(row.embedding))
    if (!intent) continue
    counts[intent]++
    total++
  }
  return { counts, total }
}
