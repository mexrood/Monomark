import type { LLMProvider, GenerateOptions } from '../types'
import { aiManager } from '../manager'

/**
 * Wraps the existing node-llama-cpp engine (Phase A) behind the provider
 * interface. `aiManager.prompt` already handles lazy model load; GenerateOptions
 * are ignored here — the local worker fixes its own sampling params.
 */
export class LocalLLMProvider implements LLMProvider {
  id = 'local'
  name = 'Local model'

  async isReady(): Promise<boolean> {
    return aiManager.isAvailable()
  }

  async generate(prompt: string, _options: GenerateOptions = {}): Promise<string> {
    return aiManager.prompt(prompt)
  }

  async getStatus() {
    const ready = await this.isReady()
    return {
      ready,
      reason: ready ? undefined : 'Local AI is disabled or no model is selected',
    }
  }
}
