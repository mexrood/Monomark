// Phase D — background one-line file summaries.
//
// On every save the indexer enqueues the file here. We debounce, then for each
// stale file (content hash changed) ask the local LLM for a one-sentence
// summary and store it in the file_summaries table. Skips silently when AI is
// off — the next save retries.

import { EventEmitter } from 'events'
import {
  isDbReady,
  hashText,
  getFileSummary,
  upsertFileSummary,
  deleteFileSummary,
} from './db'
import { aiManager } from '../ai/manager'

/** Emits 'summary' → { file, summary } whenever a summary is (re)generated. */
export const summaryEvents = new EventEmitter()

const DEBOUNCE_MS = 2500
const MAX_INPUT_CHARS = 8000
const MIN_INPUT_CHARS = 80

const PROMPT =
  'Summarize this note in ONE short sentence (max 16 words) describing what ' +
  'it is about. Output only the sentence — no quotes, no preamble.\n\n---\n'

// relPath → latest content awaiting summarization (newest content wins).
const queue = new Map<string, string>()
let timer: ReturnType<typeof setTimeout> | null = null
let processing = false

/** Strip YAML frontmatter so it doesn't dominate a short note's summary. */
function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '').trim()
}

export function enqueueSummary(relPath: string, content: string): void {
  queue.set(relPath, content)
  if (!timer) {
    timer = setTimeout(() => {
      timer = null
      void processQueue()
    }, DEBOUNCE_MS)
  }
}

export function forgetSummary(relPath: string): void {
  queue.delete(relPath)
  if (isDbReady()) deleteFileSummary(relPath)
}

async function processQueue(): Promise<void> {
  if (processing) return
  processing = true
  try {
    while (queue.size > 0) {
      const [relPath, content] = queue.entries().next().value as [string, string]
      queue.delete(relPath)
      await summarizeOne(relPath, content)
    }
  } finally {
    processing = false
  }
}

async function summarizeOne(relPath: string, content: string): Promise<void> {
  if (!isDbReady()) return

  const text = stripFrontmatter(content)
  if (text.length < MIN_INPUT_CHARS) return

  const hash = hashText(text)
  const existing = getFileSummary(relPath)
  if (existing && existing.hash === hash) return // unchanged — keep current summary

  let summary: string
  try {
    summary = await aiManager.prompt(PROMPT + text.slice(0, MAX_INPUT_CHARS))
  } catch {
    return // AI disabled / no model — retry on the next save
  }

  const clean = summary.trim().replace(/^["']|["']$/g, '').trim()
  if (!clean) return

  upsertFileSummary(relPath, clean, hash)
  summaryEvents.emit('summary', { file: relPath, summary: clean })
}
