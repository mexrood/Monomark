import { create } from 'zustand'
import type { AIProviderInfo } from '../types/window'

// Cloud/local LLM provider selection + API-key management.
// Kept separate from the Phase A `useAIStore` (which owns local-model
// download/lifecycle) — the two stores have unrelated shapes.

interface TestResult {
  ok: boolean
  error?: string
  response?: string
}

interface AIProviderStore {
  providers: AIProviderInfo[]
  activeId: string
  loading: boolean

  loadProviders(): Promise<void>
  setActive(id: string): Promise<void>
  saveKey(providerId: string, key: string): Promise<void>
  deleteKey(providerId: string): Promise<void>
  testProvider(providerId: string): Promise<TestResult>
}

export const useAIProviderStore = create<AIProviderStore>((set, get) => ({
  providers: [],
  activeId: 'local',
  loading: false,

  async loadProviders() {
    const ai = window.marrow?.ai
    if (!ai) return
    set({ loading: true })
    try {
      const [providers, activeId] = await Promise.all([
        ai.listProviders(),
        ai.getActiveProvider(),
      ])
      set({ providers, activeId, loading: false })
    } catch {
      set({ loading: false })
    }
  },

  async setActive(id) {
    await window.marrow?.ai?.setActiveProvider(id)
    set({ activeId: id })
  },

  async saveKey(providerId, key) {
    await window.marrow?.ai?.saveApiKey(providerId, key)
    await get().loadProviders()
  },

  async deleteKey(providerId) {
    await window.marrow?.ai?.deleteApiKey(providerId)
    await get().loadProviders()
  },

  async testProvider(providerId) {
    const result = await window.marrow?.ai?.testProvider(providerId)
    return result ?? { ok: false, error: 'AI bridge unavailable' }
  },
}))
