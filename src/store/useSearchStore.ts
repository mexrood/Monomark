import { create } from 'zustand'
import MiniSearch from 'minisearch'

interface DocRecord {
  id: string
  title: string
  content: string
}

export interface SearchHit {
  path: string
  title: string
  snippet: string
}

interface SearchStore {
  query: string
  results: SearchHit[]
  indexing: boolean

  setQuery(q: string): void
  rebuildIndex(docs: DocRecord[]): Promise<void>
  updateDoc(doc: DocRecord): void
}

const miniSearch = new MiniSearch<DocRecord>({
  fields: ['title', 'content'],
  storeFields: ['title', 'content'],
  searchOptions: {
    prefix: true,
    fuzzy: 0.2,
    boost: { title: 2 },
  },
})

let queryDebounce: ReturnType<typeof setTimeout> | null = null

function runSearch(query: string): SearchHit[] {
  if (!query.trim()) return []
  const results = miniSearch.search(query)
  return results.slice(0, 40).map(r => ({
    path: r.id,
    title: r.title as string,
    snippet: extractSnippet(r.content as string, query),
  }))
}

function extractSnippet(content: string, query: string): string {
  const lower = content.toLowerCase()
  const q = query.toLowerCase().split(/\s+/)[0] ?? ''
  const idx = lower.indexOf(q)
  if (idx === -1) return content.slice(0, 200)
  const start = Math.max(0, idx - 80)
  const end = Math.min(content.length, idx + 120)
  const snippet = (start > 0 ? '…' : '') + content.slice(start, end) + (end < content.length ? '…' : '')
  return snippet
}

export const useSearchStore = create<SearchStore>((set) => ({
  query: '',
  results: [],
  indexing: false,

  setQuery(q) {
    set({ query: q })
    if (queryDebounce) clearTimeout(queryDebounce)
    queryDebounce = setTimeout(() => {
      set({ results: runSearch(q) })
    }, 150)
  },

  async rebuildIndex(docs) {
    set({ indexing: true })
    try {
      // Clear and re-add all
      if (miniSearch.documentCount > 0) {
        miniSearch.removeAll()
      }
      miniSearch.addAll(docs)
    } finally {
      set({ indexing: false })
      // Re-run current query with fresh index
      const q = useSearchStore.getState().query
      if (q) set({ results: runSearch(q) })
    }
  },

  updateDoc(doc) {
    try {
      miniSearch.discard(doc.id)
    } catch { /* not indexed yet */ }
    miniSearch.add(doc)
    // Re-run query if active
    const q = useSearchStore.getState().query
    if (q) set({ results: runSearch(q) })
  },
}))
