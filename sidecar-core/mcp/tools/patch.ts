import { promises as fs } from 'fs'
import { safeResolveInVault, VaultError } from '../paths'
import { store } from '../../store'

// Surgical, token-efficient edits to existing markdown files.
//
// The token-economy alternative to vault_write: instead of re-emitting an
// entire file (thousands of tokens) to change a few sentences, the caller
// sends a small list of operations (~30 tokens each). For a 50 KB doc this
// is roughly 100× cheaper.

type PatchOp =
  | { op: 'insert_after_block_id'; bid: string; text: string }
  | { op: 'insert_before_block_id'; bid: string; text: string }
  | { op: 'replace'; find: string; replace: string }
  | { op: 'replace_all'; find: string; replace: string }
  | { op: 'delete_block'; bid: string }

interface OpResult {
  op: string
  ok: boolean
  detail?: string
}

const ANY_BID_RE = /^\s*<!--\s*bid:\s*[a-f0-9]{8}\s*-->\s*$/

function escapeForRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Line index of the bid marker for `bid`, or -1 if missing. */
function findBidLine(lines: string[], bid: string): number {
  const safe = bid.replace(/[^a-f0-9]/gi, '')
  if (safe.length !== 8) return -1
  const re = new RegExp(`^\\s*<!--\\s*bid:\\s*${safe}\\s*-->\\s*$`)
  return lines.findIndex(l => re.test(l))
}

/** First line of the block whose bid marker lives at `bidIdx`. */
function findBlockStart(lines: string[], bidIdx: number): number {
  let start = 0
  for (let i = bidIdx - 1; i >= 0; i--) {
    if (ANY_BID_RE.test(lines[i])) {
      start = i + 1
      break
    }
  }
  while (start < bidIdx && lines[start].trim() === '') start++
  return start
}

function applyOp(content: string, op: PatchOp): { content: string; result: OpResult } {
  switch (op.op) {
    case 'replace': {
      if (!content.includes(op.find)) {
        return { content, result: { op: op.op, ok: false, detail: 'find string not found' } }
      }
      return { content: content.replace(op.find, op.replace), result: { op: op.op, ok: true } }
    }

    case 'replace_all': {
      const re = new RegExp(escapeForRegex(op.find), 'g')
      const matches = content.match(re)
      const n = matches ? matches.length : 0
      if (n === 0) {
        return { content, result: { op: op.op, ok: false, detail: 'find string not found' } }
      }
      return {
        content: content.replace(re, op.replace),
        result: { op: op.op, ok: true, detail: `${n} replacement(s)` },
      }
    }

    case 'insert_after_block_id': {
      const lines = content.split('\n')
      const idx = findBidLine(lines, op.bid)
      if (idx === -1) {
        return { content, result: { op: op.op, ok: false, detail: `bid ${op.bid} not found` } }
      }
      // The bid marker is normally followed by a blank line. Insert the new
      // text + a trailing blank so the next block stays separated.
      const insertion = ['', op.text, '']
      lines.splice(idx + 1, 0, ...insertion)
      return { content: lines.join('\n'), result: { op: op.op, ok: true } }
    }

    case 'insert_before_block_id': {
      const lines = content.split('\n')
      const idx = findBidLine(lines, op.bid)
      if (idx === -1) {
        return { content, result: { op: op.op, ok: false, detail: `bid ${op.bid} not found` } }
      }
      const start = findBlockStart(lines, idx)
      lines.splice(start, 0, op.text, '')
      return { content: lines.join('\n'), result: { op: op.op, ok: true } }
    }

    case 'delete_block': {
      const lines = content.split('\n')
      const idx = findBidLine(lines, op.bid)
      if (idx === -1) {
        return { content, result: { op: op.op, ok: false, detail: `bid ${op.bid} not found` } }
      }
      const start = findBlockStart(lines, idx)
      let end = idx + 1
      if (lines[end] !== undefined && lines[end].trim() === '') end++
      lines.splice(start, end - start)
      return { content: lines.join('\n'), result: { op: op.op, ok: true } }
    }

    default: {
      const unknown = (op as { op?: string }).op ?? 'unknown'
      return { content, result: { op: unknown, ok: false, detail: 'unknown op' } }
    }
  }
}

export async function toolPatch(args: { path?: string; operations?: PatchOp[] }) {
  if (!args.path) throw new VaultError('invalid_args', 'path is required')
  if (!Array.isArray(args.operations) || args.operations.length === 0) {
    throw new VaultError('invalid_args', 'operations array is required and non-empty')
  }

  const vaultPath = store.get('vaultPath') as string | undefined
  if (!vaultPath) throw new Error('No vault configured')

  const absPath = await safeResolveInVault(vaultPath, args.path)

  let original: string
  try {
    original = await fs.readFile(absPath, 'utf-8')
  } catch {
    throw new VaultError('not_found', `File not found: ${args.path}`)
  }

  let content = original
  const results: OpResult[] = []
  for (const op of args.operations) {
    const next = applyOp(content, op)
    content = next.content
    results.push(next.result)
  }

  const changed = content !== original
  if (changed) {
    await fs.writeFile(absPath, content, 'utf-8')
  }

  return {
    path: args.path,
    bytes_before: original.length,
    bytes_after: content.length,
    changed,
    operations: results,
  }
}
