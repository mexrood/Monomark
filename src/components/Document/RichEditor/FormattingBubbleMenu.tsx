import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import type { Editor } from '@tiptap/core'
import {
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Bold,
  Italic,
  Strikethrough,
  Code,
  Link,
  Highlighter,
  MoreHorizontal,
  List,
  ListOrdered,
  CheckSquare,
  Quote,
  Minus,
  Table,
} from 'lucide-react'
import styles from './RichEditor.module.css'

interface Props {
  editor: Editor | null
}

interface Anchor {
  x: number
  top: number
  bottom: number
}

const ICON = { size: 16, strokeWidth: 1.5 } as const
// Room (px) the toolbar needs above the selection before it flips below.
const FLIP_THRESHOLD = 90

export const FormattingBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const rafRef = useRef(0)

  // ── Track selection position ─────────────────────────────────────────
  useEffect(() => {
    if (!editor) return

    const refresh = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        if (editor.isDestroyed) return
        const { selection } = editor.state
        // No toolbar for collapsed selections, code blocks or tables —
        // inline formatting does not apply there.
        if (
          selection.empty ||
          editor.isActive('codeBlock') ||
          editor.isActive('table')
        ) {
          setAnchor(null)
          return
        }
        const domSel = window.getSelection()
        if (!domSel?.rangeCount) { setAnchor(null); return }
        const rect = domSel.getRangeAt(0).getBoundingClientRect()
        if (!rect.width) { setAnchor(null); return }
        setAnchor({
          x: rect.left + rect.width / 2,
          top: rect.top,
          bottom: rect.bottom,
        })
      })
    }

    const hide = () => {
      setAnchor(null)
      setExpanded(false)
      setLinkMode(false)
    }

    editor.on('selectionUpdate', refresh)
    editor.on('transaction', refresh)
    editor.on('blur', hide)
    // Follow the selection while the document scrolls.
    window.addEventListener('scroll', refresh, true)

    return () => {
      cancelAnimationFrame(rafRef.current)
      editor.off('selectionUpdate', refresh)
      editor.off('transaction', refresh)
      editor.off('blur', hide)
      window.removeEventListener('scroll', refresh, true)
    }
  }, [editor])

  // ── Esc closes the toolbar ───────────────────────────────────────────
  useEffect(() => {
    if (!anchor) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAnchor(null)
        setExpanded(false)
        setLinkMode(false)
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [anchor])

  // ── Link handling ────────────────────────────────────────────────────
  const handleLinkClick = () => {
    if (!editor) return
    if (editor.isActive('link')) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const existing = editor.getAttributes('link').href as string | undefined
    setLinkUrl(existing ?? '')
    setLinkMode(true)
  }

  const applyLink = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editor) return
    if (linkUrl.trim()) {
      editor.chain().focus().setLink({ href: linkUrl.trim() }).run()
    } else {
      editor.chain().focus().unsetLink().run()
    }
    setLinkMode(false)
    setLinkUrl('')
  }

  // ── Render ───────────────────────────────────────────────────────────
  if (!anchor || !editor) return null

  // Flip below the selection only when there is no room above it.
  const placeBelow = anchor.top - FLIP_THRESHOLD < 8
  const top = placeBelow ? anchor.bottom + 8 : anchor.top - 8
  const wrapTransform = placeBelow
    ? 'translateX(-50%)'
    : 'translate(-50%, -100%)'

  const menu = (
    <div
      style={{
        position: 'fixed',
        left: anchor.x,
        top,
        transform: wrapTransform,
        zIndex: 500,
      }}
      // Prevent focus loss when clicking toolbar buttons
      onMouseDown={e => e.preventDefault()}
    >
      <div className={styles.toolbar}>
        {linkMode ? (
          <form className={styles.linkForm} onSubmit={applyLink}>
            <input
              className={styles.linkInput}
              type="url"
              placeholder="https://…"
              value={linkUrl}
              autoFocus
              onChange={e => setLinkUrl(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Escape') { setLinkMode(false); editor.commands.focus() }
              }}
            />
            <button type="submit" className={styles.toolbarBtn} title="Apply">✓</button>
            <button
              type="button"
              className={styles.toolbarBtn}
              title="Cancel"
              onClick={() => { setLinkMode(false); editor.commands.focus() }}
            >✕</button>
          </form>
        ) : (
          <>
            <div className={styles.row}>
              {/* Headings */}
              <div className={styles.group}>
                <TBtn active={editor.isActive('heading', { level: 2 })} title="Heading 2"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
                  <Heading2 {...ICON} />
                </TBtn>
                <TBtn active={editor.isActive('heading', { level: 3 })} title="Heading 3"
                  onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
                  <Heading3 {...ICON} />
                </TBtn>
              </div>

              {/* Text marks */}
              <div className={styles.group}>
                <TBtn active={editor.isActive('bold')} title="Bold"
                  onClick={() => editor.chain().focus().toggleBold().run()}>
                  <Bold {...ICON} />
                </TBtn>
                <TBtn active={editor.isActive('italic')} title="Italic"
                  onClick={() => editor.chain().focus().toggleItalic().run()}>
                  <Italic {...ICON} />
                </TBtn>
                <TBtn active={editor.isActive('strike')} title="Strikethrough"
                  onClick={() => editor.chain().focus().toggleStrike().run()}>
                  <Strikethrough {...ICON} />
                </TBtn>
              </div>

              {/* Link / code / highlight */}
              <div className={styles.group}>
                <TBtn active={editor.isActive('link')} title="Link"
                  onClick={handleLinkClick}>
                  <Link {...ICON} />
                </TBtn>
                <TBtn active={editor.isActive('code')} title="Inline code"
                  onClick={() => editor.chain().focus().toggleCode().run()}>
                  <Code {...ICON} />
                </TBtn>
                <TBtn active={editor.isActive('highlight')} title="Highlight"
                  onClick={() => editor.chain().focus().toggleHighlight().run()}>
                  <Highlighter {...ICON} />
                </TBtn>
              </div>

              {/* Overflow toggle */}
              <div className={styles.group}>
                <TBtn active={expanded} title="More"
                  onClick={() => setExpanded(e => !e)}>
                  <MoreHorizontal {...ICON} />
                </TBtn>
              </div>
            </div>

            {expanded && (
              <div className={`${styles.row} ${styles.overflowRow}`}>
                <div className={styles.group}>
                  <TBtn active={editor.isActive('heading', { level: 1 })} title="Heading 1"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
                    <Heading1 {...ICON} />
                  </TBtn>
                  <TBtn active={editor.isActive('heading', { level: 4 })} title="Heading 4"
                    onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()}>
                    <Heading4 {...ICON} />
                  </TBtn>
                  <TBtn active={editor.isActive('bulletList')} title="Bullet list"
                    onClick={() => editor.chain().focus().toggleBulletList().run()}>
                    <List {...ICON} />
                  </TBtn>
                  <TBtn active={editor.isActive('orderedList')} title="Numbered list"
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}>
                    <ListOrdered {...ICON} />
                  </TBtn>
                  <TBtn active={editor.isActive('taskList')} title="To-do list"
                    onClick={() => editor.chain().focus().toggleTaskList().run()}>
                    <CheckSquare {...ICON} />
                  </TBtn>
                  <TBtn active={editor.isActive('blockquote')} title="Quote"
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}>
                    <Quote {...ICON} />
                  </TBtn>
                  <TBtn active={false} title="Divider"
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}>
                    <Minus {...ICON} />
                  </TBtn>
                  <TBtn active={false} title="Table"
                    onClick={() => editor.chain().focus()
                      .insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
                    <Table {...ICON} />
                  </TBtn>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )

  return ReactDOM.createPortal(menu, document.body)
}

// ── Toolbar button ────────────────────────────────────────────────────────────

interface TBtnProps {
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}

const TBtn: React.FC<TBtnProps> = ({ active, onClick, title, children }) => (
  <button
    className={`${styles.toolbarBtn} ${active ? styles.toolbarBtnActive : ''}`}
    onClick={onClick}
    title={title}
  >
    {children}
  </button>
)
