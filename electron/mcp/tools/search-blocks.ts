import { searchBlocks } from '../../blocks/search'
import { isDbReady } from '../../blocks/db'

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

/** Handler for the vault_search_blocks MCP tool — semantic block search. */
export async function toolSearchBlocks(args: {
  query?: string
  limit?: number
  threshold?: number
}): Promise<unknown> {
  if (!isDbReady()) {
    throw new Error('Memory index is not ready yet — try again in a moment.')
  }
  const query = String(args.query ?? '').trim()
  if (!query) throw new Error('query is required')

  const limit = Math.min(Math.max(1, Number(args.limit ?? 10)), 50)
  const threshold = typeof args.threshold === 'number' ? args.threshold : 0.55

  const results = await searchBlocks(query, { limit, threshold })

  return {
    count: results.length,
    blocks: results.map(r => ({
      block_id: r.id,
      text: r.text,
      file: r.file,
      line: r.line,
      type: r.block_type,
      relevance: Math.round(r.similarity * 100) / 100,
      updated_at: isoDate(r.updated_at),
    })),
  }
}
