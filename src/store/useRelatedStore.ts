import { create } from 'zustand'
import type { SearchResult } from '../types/window'

/**
 * State for the semantic "Related thoughts" feature (Phase 3).
 * Distinct from `useSearchStore` — that one is the MiniSearch text palette.
 */
interface RelatedStore {
  isOpen: boolean
  /** Block ID the panel is showing results for. */
  blockId: string | null
  results: SearchResult[]
  loading: boolean

  openPanel(blockId: string): void
  close(): void
  setResults(results: SearchResult[]): void
  setLoading(loading: boolean): void
}

export const useRelatedStore = create<RelatedStore>(set => ({
  isOpen: false,
  blockId: null,
  results: [],
  loading: false,

  openPanel(blockId) {
    set({ isOpen: true, blockId, results: [], loading: true })
  },
  close() {
    set({ isOpen: false, blockId: null, results: [], loading: false })
  },
  setResults(results) {
    set({ results })
  },
  setLoading(loading) {
    set({ loading })
  },
}))
