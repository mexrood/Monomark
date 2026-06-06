import { Node, mergeAttributes, type Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'

/**
 * BlockId — an invisible block node that carries a Phase-1 block ID.
 *
 * In the file these are `<!-- bid: a3f9c2d1 -->` HTML comments. TipTap is a
 * WYSIWYG editor configured with `Markdown({ html: false })`, which would
 * otherwise strip HTML comments on parse — so this extension teaches
 * tiptap-markdown to round-trip them as a real (but display:none) node.
 * Without it block IDs would not survive an edit/save cycle.
 */

/** 8 hex chars from the Web Crypto RNG. */
function newBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(4))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

const BID_COMMENT = /^<!--\s*bid:\s*([a-f0-9]{8})\s*-->\s*$/

/** Block-level content nodes that should each be followed by a BlockId. */
const CONTENT_BLOCKS = new Set([
  'paragraph',
  'heading',
  'codeBlock',
  'blockquote',
  'table',
  'image',
])
const LIST_NODES = new Set(['bulletList', 'orderedList', 'taskList'])

export const BlockId = Node.create({
  name: 'blockId',
  group: 'block',
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      bid: {
        default: null,
        parseHTML: el => el.getAttribute('data-bid'),
        renderHTML: attrs => (attrs.bid ? { 'data-bid': attrs.bid } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-bid]' }]
  },

  renderHTML({ HTMLAttributes }) {
    // Invisible: present in the document, never shown to the user.
    return [
      'div',
      mergeAttributes(HTMLAttributes, { class: 'mm-block-id', style: 'display:none' }),
    ]
  },

  addStorage() {
    return {
      markdown: {
        serialize(state: { write(s: string): void; closeBlock(n: PMNode): void }, node: PMNode) {
          state.write(`<!-- bid: ${node.attrs.bid ?? ''} -->`)
          state.closeBlock(node)
        },
        parse: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setup(markdownit: any) {
            if (markdownit.__mmBlockIdRule) return
            markdownit.__mmBlockIdRule = true

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const rule = (state: any, startLine: number, _end: number, silent: boolean) => {
              const start = state.bMarks[startLine] + state.tShift[startLine]
              const max = state.eMarks[startLine]
              const text = state.src.slice(start, max)
              const m = text.match(BID_COMMENT)
              if (!m) return false
              if (silent) return true
              const token = state.push('block_id', 'div', 0)
              token.map = [startLine, startLine + 1]
              token.meta = { bid: m[1] }
              token.block = true
              state.line = startLine + 1
              return true
            }

            // `alt: ['paragraph']` lets the rule terminate a paragraph even
            // with no blank line before the comment — otherwise a
            // `<!-- bid -->` directly under a paragraph is swallowed as text.
            markdownit.block.ruler.before('paragraph', 'block_id', rule, {
              alt: ['paragraph', 'blockquote', 'list'],
            })
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            markdownit.renderer.rules.block_id = (tokens: any[], idx: number) =>
              `<div data-bid="${tokens[idx].meta.bid}"></div>\n`
          },
        },
      },
    }
  },
})

function isEmptyBlock(node: PMNode): boolean {
  return (
    (node.type.name === 'paragraph' || node.type.name === 'heading') &&
    node.content.size === 0
  )
}

/** Item node types that live inside a list. */
const LIST_ITEM_NODES = new Set(['listItem', 'taskItem'])

/** True if the position resolves to somewhere inside a list/list-item. */
function isInsideList(doc: PMNode, pos: number): boolean {
  const $pos = doc.resolve(pos)
  for (let d = $pos.depth; d > 0; d--) {
    const name = $pos.node(d).type.name
    if (LIST_NODES.has(name) || LIST_ITEM_NODES.has(name)) return true
  }
  return false
}

/**
 * Walk the editor document and make sure every **top-level** block element is
 * followed by a BlockId node, regenerating duplicate IDs. List items are
 * deliberately excluded: block-id atoms living inside list items break cursor
 * movement, item merging and copy-paste, so any found inside a list are
 * stripped (which also cleans them out of the file on the next save).
 *
 * Dispatches a single transaction (selection is mapped, so the cursor is
 * preserved) and returns whether anything changed. Idempotent.
 */
export function ensureBlockIdsInEditor(editor: Editor): boolean {
  const { state } = editor
  const { doc, schema } = state
  const blockIdType = schema.nodes.blockId
  if (!blockIdType) return false

  const tr = state.tr
  const seen = new Set<string>()

  // Pass 1 — dedupe IDs on top-level BlockId nodes; mark list-inner ones for
  // removal. setNodeAttribute doesn't shift positions, so original positions
  // stay valid for the deletes/inserts applied afterwards.
  const removals: { from: number; to: number }[] = []
  doc.descendants((node, pos) => {
    if (node.type !== blockIdType) return true
    if (isInsideList(doc, pos)) {
      removals.push({ from: pos, to: pos + node.nodeSize })
      return true
    }
    const bid = node.attrs.bid as string | null
    if (!bid || seen.has(bid)) {
      let fresh = newBlockId()
      while (seen.has(fresh)) fresh = newBlockId()
      tr.setNodeAttribute(pos, 'bid', fresh)
      seen.add(fresh)
    } else {
      seen.add(bid)
    }
    return true
  })

  // Pass 2 — collect insert positions for top-level content blocks only.
  // Lists are skipped entirely (no per-item or per-list block-ids).
  const inserts: number[] = []
  doc.forEach((node, offset, index) => {
    if (LIST_NODES.has(node.type.name)) return
    if (CONTENT_BLOCKS.has(node.type.name) && !isEmptyBlock(node)) {
      const next = index + 1 < doc.childCount ? doc.child(index + 1) : null
      if (!next || next.type !== blockIdType) {
        inserts.push(offset + node.nodeSize)
      }
    }
  })

  // Apply removals first (descending so positions stay valid), then inserts
  // mapped through the transaction so they land at the right spot.
  removals.sort((a, b) => b.from - a.from)
  for (const r of removals) tr.delete(r.from, r.to)

  inserts.sort((a, b) => b - a)
  for (const pos of inserts) {
    let fresh = newBlockId()
    while (seen.has(fresh)) fresh = newBlockId()
    seen.add(fresh)
    tr.insert(tr.mapping.map(pos), blockIdType.create({ bid: fresh }))
  }

  if (tr.steps.length === 0) return false
  tr.setMeta('addToHistory', false)
  editor.view.dispatch(tr)
  return true
}
