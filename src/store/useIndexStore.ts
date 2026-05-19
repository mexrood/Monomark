import { create } from 'zustand'

/** Mirror of the main-process IndexStatus (electron/ipc/index.ts). */
export type IndexStatus =
  | { kind: 'idle' }
  | { kind: 'initializing' }
  | { kind: 'indexing'; current: number; total: number }
  | { kind: 'ready' }
  | { kind: 'error'; message: string }

interface IndexStore {
  status: IndexStatus
  setStatus: (s: IndexStatus) => void
}

export const useIndexStore = create<IndexStore>(set => ({
  status: { kind: 'idle' },
  setStatus: status => set({ status }),
}))
