import { create } from 'zustand'

// Phase D — file one-line summaries, keyed by absolute file path.

interface SummaryStore {
  summaries: Record<string, string>
  /** Load existing summaries and subscribe to live updates — call once. */
  init(): Promise<void>
}

export const useSummaryStore = create<SummaryStore>(set => ({
  summaries: {},

  async init() {
    const api = window.marrow?.summary
    if (!api) return

    const all = await api.getAll()
    set({ summaries: all })

    // Single global listener — never removed (mirrors the other stores).
    api.onUpdated(({ file, summary }) => {
      set(s => ({ summaries: { ...s.summaries, [file]: summary } }))
    })
  },
}))
