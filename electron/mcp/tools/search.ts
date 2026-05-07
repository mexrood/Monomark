import { store } from '../../store'
import { searchIndex } from '../search-index'

export async function toolSearch(args: { query: string; limit?: number }) {
  const vaultPath = store.get('vaultPath') as string | undefined
  if (!vaultPath) throw new Error('No vault configured')

  if (!args.query || args.query.trim().length === 0) {
    return { query: args.query, results: [] }
  }

  const results = searchIndex(vaultPath, args.query.trim(), args.limit ?? 20)

  return {
    query: args.query,
    results,
  }
}
