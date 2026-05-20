import { getDb, isDbReady, schedulePersist } from './db'

// Cache layer for LLM-judged block relations. Pairs are stored directionally
// (a→b and b→a are separate rows) keyed by the source/target hashes — when
// either block's text changes the cached judgment is stale and gets dropped.

export interface RelationRow {
  block_id_from: string
  block_id_to: string
  hash_from: string
  hash_to: string
  similarity: number
  useful: number // 0 | 1
  label: string | null
  created_at: number
}

/** Enriched row returned to the renderer — joins the target block's location. */
export interface RelationForUI {
  fromId: string
  toId: string
  label: string
  similarity: number
  toFile: string
  toLine: number
  toText: string
}

export function getCachedRelation(fromId: string, toId: string): RelationRow | null {
  if (!isDbReady()) return null
  const row = getDb()
    .prepare('SELECT * FROM relations WHERE block_id_from = ? AND block_id_to = ?')
    .get(fromId, toId) as RelationRow | undefined
  return row ?? null
}

/** A cache row is still valid as long as both blocks' hashes match. */
export function isCacheValid(row: RelationRow, hashFrom: string, hashTo: string): boolean {
  return row.hash_from === hashFrom && row.hash_to === hashTo
}

export function upsertRelation(row: Omit<RelationRow, 'created_at'>): void {
  if (!isDbReady()) return
  getDb()
    .prepare(
      `INSERT INTO relations
         (block_id_from, block_id_to, hash_from, hash_to, similarity, useful, label, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(block_id_from, block_id_to) DO UPDATE SET
         hash_from = excluded.hash_from,
         hash_to = excluded.hash_to,
         similarity = excluded.similarity,
         useful = excluded.useful,
         label = excluded.label,
         created_at = excluded.created_at`,
    )
    .run(
      row.block_id_from,
      row.block_id_to,
      row.hash_from,
      row.hash_to,
      row.similarity,
      row.useful,
      row.label,
      Date.now(),
    )
  schedulePersist()
}

/** Drop every cached pair that touches a block — call on edit / delete. */
export function invalidateForBlock(blockId: string): void {
  if (!isDbReady()) return
  getDb()
    .prepare('DELETE FROM relations WHERE block_id_from = ? OR block_id_to = ?')
    .run(blockId, blockId)
  schedulePersist()
}

/**
 * Useful relations from a given block, joined with the target's location.
 * Filters out rows whose target block no longer exists.
 */
export function getUsefulRelationsForBlock(blockId: string, limit = 10): RelationForUI[] {
  if (!isDbReady()) return []
  const rows = getDb()
    .prepare(
      `SELECT r.block_id_from, r.block_id_to, r.label, r.similarity,
              b.file AS to_file, b.line AS to_line, b.text AS to_text
       FROM relations r
       JOIN blocks b ON b.id = r.block_id_to
       WHERE r.block_id_from = ? AND r.useful = 1
       ORDER BY r.similarity DESC
       LIMIT ?`,
    )
    .all(blockId, limit) as Array<{
      block_id_from: string
      block_id_to: string
      label: string
      similarity: number
      to_file: string
      to_line: number
      to_text: string
    }>
  return rows.map(r => ({
    fromId: r.block_id_from,
    toId: r.block_id_to,
    label: r.label,
    similarity: r.similarity,
    toFile: r.to_file,
    toLine: r.to_line,
    toText: r.to_text,
  }))
}
