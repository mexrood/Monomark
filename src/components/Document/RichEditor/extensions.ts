import StarterKit from '@tiptap/starter-kit'
import { Markdown } from 'tiptap-markdown'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import { Table, TableRow, TableHeader, TableCell } from '@tiptap/extension-table'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Highlight from '@tiptap/extension-highlight'
import Placeholder from '@tiptap/extension-placeholder'
import { createLowlight, common } from 'lowlight'
import type { Extensions } from '@tiptap/core'
import { SlashExtension } from './SlashExtension'
import { BlockId } from './BlockId'
import { RelationArrow } from './RelationArrow'
import { TrailingNode } from './TrailingNode'

// Single lowlight instance shared across all editor instances
const lowlight = createLowlight(common)

/** Build the full TipTap extension list for a vault document editor. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function buildExtensions(_vaultPath: string): Extensions {
  // Image extension extended to rewrite vault-relative paths → vault:// at render time
  const ImageExt = Image.extend({
    addNodeView() {
      return ({ node }) => {
        const img = document.createElement('img')
        const src = (node.attrs.src ?? '') as string

        if (
          src &&
          !src.startsWith('http://') &&
          !src.startsWith('https://') &&
          !src.startsWith('vault://') &&
          !src.startsWith('data:')
        ) {
          // Use vault:// protocol so images work in both dev (localhost) and prod
          const rel = src.replace(/\\/g, '/')
          img.src = `vault://${rel}`
        } else {
          img.src = src
        }

        if (node.attrs.alt) img.alt = node.attrs.alt as string
        img.style.maxWidth  = '100%'
        img.style.height    = 'auto'
        img.style.borderRadius = '3px'
        img.style.margin    = '8px 0'
        img.style.display   = 'block'

        return {
          dom: img,
          // Re-render when attributes change (e.g. src updated)
          update(updatedNode) {
            if (updatedNode.type !== node.type) return false
            const newSrc = (updatedNode.attrs.src ?? '') as string
            if (newSrc !== src) img.src = newSrc
            return true
          },
        }
      }
    },
  })

  return [
    StarterKit.configure({
      codeBlock: false,                             // replaced by CodeBlockLowlight
      link: false,                                  // replaced by standalone Link below
      trailingNode: false,                          // replaced by custom TrailingNode below
      heading:   { levels: [1, 2, 3, 4, 5, 6] },
      dropcursor: { color: 'var(--accent)', width: 2 },
    }),

    // Markdown serialisation / deserialisation (tiptap-markdown)
    Markdown.configure({
      html: false,
      tightLists: true,
      transformPastedText: true,
    }),

    // Syntax-highlighted fenced code blocks
    CodeBlockLowlight.configure({ lowlight }),

    // Task lists
    TaskList,
    TaskItem.configure({ nested: true }),

    // Tables
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,

    // Images (vault-relative → file:// path rewriting at render time)
    ImageExt.configure({ inline: false, allowBase64: false }),

    // Links (open-on-click handled manually in editorProps)
    Link.configure({ openOnClick: false }),

    // Text highlights
    Highlight.configure({ multicolor: false }),

    // Placeholder hint text
    Placeholder.configure({
      placeholder: ({ node }) =>
        node.type.name === 'heading'
          ? 'Heading'
          : 'Start writing, or type / for commands…',
      includeChildren: true,
    }),

    // Slash-command menu triggered by "/"
    SlashExtension,

    // Invisible Phase-1 block-id markers (round-trips `<!-- bid: ... -->`)
    BlockId,

    // Inline ↗ at the end of blocks with LLM-judged useful relations.
    RelationArrow,

    // Keep a clickable empty paragraph after trailing tables/code/lists.
    TrailingNode,
  ]
}
