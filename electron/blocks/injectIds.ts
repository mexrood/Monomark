import { parseBlocks, type Block, type BidMarker } from './parser'
import { generateBlockId } from './idGenerator'

export interface InjectResult {
  /** Content with every block guaranteed a unique block-id comment. */
  content: string
  /** Block IDs generated during this pass (new blocks + dedup replacements). */
  added: string[]
  /** Whether `content` differs from the input. */
  changed: boolean
}

/** Content indentation of a list item, derived from its bullet/number marker. */
function listItemIndent(firstLine: string): string {
  const m = firstLine.match(/^(\s*(?:[-*+]|\d+[.)])\s+)/)
  return m ? ' '.repeat(m[1].length) : '  '
}

/**
 * Find the marker that belongs to a block.
 *  - list items: the marker lives on the item's last line (indented inside it)
 *  - every other block: the marker is the next non-blank line, with only
 *    blank lines in between and no other block starting in the gap.
 */
function findMarker(
  block: Block,
  markers: BidMarker[],
  blocks: Block[],
  lines: string[],
): BidMarker | null {
  if (block.type === 'list_item') {
    let best: BidMarker | null = null
    for (const m of markers) {
      if (m.line >= block.startLine && m.line <= block.endLine) {
        if (!best || m.line > best.line) best = m
      }
    }
    return best
  }

  let best: BidMarker | null = null
  for (const m of markers) {
    if (m.line <= block.endLine) continue
    if (best && m.line >= best.line) continue
    // Every line strictly between the block and the marker must be blank.
    let blank = true
    for (let ln = block.endLine + 1; ln < m.line; ln++) {
      if ((lines[ln - 1] ?? '').trim() !== '') { blank = false; break }
    }
    if (!blank) continue
    // No other block may start inside the gap.
    const intervening = blocks.some(
      b => b !== block && b.startLine > block.endLine && b.startLine < m.line,
    )
    if (intervening) continue
    best = m
  }
  return best
}

/**
 * Ensure every block in `content` has a unique `<!-- bid: ... -->` comment.
 * Adds IDs to blocks that lack one, regenerates duplicates, and removes
 * orphaned markers (comments left behind by a deleted block).
 */
export function ensureBlockIds(content: string): InjectResult {
  const { frontmatter, body, blocks, markers } = parseBlocks(content)

  if (blocks.length === 0) {
    return { content, added: [], changed: false }
  }

  const lines = body.split(/\r?\n/)
  const eol = body.includes('\r\n') ? '\r\n' : '\n'
  const added: string[] = []

  // 1. Pair each block with its existing marker (if any).
  const consumed = new Set<BidMarker>()
  const pairs = blocks.map(block => {
    const marker = findMarker(block, markers, blocks, lines)
    if (marker) consumed.add(marker)
    return { block, marker }
  })

  // 2. Adopt the marker's ID, or generate one for an unmarked block.
  for (const { block, marker } of pairs) {
    if (marker) {
      block.id = marker.id
    } else {
      block.id = generateBlockId()
      added.push(block.id)
    }
  }

  // 3. Regenerate any duplicate IDs (e.g. a block copy-pasted with its marker).
  const seen = new Set<string>()
  for (const { block } of pairs) {
    if (block.id && seen.has(block.id)) {
      block.id = generateBlockId()
      added.push(block.id)
    }
    if (block.id) seen.add(block.id)
  }

  // 4. Build line operations.
  type Op =
    | { kind: 'replace'; line: number; text: string }
    | { kind: 'insert'; index: number; text: string }
    | { kind: 'delete'; line: number }
  const ops: Op[] = []

  for (const { block, marker } of pairs) {
    const id = block.id as string
    if (marker) {
      if (marker.id !== id) {
        ops.push({
          kind: 'replace',
          line: marker.line,
          text: `${marker.indent}<!-- bid: ${id} -->`,
        })
      }
    } else if (block.type === 'list_item') {
      const indent = listItemIndent(lines[block.startLine - 1] ?? '')
      ops.push({ kind: 'insert', index: block.endLine, text: `${indent}<!-- bid: ${id} -->` })
    } else {
      ops.push({ kind: 'insert', index: block.endLine, text: `<!-- bid: ${id} -->` })
    }
  }

  // Orphaned markers — a comment whose block no longer exists.
  for (const m of markers) {
    if (!consumed.has(m)) ops.push({ kind: 'delete', line: m.line })
  }

  if (ops.length === 0) {
    return { content, added: [], changed: false }
  }

  // 5. Apply, bottom-up, so earlier line indices stay valid.
  const sortKey = (op: Op) => (op.kind === 'insert' ? op.index : op.line - 1)
  ops.sort((a, b) => sortKey(b) - sortKey(a))
  for (const op of ops) {
    if (op.kind === 'replace') lines[op.line - 1] = op.text
    else if (op.kind === 'delete') lines.splice(op.line - 1, 1)
    else lines.splice(op.index, 0, op.text)
  }

  const newContent = frontmatter + lines.join(eol)
  return { content: newContent, added, changed: newContent !== content }
}

/**
 * Parse content and resolve each block's existing ID from its `<!-- bid -->`
 * marker. Unlike `parseBlocks` (which always returns `id: null`), the blocks
 * returned here carry the IDs already present in the file. Blocks with no
 * marker keep `id: null`.
 */
export function resolveBlockIds(content: string): {
  frontmatter: string
  body: string
  blocks: Block[]
} {
  const { frontmatter, body, blocks, markers } = parseBlocks(content)
  const lines = body.split(/\r?\n/)
  for (const block of blocks) {
    const marker = findMarker(block, markers, blocks, lines)
    if (marker) block.id = marker.id
  }
  return { frontmatter, body, blocks }
}
