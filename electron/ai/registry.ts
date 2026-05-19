import ElectronStore from 'electron-store'
import type { LLMProvider } from './types'

// Singleton registry of LLM providers. The active provider id is persisted so
// the choice survives restarts. All AI features call `registry.getActive()`.

const store = new ElectronStore<{ activeProvider: string }>({ name: 'ai-config' })

class ProviderRegistry {
  private providers = new Map<string, LLMProvider>()
  private activeId: string

  constructor() {
    this.activeId = (store.get('activeProvider', 'local') as string) || 'local'
  }

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider)
  }

  getActive(): LLMProvider {
    const provider = this.providers.get(this.activeId)
    // Fall back to local if a previously-saved provider is somehow missing.
    if (!provider) {
      const local = this.providers.get('local')
      if (!local) throw new Error(`Active provider not found: ${this.activeId}`)
      return local
    }
    return provider
  }

  setActive(id: string): void {
    if (!this.providers.has(id)) throw new Error(`Unknown provider: ${id}`)
    this.activeId = id
    store.set('activeProvider', id)
  }

  getActiveId(): string {
    return this.activeId
  }

  list(): LLMProvider[] {
    return Array.from(this.providers.values())
  }

  get(id: string): LLMProvider | undefined {
    return this.providers.get(id)
  }
}

export const registry = new ProviderRegistry()
