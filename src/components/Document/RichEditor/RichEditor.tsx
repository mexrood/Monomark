import React, { useEffect, useRef, useState } from 'react'
import { scrollRegistry } from '../../../utils/scrollRegistry'
import { useEditor, EditorContent } from '@tiptap/react'
import { useVaultStore } from '../../../store/useVaultStore'
import { useAutoSave } from '../../../hooks/useAutoSave'
import { attachImageFromBlob } from '../../../utils/attachImage'
import { splitFrontmatter, joinFrontmatter } from '../../../utils/frontmatter'
import { buildExtensions } from './extensions'
import { FrontmatterCard } from './FrontmatterCard'
import { FormattingBubbleMenu } from './FormattingBubbleMenu'
import { DocumentOutline } from './DocumentOutline'
import styles from './RichEditor.module.css'

export const RichEditor: React.FC = () => {
  const document   = useVaultStore(s => s.document)
  const updateContent = useVaultStore(s => s.updateContent)
  const vaultPath  = useVaultStore(s => s.vaultPath)
  useAutoSave()

  const scrollRef = useRef<HTMLDivElement>(null)
  // Mirror the scroll element in state so child components (DocumentOutline)
  // re-render once the ref is populated after mount.
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)

  useEffect(() => {
    scrollRegistry.set(scrollRef.current)
    setScrollEl(scrollRef.current)
    return () => scrollRegistry.set(null)
  }, [])

  // Keep the front-matter block in a ref so TipTap never sees it
  const frontmatterRef = useRef('')

  const rawContent = document.kind === 'vault' ? document.content : ''

  // Stable "file key" — recreate the editor instance when the open file changes
  const fileKey = document.kind === 'vault' ? document.path : ''

  const editor = useEditor(
    {
      extensions: buildExtensions(vaultPath ?? ''),

      content: (() => {
        const { frontmatter, body } = splitFrontmatter(rawContent)
        frontmatterRef.current = frontmatter
        // tiptap-markdown parses the markdown string automatically
        return body
      })(),

      autofocus: false,

      onUpdate({ editor: e }) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const body = (e.storage as Record<string, any>).markdown.getMarkdown() as string
        updateContent(joinFrontmatter(frontmatterRef.current, body))
      },

      editorProps: {
        // ── Image paste ──────────────────────────────────────────────────
        handlePaste(view, event) {
          const items = event.clipboardData?.items
          if (!items) return false

          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const blob = item.getAsFile()
              if (!blob) continue
              attachImageFromBlob(blob).then(relPath => {
                const { schema } = view.state
                const node = schema.nodes.image?.create({ src: relPath })
                if (!node) return
                const tr = view.state.tr.replaceSelectionWith(node)
                view.dispatch(tr)
              })
              return true
            }
          }
          return false
        },

        // ── Image drop ───────────────────────────────────────────────────
        handleDrop(view, event, _slice, moved) {
          // Let ProseMirror handle block reorders (moved = internal drag)
          if (moved) return false

          const files = event.dataTransfer?.files
          if (!files?.length) return false

          for (const file of Array.from(files)) {
            if (file.type.startsWith('image/')) {
              const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
              attachImageFromBlob(file).then(relPath => {
                const { schema } = view.state
                const node = schema.nodes.image?.create({ src: relPath })
                if (!node) return
                const pos = coords?.pos ?? view.state.doc.content.size
                const tr = view.state.tr.insert(pos, node)
                view.dispatch(tr)
              })
              return true
            }
          }
          return false
        },

        // ── Vault link clicks (Ctrl/Cmd+click) ───────────────────────────
        handleClick(view, pos, event) {
          if (!event.ctrlKey && !event.metaKey) return false

          const $pos = view.state.doc.resolve(pos)
          const linkMark = $pos.marks().find(m => m.type.name === 'link')
          if (!linkMark) return false

          const href = (linkMark.attrs.href ?? '') as string
          if (!href || href.startsWith('http://') || href.startsWith('https://')) return false

          // Internal .md vault link — open it
          useVaultStore.getState().openDocument(href)
          return true
        },
      },
    },
    // Recreate the editor when the open file path changes
    [fileKey],
  )

  // ── Sync external file-watcher reloads ─────────────────────────────────
  useEffect(() => {
    if (!editor) return

    const { frontmatter, body } = splitFrontmatter(rawContent)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const current = (editor.storage as Record<string, any>).markdown.getMarkdown() as string

    if (current !== body) {
      frontmatterRef.current = frontmatter
      // emitUpdate: false suppresses onUpdate → prevents a save write-loop
      editor.commands.setContent(body, { emitUpdate: false })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawContent])

  return (
    <div className={styles.editorWrap} ref={scrollRef}>
      {frontmatterRef.current && (
        <FrontmatterCard content={frontmatterRef.current} />
      )}
      <div className={styles.editorRow}>
        <DocumentOutline editor={editor} scrollContainer={scrollEl} />
        <EditorContent editor={editor} className={styles.editorContent} />
      </div>
      <FormattingBubbleMenu editor={editor} />
    </div>
  )
}
