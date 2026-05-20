import { promises as fs } from 'fs'
import * as path from 'path'
import { type Block } from './parser'
import { ensureBlockIds, resolveBlockIds } from './injectIds'
import { getDb, isDbReady, schedulePersist, persistNow, serializeEmbedding, hashText } from './db'
import { embed, initEmbedder, isReady } from './embedder'
import { setIndexStatus } from '../ipc/index'
import { markSelfWrite } from '../watcher'
import { enqueueSummary, forgetSummary } from './summarizer'
import { scheduleJudgesFor, invalidateForBlock } from './relationJudge'

export interface IndexResult {
  inserted: number
  updated: number
  deleted: number
  skipped: number
}

const EMPTY: IndexResult = { inserted: 0, updated: 0, deleted: 0, skipped: 0 }

/** Number of leading lines occupied by a frontmatter block. */
function frontmatterLineCount(frontmatter: string): number {
  if (!frontmatter) return 0
  return frontmatter.split('\n').length - 1
}

/**
 * Best-effort plain text for a block. The Phase 1 parser only fills `text`
 * for paragraphs/headings/code, so for list items / blockquotes / tables we
 * recover it from the body lines, stripping bullet/quote markers and any
 * embedded `<!-- bid: ... -->` comment.
 */
function blockText(bodyLines: string[], block: Block): string {
  if (block.text.trim()) return block.text.trim()
  return bodyLines
    .slice(block.startLine - 1, block.endLine)
    .filter(l => !/^\s*<!--\s*bid:\s*[a-f0-9]{8}\s*-->\s*$/.test(l))
    .map(l => l.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, '').replace(/^\s*>\s?/, ''))
    .join(' ')
    .trim()
}

/**
 * Sync the DB rows for one file with its current block contents.
 * Unchanged blocks (matching hash) are skipped — no re-embedding.
 */
