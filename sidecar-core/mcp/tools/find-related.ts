import { findRelatedToBlock } from '../../blocks/search'
import { getDb, isDbReady } from '../../blocks/db'

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Handler for the vault_find_related MCP tool — blocks similar to a given block. */
export async function toolFindRelated(args: {
  block_id?: string
  limit?: number
  threshold?: number
  include_same_file?: boolean
}): Promise<unknown> {
  if (!isDbReady()) {
    throw new Error('Memory index is not ready yet — try again in a moment.')
  }
  const blockId = String(args.block_id ?? '').trim()
  if (!blockId) throw new Error('block_id is required')

  const exists = getDb().prepare('SELECT 1 FROM blocks WHERE id = ?').get(blockId)
  if (!exists) throw new Error(`Block not found: ${blockId}`)

  const limit = Math.min(Math.max(1, Number(args.limit ?? 10)), 50)
  const threshold = typeof args.threshold === 'number' ? args.threshold : 0.70
  const sameFile = args.include_same_file === true

  const results = findRelatedToBlock(blockId, { limit, threshold, sameFile })

  return {
    count: results.length,
    blocks: results.map(r => ({
      block_id: r.id,
      text: r.text,
      file: r.file,
      line: r.line,
      type: r.block_type,
      similarity: Math.round(r.similarity * 100) / 100,
      updated_at: isoDate(r.updated_at),
    })),
  }
}
