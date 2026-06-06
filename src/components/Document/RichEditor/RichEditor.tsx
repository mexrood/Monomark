import React, { useEffect, useRef, useState } from 'react'
import { scrollRegistry } from '../../../utils/scrollRegistry'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { useVaultStore } from '../../../store/useVaultStore'
import { useToastStore } from '../../../store/useToastStore'
import { useAutoSave } from '../../../hooks/useAutoSave'
import { attachImageFromBlob } from '../../../utils/attachImage'
import { splitFrontmatter, joinFrontmatter } from '../../../utils/frontmatter'
import { debounce } from '../../../utils/debounce'
import { editorRegistry } from '../../../utils/editorRegistry'
import { buildExtensions } from './extensions'
import { ensureBlockIdsInEditor } from './BlockId'
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

  // Debounced block-id injection. Runs after a real edit settles — never on
  // file open, since setContent uses `emitUpdate: false` and onUpdate stays
  // silent. Kept shorter than the 500ms auto-save so IDs land in the editor
  // (and thus the serialized markdown) before the file is written.
  const ensureIdsRef = useRef(
    debounce((...args: unknown[]) => { ensureBlockIdsInEditor(args[0] as Editor) }, 250),
  )

  const rawContent = document.kind === 'vault' ? document.content : ''

  // Front-matter for the card, derived reactively from the live store content
  // (updateContent always re-prepends it), so it stays correct after an
  // external file reload — a ref would render stale.
  const frontmatter = splitFrontmatter(rawContent).frontmatter

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
        // Tag any new blocks with an ID; the resulting transaction re-fires
        // onUpdate, so the saved markdown ends up carrying the IDs.
        ensureIdsRef.current(e)
      },

      editorProps: {
        // ── Normalize pasted HTML from messengers ────────────────────────
        // Telegram, WhatsApp, Slack wrap lines in nested <div>/<br>
        // instead of clean <p> blocks. When the user later converts these
        // paragraphs to task items, the leftover block elements break
        // TaskItem layout (checkbox on a separate line from text).
        // Fix: flatten <div> → <p> and <br> → paragraph breaks.
        transformPastedHTML(html: string) {
          // If the clipboard HTML carries real block structure (lists, tables,
          // code), let ProseMirror parse it natively — the messenger-div
          // flattening below would otherwise destroy nesting.
          if (/<(?:ul|ol|li|table|tr|td|th|pre|blockquote)[\s>]/i.test(html)) {
            return html
          }
          let cleaned = html
          // <br> → paragraph break
          cleaned = cleaned.replace(/<br\s*\/?>\s*/gi, '</p><p>')
          // </div><div> → paragraph break
          cleaned = cleaned.replace(/<\/div>\s*<div[^>]*>/gi, '</p><p>')
          // Remaining <div ...> → <p>, </div> → </p>
          cleaned = cleaned.replace(/<div[^>]*>/gi, '<p>')
          cleaned = cleaned.replace(/<\/div>/gi, '</p>')
          // Remove empty paragraphs
          cleaned = cleaned.replace(/<p>\s*<\/p>/gi, '')
          return cleaned
        },

        // ── Image paste ──────────────────────────────────────────────────
        handlePaste(view, event) {
          const items = event.clipboardData?.items
          if (!items) return false

          for (const item of Array.from(items)) {
            if (item.type.startsWith('image/')) {
              const blob = item.getAsFile()
              if (!blob) continue
              attachImageFromBlob(blob)
                .then(relPath => {
                  const { schema } = view.state
                  const node = schema.nodes.image?.create({ src: relPath })
                  if (!node) return
                  const tr = view.state.tr.replaceSelectionWith(node)
                  view.dispatch(tr)
                })
                .catch(() => useToastStore.getState().error("Couldn't attach pasted image"))
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
              // Resolve the drop position now (before the async write) so the
              // image lands where it was dropped, not wherever the cursor ends up.
              const dropPos = coords?.pos ?? view.state.selection.from
              attachImageFromBlob(file)
                .then(relPath => {
                  const { schema } = view.state
                  const node = schema.nodes.image?.create({ src: relPath })
                  if (!node) return
                  const pos = Math.min(dropPos, view.state.doc.content.size)
                  const tr = view.state.tr.insert(pos, node)
                  view.dispatch(tr)
                })
                .catch(() => useToastStore.getState().error("Couldn't attach dropped image"))
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

  // Expose the editor instance for block navigation (Phase 3)
  useEffect(() => {
    editorRegistry.set(editor)
    return () => editorRegistry.set(null)
  }, [editor])

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
      {frontmatter && (
        <FrontmatterCard content={frontmatter} />
      )}
      <div className={styles.editorRow}>
        <DocumentOutline editor={editor} scrollContainer={scrollEl} />
        <EditorContent editor={editor} className={styles.editorContent} />
      </div>
      <FormattingBubbleMenu editor={editor} />
    </div>
  )
}
