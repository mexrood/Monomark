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

/**
 * Walk the editor document and make sure every block-level element is
 * followed by a BlockId node, regenerating any duplicate IDs. Dispatches a
 * single transaction (selection is mapped, so the cursor is preserved) and
 * returns whether anything changed.
 *
 * Idempotent — running it on an already-tagged document is a no-op.
 */
export function ensureBlockIdsInEditor(editor: Editor): boolean {
  const { state } = editor
  const { doc, schema } = state
  const blockIdType = schema.nodes.blockId
  if (!blockIdType) return false

  const tr = state.tr
  const seen = new Set<string>()

  // Pass 1 — regenerate missing/duplicate IDs on existing BlockId nodes.
  doc.descendants((node, pos) => {
    if (node.type !== blockIdType) return true
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

  // Pass 2 — collect positions that need a fresh BlockId inserted.
  const inserts: number[] = []

  doc.forEach((node, offset, index) => {
    if (LIST_NODES.has(node.type.name)) {
      // Each list item should end with a BlockId as its last child.
      node.forEach((item, itemOffset) => {
        const itemContentEnd = offset + 1 + itemOffset + 1 + item.content.size
        const last = item.lastChild
        if (!last || last.type !== blockIdType) {
          inserts.push(itemContentEnd)
        }
      })
    } else if (CONTENT_BLOCKS.has(node.type.name) && !isEmptyBlock(node)) {
      const next = index + 1 < doc.childCount ? doc.child(index + 1) : null
      if (!next || next.type !== blockIdType) {
        inserts.push(offset + node.nodeSize)
      }
    }
  })

  // Apply inserts high→low so earlier positions stay valid.
  inserts.sort((a, b) => b - a)
  for (const pos of inserts) {
    let fresh = newBlockId()
    while (seen.has(fresh)) fresh = newBlockId()
    seen.add(fresh)
    tr.insert(pos, blockIdType.create({ bid: fresh }))
  }

  if (tr.steps.length === 0) return false
  tr.setMeta('addToHistory', false)
  editor.view.dispatch(tr)
  return true
}
