import { getDb, isDbReady, hashText } from './db'
import {
  getCachedRelation,
  isCacheValid,
  upsertRelation,
  invalidateForBlock,
} from './relationCache'
import { findRelatedToBlock } from './search'
import { registry } from '../ai/registry'

// LLM judge over embedding-candidate pairs. Embeddings find ~10 candidates per
// block; the active LLM provider decides which of those are USEFULLY related
// and labels them. Results cache in the relations table.

const CANDIDATE_THRESHOLD = 0.85 // below previous 0.90 — LLM does the strict filtering
const CANDIDATE_LIMIT = 10
const JUDGE_RATE_LIMIT_MS = 1000 // 1 req/sec — friendly to free tiers
const JUDGE_TIMEOUT_MS = 15_000

interface BlockRow {
  id: string
  file: string
  text: string
}

interface JudgeTask {
  fromId: string
  toId: string
  similarity: number
}

const queue: JudgeTask[] = []
let processing = false
let totalUseful = 0
let totalFiltered = 0

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('Judge timeout')), ms)
    promise.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

function buildPrompt(a: BlockRow, b: BlockRow): string {
  return (
    `You are judging whether two paragraphs from a personal knowledge base are ` +
    `usefully related — i.e., reading B helps the reader of A in a concrete way.\n\n` +
    `Paragraph A (from "${a.file}"):\n"""\n${a.text}\n"""\n\n` +
    `Paragraph B (from "${b.file}"):\n"""\n${b.text}\n"""\n\n` +
    `Reply ONLY with JSON, no prose:\n` +
    `{ "useful": true|false, "label": "..." }\n\n` +
    `If useful=false, omit "label" or set it to null.\n` +
    `If useful=true, "label" is a 3-7 word phrase describing how B relates to A ` +
    `from A's perspective. Examples: "Implementation details", "Alternative approach", ` +
    `"Decision affecting this", "More detailed treatment", "Concrete example", ` +
    `"Refinement / contradiction".\n\n` +
    `Be strict. "Both mention React" is NOT useful. The bar is: would a person ` +
    `writing A want to follow the arrow to B for a concrete reason?`
  )
}

function parseJudge(text: string): { useful: boolean; label: string | null } {
  try {
    // Models sometimes wrap JSON in ```json fences or add stray prose; extract
    // the first {...} block and parse it.
    const match = text.match(/\{[\s\S]*?\}/)
    if (!match) return { useful: false, label: null }
    const parsed = JSON.parse(match[0]) as { useful?: unknown; label?: unknown }
    const useful = parsed.useful === true
    const label =
      useful && typeof parsed.label === 'string' && parsed.label.trim()
        ? parsed.label.trim()
        : null
    return { useful, label }
  } catch {
    return { useful: false, label: null }
  }
}

function fetchBlock(id: string): BlockRow | null {
  if (!isDbReady()) return null
  return (getDb()
    .prepare('SELECT id, file, text FROM blocks WHERE id = ?')
    .get(id) as BlockRow | undefined) ?? null
}

async function judgeOne(task: JudgeTask): Promise<void> {
  const a = fetchBlock(task.fromId)
  const b = fetchBlock(task.toId)
  if (!a || !b) return // either block was deleted between schedule and judge

  const hashFrom = hashText(a.text)
  const hashTo = hashText(b.text)

  // Another invalidation may have populated the cache while this task waited.
  const cached = getCachedRelation(task.fromId, task.toId)
  if (cached && isCacheValid(cached, hashFrom, hashTo)) return

  const prompt = buildPrompt(a, b)
  let answer: string
  try {
    answer = await withTimeout(
      registry.getActive().generate(prompt, { maxTokens: 80, temperature: 0.2 }),
      JUDGE_TIMEOUT_MS,
    )
  } catch (err) {
    // LLM unreachable / timeout — record as not-useful so we don't spin on it
    // until either block is edited (and invalidateForBlock wipes the cache).
    upsertRelation({
      block_id_from: task.fromId,
      block_id_to: task.toId,
      hash_from: hashFrom,
      hash_to: hashTo,
      similarity: task.similarity,
      useful: 0,
      label: null,
    })
    console.warn(`[judge] ${task.fromId} → ${task.toId} failed:`, (err as Error).message)
    return
  }

  const { useful, label } = parseJudge(answer)
  upsertRelation({
    block_id_from: task.fromId,
    block_id_to: task.toId,
    hash_from: hashFrom,
    hash_to: hashTo,
    similarity: task.similarity,
    useful: useful ? 1 : 0,
    label,
  })
  if (useful) totalUseful++
  else totalFiltered++
}

async function pumpQueue(): Promise<void> {
  if (processing) return
  processing = true
  try {
    while (queue.length > 0) {
      const task = queue.shift()!
      try {
        await judgeOne(task)
      } catch (err) {
        console.warn('[judge] unexpected error:', (err as Error).message)
      }
      await sleep(JUDGE_RATE_LIMIT_MS)
    }
    console.log(`[judge] done: ${totalUseful} useful, ${totalFiltered} filtered out`)
    totalUseful = 0
    totalFiltered = 0
  } finally {
    processing = false
  }
}

/**
 * For a block that just got (re-)indexed, find embedding candidates and queue
 * LLM judgments for pairs that aren't already cached fresh.
 *
 * No-op when no cloud/local provider is ready — the cache stays empty and we
 * try again the next time the block is saved (after invalidateForBlock wipes
 * any stale rows). This keeps us from filling the DB with `useful=0` rows just
 * because AI wasn't configured at startup.
 */
export async function scheduleJudgesFor(blockId: string): Promise<void> {
  if (!isDbReady()) return
  const provider = registry.getActive()
  if (!(await provider.isReady().catch(() => false))) return

  const fromBlock = fetchBlock(blockId)
  if (!fromBlock) return
  const hashFrom = hashText(fromBlock.text)

  const candidates = findRelatedToBlock(blockId, {
    threshold: CANDIDATE_THRESHOLD,
    limit: CANDIDATE_LIMIT,
  })
  if (candidates.length === 0) return

  let queued = 0
  for (const cand of candidates) {
    const toBlock = fetchBlock(cand.id)
    if (!toBlock) continue
    const cached = getCachedRelation(blockId, cand.id)
    if (cached && isCacheValid(cached, hashFrom, hashText(toBlock.text))) continue
    queue.push({ fromId: blockId, toId: cand.id, similarity: cand.similarity })
    queued++
  }
  if (queued > 0) {
    console.log(`[judge] queued ${queued} pair(s) for block ${blockId}`)
    void pumpQueue()
  }
}

// Re-export the cache invalidator so the indexer has a single import surface.
export { invalidateForBlock } from './relationCache'
