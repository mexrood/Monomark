import { getDb, deserializeEmbedding, isDbReady } from './db'
import { embed, isReady } from './embedder'

export interface SearchResult {
  id: string
  file: string
  line: number
  block_type: string
  text: string
  similarity: number
  updated_at: number
}

export interface SearchOptions {
  threshold?: number
  limit?: number
  sameFile?: boolean
}

/** Dot product — embeddings are L2-normalised, so this is cosine similarity. */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let sum = 0
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) sum += a[i] * b[i]
  return sum
}

interface BlockRow {
  id: string
  file: string
  line: number
  block_type: string
  text: string
  embedding: Uint8Array
  updated_at: number
}

const SELECT_COLS = 'id, file, line, block_type, text, embedding, updated_at'

/** Strip markdown noise + whitespace — used to detect duplicate blocks. */
function normalizeForDedup(text: string): string {
  return text.toLowerCase().replace(/[\s*_`#>|\-]+/g, ' ').trim()
}

/**
 * Whether a block carries enough real content to be worth surfacing.
 * Bare markers / tiny template fragments embed poorly and produce noise.
 */
function isSubstantial(text: string): boolean {
  return normalizeForDedup(text).replace(/\s+/g, '').length >= 24
}

/**
 * Drop low-content fragments and collapse near-identical blocks (copies,
 * repeated templates across files), then cap to `limit`.
 */
function refineResults(scored: SearchResult[], limit: number): SearchResult[] {
  const seen = new Set<string>()
  const out: SearchResult[] = []
  for (const r of scored) {
    if (!isSubstantial(r.text)) continue
    const key = normalizeForDedup(r.text)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(r)
  }
  return out.slice(0, limit)
}

function toResult(row: BlockRow, similarity: number): SearchResult {
  return {
    id: row.id,
    file: row.file,
    line: row.line,
    block_type: row.block_type,
    text: row.text,
    similarity,
    updated_at: row.updated_at,
  }
}

/**
 * Find blocks semantically similar to a given block (by its block ID).
 * Used by "Find related" (Cmd+Shift+F) and the inline hint counts.
 */
export function findRelatedToBlock(blockId: string, options: SearchOptions = {}): SearchResult[] {
  const { threshold = 0.70, limit = 10, sameFile = false } = options
  if (!isDbReady()) return []
  const db = getDb()

  const target = db.prepare('SELECT file, embedding FROM blocks WHERE id = ?').get(blockId) as
    | { file: string; embedding: Uint8Array }
    | undefined
  if (!target) return []
  const targetEmb = deserializeEmbedding(target.embedding)

  let query = `SELECT ${SELECT_COLS} FROM blocks WHERE id != ?`
  const params: unknown[] = [blockId]
  if (!sameFile) {
    query += ' AND file != ?'
    params.push(target.file)
  }

  const candidates = db.prepare(query).all(...params) as BlockRow[]
  const scored = candidates
    .map(row => toResult(row, cosineSimilarity(targetEmb, deserializeEmbedding(row.embedding))))
    .filter(r => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
  return refineResults(scored, limit)
}

/** Free-text semantic search across all indexed blocks. */
export async function searchBlocks(query: string, options: SearchOptions = {}): Promise<SearchResult[]> {
  const { threshold = 0.55, limit = 20 } = options
  if (!isDbReady()) return []
  if (!isReady()) throw new Error('Memory is still initializing')

  const queryEmb = await embed(query)
  const db = getDb()
  const all = db.prepare(`SELECT ${SELECT_COLS} FROM blocks`).all() as BlockRow[]

  const scored = all
    .map(row => toResult(row, cosineSimilarity(queryEmb, deserializeEmbedding(row.embedding))))
    .filter(r => r.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
  return refineResults(scored, limit)
}

/**
 * Batch helper for inline "↗ Related" hints: for each given block ID, count how
 * many other-file blocks exceed `threshold`. One pass over the index — far
 * cheaper than one findRelatedToBlock call per visible block.
 */
export function countRelatedForBlocks(
  blockIds: string[],
  threshold = 0.90,
): Record<string, number> {
  const result: Record<string, number> = {}
  if (!isDbReady() || blockIds.length === 0) return result

  const db = getDb()
  const all = db.prepare('SELECT id, file, embedding FROM blocks').all() as {
    id: string
    file: string
    embedding: Uint8Array
  }[]
  const decoded = all.map(r => ({ id: r.id, file: r.file, emb: deserializeEmbedding(r.embedding) }))
  const byId = new Map(decoded.map(d => [d.id, d]))

  for (const blockId of blockIds) {
    const target = byId.get(blockId)
    if (!target) { result[blockId] = 0; continue }
    let count = 0
    for (const cand of decoded) {
      if (cand.id === blockId || cand.file === target.file) continue
      if (cosineSimilarity(target.emb, cand.emb) >= threshold) count++
    }
    result[blockId] = count
  }
  return result
}
