import { searchBlocks } from '../../blocks/search'
import { aiManager } from '../../ai/manager'
import { VaultError } from '../paths'

// Phase C — the "token economy" tool. Instead of Claude reading whole files,
// it asks a question; we semantically search the vault, then distil the top
// blocks with the local LLM into a few key sentences. Claude gets ~2-5K tokens
// of signal instead of ~50K of raw notes.

const MAX_BLOCKS = 30

// Below this assembled size, distillation wouldn't save enough tokens to be
// worth the latency — return the raw blocks instead (the plan's passthrough).
const PASSTHROUGH_CHARS = 1500

// Cap fed to the local model — small GGUF models have a short context window.
const MAX_DISTILL_CHARS = 12000

interface CacheEntry {
  result: unknown
  ts: number
}
const cache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000

/**
 * `vault_smart_context` — semantic search + local-LLM distillation.
 * Degrades gracefully: if the LLM is unavailable it returns the raw blocks
 * (still useful context) with `distilled: false` rather than failing.
 */
export async function toolSmartContext(args: { query?: string; limit?: number }) {
  const query = (args.query ?? '').trim()
  if (!query) throw new VaultError('invalid_args', 'query is required')

  const limit = Math.min(Math.max(args.limit ?? MAX_BLOCKS, 1), 50)
  const cacheKey = `${limit}::${query}`

  const cached = cache.get(cacheKey)
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return cached.result
  }

  let blocks
  try {
    blocks = await searchBlocks(query, { limit })
  } catch (err) {
    throw new VaultError(
      'index_unavailable',
      `Vault index not ready: ${(err as Error).message}`
    )
  }

  const store = (result: unknown) => {
    cache.set(cacheKey, { result, ts: Date.now() })
    return result
  }

  if (blocks.length === 0) {
    return store({
      query,
      distilled: false,
      context: '',
      sources: [],
      block_count: 0,
      note: 'No semantically relevant blocks found in the vault.',
    })
  }

  const sources = [...new Set(blocks.map(b => b.file))]
  const assembled = blocks.map(b => `[${b.file}]\n${b.text}`).join('\n\n')

  // Small context — distillation wouldn't pay for itself.
  if (assembled.length <= PASSTHROUGH_CHARS) {
    return store({
      query,
      distilled: false,
      context: assembled,
      sources,
      block_count: blocks.length,
    })
  }

  const prompt =
    `From the following excerpts of the user's notes, extract the key points ` +
    `relevant to this query: "${query}". Respond with 5-10 concise, factual ` +
    `sentences. Do not add any preamble.\n\n---\n` +
    assembled.slice(0, MAX_DISTILL_CHARS)

  let distilled: string
  try {
    distilled = await aiManager.prompt(prompt)
  } catch (err) {
    // LLM unavailable — degrade to raw blocks rather than failing the call.
    return store({
      query,
      distilled: false,
      context: assembled.slice(0, MAX_DISTILL_CHARS),
      sources,
      block_count: blocks.length,
      note: `Local AI unavailable (${(err as Error).message}); returned raw blocks.`,
    })
  }

  console.log(
    `[smart-context] "${query}" → ${blocks.length} blocks → ${distilled.length} chars`
  )
  return store({
    query,
    distilled: true,
    context: distilled.trim(),
    sources,
    block_count: blocks.length,
  })
}
