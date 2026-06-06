import { promises as fs } from 'fs'
import * as path from 'path'
import { getDb, isDbReady } from '../../blocks/db'
import { store } from '../../store'

function isoDate(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10)
}

interface BlockRow {
  id: string
  file: string
  line: number
  block_type: string
  text: string
  created_at: number
  updated_at: number
}

interface NeighbourRow {
  id: string
  line: number
  text: string
  block_type: string
}

/** Handler for the vault_get_block MCP tool — one block, optionally with context. */
export async function toolGetBlock(args: {
  block_id?: string
  context?: number
}): Promise<unknown> {
  if (!isDbReady()) {
    throw new Error('Memory index is not ready yet — try again in a moment.')
  }
  const blockId = String(args.block_id ?? '').trim()
  if (!blockId) throw new Error('block_id is required')

  const db = getDb()
  const block = db
    .prepare('SELECT id, file, line, block_type, text, created_at, updated_at FROM blocks WHERE id = ?')
    .get(blockId) as BlockRow | undefined
  if (!block) throw new Error(`Block not found: ${blockId}`)

  // The block may still be indexed after its file was deleted on disk.
  let fileExists = true
  const vaultPath = store.get('vaultPath') as string | undefined
  if (vaultPath) {
    try {
      await fs.access(path.join(vaultPath, block.file))
    } catch {
      fileExists = false
    }
  }

  const result: Record<string, unknown> = {
    block_id: block.id,
    text: block.text,
    file: block.file,
    line: block.line,
    type: block.block_type,
    created_at: isoDate(block.created_at),
    updated_at: isoDate(block.updated_at),
    file_exists: fileExists,
  }

  const context = Math.min(Math.max(0, Number(args.context ?? 0)), 3)
  if (context > 0) {
    const before = (
      db
        .prepare(
          'SELECT id, line, text, block_type FROM blocks WHERE file = ? AND line < ? ORDER BY line DESC LIMIT ?',
        )
        .all(block.file, block.line, context) as NeighbourRow[]
    ).reverse()
    const after = db
      .prepare(
        'SELECT id, line, text, block_type FROM blocks WHERE file = ? AND line > ? ORDER BY line ASC LIMIT ?',
      )
      .all(block.file, block.line, context) as NeighbourRow[]

    const map = (b: NeighbourRow) => ({ block_id: b.id, text: b.text, type: b.block_type })
    result.context = { before: before.map(map), after: after.map(map) }
  }

  return result
}