export async function indexFile(relPath: string, content: string): Promise<IndexResult> {
  if (!isReady() || !isDbReady()) return { ...EMPTY }

  const db = getDb()
  const { frontmatter, body, blocks } = resolveBlockIds(content)
  const bodyLines = body.split(/\r?\n/)
  const fmLines = frontmatterLineCount(frontmatter)
  const result: IndexResult = { inserted: 0, updated: 0, deleted: 0, skipped: 0 }

  const existing = db
    .prepare('SELECT id, hash FROM blocks WHERE file = ?')
    .all(relPath) as { id: string; hash: string }[]
  const existingMap = new Map(existing.map(e => [e.id, e.hash]))
  const seenIds = new Set<string>()
  /** Blocks whose text changed this pass — relations need re-judging. */
  const changedIds: string[] = []
  const now = Date.now()

  const insertStmt = db.prepare(`
    INSERT INTO blocks (id, file, line, block_type, text, embedding, hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const updateStmt = db.prepare(`
    UPDATE blocks
    SET file = ?, line = ?, block_type = ?, text = ?, embedding = ?, hash = ?, updated_at = ?
    WHERE id = ?
  `)

  for (const block of blocks) {
    if (!block.id) continue // every block should have an ID after Phase 1
    seenIds.add(block.id)

    const text = blockText(bodyLines, block)
    if (!text) { result.skipped++; continue }

    const newHash = hashText(text)
    const existingHash = existingMap.get(block.id)
    if (existingHash === newHash) { result.skipped++; continue }

    const blob = serializeEmbedding(await embed(text))
    const line = block.startLine + fmLines

    if (existingHash !== undefined) {
      updateStmt.run(relPath, line, block.type, text, blob, newHash, now, block.id)
      // Stored text changed → any prior LLM-judged relations are stale.
      invalidateForBlock(block.id)
      changedIds.push(block.id)
      result.updated++
    } else {
      try {
        insertStmt.run(block.id, relPath, line, block.type, text, blob, newHash, now, now)
        changedIds.push(block.id)
        result.inserted++
      } catch (err) {
        // Cross-file ID collision (Phase 1 dedup is per-file) — skip, don't crash.
        console.warn(`[indexer] could not insert block ${block.id}:`, err)
        result.skipped++
      }
    }
  }

  // Blocks removed from the file → drop their rows.
  const deleteStmt = db.prepare('DELETE FROM blocks WHERE id = ?')
  for (const e of existing) {
    if (!seenIds.has(e.id)) {
      deleteStmt.run(e.id)
      invalidateForBlock(e.id)
      result.deleted++
    }
  }

  if (result.inserted + result.updated + result.deleted > 0) schedulePersist()

  // Phase D — refresh this file's one-line summary in the background.
  enqueueSummary(relPath, content)

  // Phase: LLM-judged relations — queue judgments for blocks whose text moved.
  for (const id of changedIds) void scheduleJudgesFor(id)

  return result
}

/** Remove every indexed block belonging to a file. */
export function deleteFileIndex(relPath: string): number {
  if (!isDbReady()) return 0
  const db = getDb()
  // Collect ids first so we can wipe their relations too.
  const blockIds = db
    .prepare('SELECT id FROM blocks WHERE file = ?')
    .all(relPath) as { id: string }[]
  const changes = db.prepare('DELETE FROM blocks WHERE file = ?').run(relPath).changes
  if (changes > 0) {
    for (const { id } of blockIds) invalidateForBlock(id)
    schedulePersist()
  }
  forgetSummary(relPath)
  return changes
}

/** Recursively collect vault-relative paths of all .md files. */
async function collectMarkdownFiles(dir: string, vaultPath: string, out: string[]): Promise<void> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    // Skip hidden (.monomark, .git…) and system (_attachments) folders.
    if (entry.name.startsWith('.') || entry.name.startsWith('_')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      await collectMarkdownFiles(full, vaultPath, out)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      out.push(path.relative(vaultPath, full).replace(/\\/g, '/'))
    }
  }
}

/** Index every markdown file in the vault, reporting progress per file. */
export async function indexFullVault(
  vaultPath: string,
  onProgress?: (current: number, total: number) => void,
): Promise<void> {
  const relPaths: string[] = []
  await collectMarkdownFiles(vaultPath, vaultPath, relPaths)

  const total = relPaths.length
  console.log('[indexer] full vault index:', total, 'markdown files')
  let idMigrated = 0
  for (let i = 0; i < total; i++) {
    const relPath = relPaths[i]
    try {
      const abs = path.join(vaultPath, relPath)
      let content = await fs.readFile(abs, 'utf-8')
      // Existing files may never have been saved through the editor and so
      // carry no block IDs. Inject them now and persist back to the file —
      // this is the one-time "initial migration". markSelfWrite stops the
      // watcher from treating it as an external change.
      const ensured = ensureBlockIds(content)
      if (ensured.changed) {
        markSelfWrite(abs)
        await fs.writeFile(abs, ensured.content, 'utf-8')
        content = ensured.content
        idMigrated++
      }
      await indexFile(relPath, content)
    } catch (err) {
      console.error(`[indexer] failed to index ${relPath}:`, err)
    }
    onProgress?.(i + 1, total)
    // Yield to the event loop so the UI stays responsive.
    await new Promise(resolve => setImmediate(resolve))
  }
  if (idMigrated > 0) console.log('[indexer] injected block IDs into', idMigrated, 'files')
  persistNow() // durable flush after a full pass
}

/**
 * High-level startup routine: init the embedder, and on a fresh DB run a full
 * vault index. Broadcasts status to the renderer throughout. Safe to call on
 * app start and whenever the vault folder changes.
 */
export async function startIndexing(vaultPath: string): Promise<void> {
  console.log('[indexer] startIndexing:', vaultPath)
  setIndexStatus({ kind: 'initializing' })
  try {
    await initEmbedder(vaultPath)
    console.log('[indexer] embedder ready')
    const { c } = getDb().prepare('SELECT COUNT(*) as c FROM blocks').get() as { c: number }
    console.log('[indexer] existing indexed blocks:', c)
    if (c === 0) {
      await indexFullVault(vaultPath, (current, total) => {
        if (current === 1 || current === total || current % 25 === 0) {
          console.log(`[indexer] indexing ${current}/${total}`)
        }
        setIndexStatus({ kind: 'indexing', current, total })
      })
    }
    console.log('[indexer] done')
    setIndexStatus({ kind: 'ready' })
  } catch (err) {
    console.error('[indexer] startIndexing failed:', err)
    setIndexStatus({ kind: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
