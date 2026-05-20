import type { LLMProvider, GenerateOptions } from '../types'
import { getApiKey } from '../keyStorage'

const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions'
const MODEL = 'llama-3.1-8b-instant'

/** Groq Cloud — OpenAI-compatible. Free tier: 30 RPM, 500+ tok/s. */
export class GroqProvider implements LLMProvider {
  id = 'groq'
  name = 'Groq Llama 3.1 8B'

  async isReady(): Promise<boolean> {
    return getApiKey('groq') !== null
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const apiKey = getApiKey('groq')
    if (!apiKey) throw new Error('No API key configured for Groq')

    const messages: { role: string; content: string }[] = []
    if (options.systemPrompt) {
      messages.push({ role: 'system', content: options.systemPrompt })
    }
    messages.push({ role: 'user', content: prompt })

    const body = {
      model: MODEL,
      messages,
      max_tokens: options.maxTokens ?? 2048,
      temperature: options.temperature ?? 0.7,
    }

    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text().catch(() => '')
      throw new Error(`Groq API error ${response.status}: ${error.slice(0, 300)}`)
    }

    let data: any
    try {
      data = await response.json()
    } catch {
      throw new Error('Groq returned a non-JSON response')
    }
    const text = data?.choices?.[0]?.message?.content
    if (!text) throw new Error('Empty response from Groq')
    return text
  }

  async getStatus() {
    const ready = await this.isReady()
    return { ready, reason: ready ? undefined : 'No API key configured' }
  }
}
