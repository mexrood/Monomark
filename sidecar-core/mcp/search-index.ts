/**
 * Main-process MiniSearch index.
 * Built once when the vault loads, updated on watcher events.
 * Used by the vault.search MCP tool so it works even when the renderer window is hidden.
 */
import MiniSearch from 'minisearch'
import { promises as fs } from 'fs'
import * as path from 'path'

interface DocEntry {
  id: string       // absolute path
  title: string
  content: string
}

let index = createIndex()

function createIndex() {
  return new MiniSearch<DocEntry>({
    fields: ['title', 'content'],
    storeFields: ['title'],
    searchOptions: {
      boost: { title: 2 },
      prefix: true,
      fuzzy: 0.2,
    },
  })
}

async function walkMd(dir: string): Promise<string[]> {
  const files: string[] = []
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return files
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      files.push(...(await walkMd(full)))
    } else if (e.isFile() && e.name.endsWith('.md')) {
      files.push(full)
    }
  }
  return files
}

export async function buildIndex(vaultPath: string) {
  const files = await walkMd(vaultPath)
  const docs = await Promise.all(
    files.map(async (f) => ({
      id: f,
      title: path.basename(f, '.md'),
      content: await fs.readFile(f, 'utf-8').catch(() => ''),
    }))
  )
  index = createIndex()
  if (docs.length) index.addAll(docs)
}

export async function updateFile(filePath: string) {
  try {
    const content = await fs.readFile(filePath, 'utf-8')
    const title = path.basename(filePath, '.md')
    if (index.has(filePath)) index.remove({ id: filePath, title, content: '' })
    index.add({ id: filePath, title, content })
  } catch {
    // File deleted
    if (index.has(filePath)) {
      index.remove({ id: filePath, title: '', content: '' })
    }
  }
}

export interface SearchResult {
  path: string
  score: number
  snippet: string
}

export function searchIndex(
  vaultPath: string,
  query: string,
  limit = 20
): SearchResult[] {
  const raw = index.search(query).slice(0, Math.min(limit, 100))
  return raw.map((r) => {
    const relPath = r.id
      .replace(/\\/g, '/')
      .replace(vaultPath.replace(/\\/g, '/').replace(/\/?$/, '/'), '')
    return {
      path: relPath,
      score: r.score,
      snippet: extractSnippet(r.id, query),
    }
  })
}

/** Rough snippet — we don't have content in storeFields so just return title context */
function extractSnippet(absPath: string, query: string): string {
  // Content not stored in index (memory). Return the path as context.
  // Full snippet would require re-reading the file — acceptable for V1.
  return absPath.replace(/\\/g, '/').split('/').slice(-3).join('/')
}
