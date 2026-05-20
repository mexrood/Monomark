import type { LLMProvider, GenerateOptions } from '../types'
import { getApiKey } from '../keyStorage'

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'

/** Google AI Studio — Gemini 2.0 Flash. Free tier: 1500 req/day, 15 RPM. */
export class GeminiProvider implements LLMProvider {
  id = 'gemini'
  name = 'Gemini 2.0 Flash'

  async isReady(): Promise<boolean> {
    return getApiKey('gemini') !== null
  }

  async generate(prompt: string, options: GenerateOptions = {}): Promise<string> {
    const apiKey = getApiKey('gemini')
    if (!apiKey) throw new Error('No API key configured for Gemini')

    const fullPrompt = options.systemPrompt
      ? `${options.systemPrompt}\n\n${prompt}`
      : prompt

    const body = {
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        maxOutputTokens: options.maxTokens ?? 2048,
        temperature: options.temperature ?? 0.7,
      },
    }

    const response = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const error = await response.text().catch(() => '')
      throw new Error(`Gemini API error ${response.status}: ${error.slice(0, 300)}`)
    }

    let data: any
    try {
      data = await response.json()
    } catch {
      throw new Error('Gemini returned a non-JSON response')
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
    if (!text) throw new Error('Empty response from Gemini')
    return text
  }

  async getStatus() {
    const ready = await this.isReady()
    return { ready, reason: ready ? undefined : 'No API key configured' }
  }
}
