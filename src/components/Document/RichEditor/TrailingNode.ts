import { Extension } from '@tiptap/core'
import { Plugin, PluginKey } from '@tiptap/pm/state'

/**
 * TrailingNode — keeps an empty paragraph at the very end of the document when
 * it would otherwise end with a non-text block (table, code block, list, etc.),
 * so the user can always click below the last block and start typing — the way
 * Notion always leaves a clickable empty line at the bottom.
 *
 * It deliberately does NOT add a paragraph when the document already ends with
 * a paragraph/heading, to avoid churning files with stray trailing blank lines.
 * Invisible block-id markers at the tail are ignored when finding the last node.
 */
const NEEDS_TRAILING = new Set([
  'table',
  'codeBlock',
  'horizontalRule',
  'image',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
])

export const TrailingNode = Extension.create({
  name: 'trailingNode',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('trailingNode'),
        appendTransaction(_transactions, _oldState, state) {
          const { doc, tr, schema } = state
          const paragraph = schema.nodes.paragraph
          if (!paragraph) return null

          // Find the last child that isn't an invisible block-id marker.
          let i = doc.childCount - 1
          while (i >= 0 && doc.child(i).type.name === 'blockId') i--
          if (i < 0) return null

          const last = doc.child(i)
          if (!NEEDS_TRAILING.has(last.type.name)) return null

          // The last real node is a block that needs an escape hatch below it,
          // and (since it's the last non-blockId node) nothing follows it yet.
          return tr.insert(doc.content.size, paragraph.create())
        },
      }),
    ]
  },
})
