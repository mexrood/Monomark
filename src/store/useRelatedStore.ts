import { create } from 'zustand'
import type { Relation } from '../types/window'

/**
 * State for the "Related thoughts" panel (Cmd+Shift+F). Holds LLM-judged
 * useful relations for the active block — same data the inline ↗ arrow uses,
 * so the panel and the arrow always agree.
 */
interface RelatedStore {
  isOpen: boolean
  /** Block ID the panel is showing results for. */
  blockId: string | null
  results: Relation[]
  loading: boolean

  openPanel(blockId: string): void
  close(): void
  setResults(results: Relation[]): void
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
