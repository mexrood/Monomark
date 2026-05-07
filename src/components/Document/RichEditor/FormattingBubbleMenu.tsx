import React, { useState, useEffect, useRef } from 'react'
import ReactDOM from 'react-dom'
import type { Editor } from '@tiptap/core'
import {
  Heading1,
  Heading2,
  Heading3,
  Bold,
  Italic,
  Strikethrough,
  Code,
  FileCode,
  Quote,
  Link,
  Highlighter,
} from 'lucide-react'
import styles from './RichEditor.module.css'

interface Props {
  editor: Editor | null
}

interface MenuPos {
  x: number
  y: number
}

export const FormattingBubbleMenu: React.FC<Props> = ({ editor }) => {
  const [pos, setPos] = useState<MenuPos | null>(null)
  const [linkMode, setLinkMode] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef(0)

  // ── Track selection position ─────────────────────────────────────────
  useEffect(() => {
    if (!editor) return

    const refresh = () => {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = requestAnimationFrame(() => {
        const { selection } = editor.state
        if (selection.empty || editor.isActive('codeBlock')) {
          setPos(null)
          setLinkMode(false)
          return
        }
        const domSel = window.getSelection()
        if (!domSel?.rangeCount) { setPos(null); return }
        const rect = domSel.getRangeAt(0).getBoundingClientRect()
        if (!rect.width) { setPos(null); return }
        setPos({ x: rect.left + rect.width / 2, y: rect.top - 6 })
      })
    }

    const hide = () => {
      setPos(null)
      setLinkMode(false)
    }

    editor.on('selectionUpdate', refresh)
    editor.on('transaction', refresh)
    editor.on('blur', hide)

    return () => {
      cancelAnimationFrame(rafRef.current)
      editor.off('selectionUpdate', refresh)
      editor.off('transaction', refresh)
      editor.off('blur', hide)
    }
  }, [editor])

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
  if (!pos || !editor) return null

  const menu = (
    <div
      ref={menuRef}
      className={styles.bubbleMenu}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        transform: 'translate(-50%, -100%)',
        zIndex: 500,
      }}
      // Prevent focus loss when clicking toolbar buttons
      onMouseDown={e => e.preventDefault()}
    >
      {linkMode ? (
        <form className={styles.bubbleLinkForm} onSubmit={applyLink}>
          <input
            className={styles.bubbleLinkInput}
            type="url"
            placeholder="https://…"
            value={linkUrl}
            autoFocus
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') { setLinkMode(false); editor.commands.focus() } }}
          />
          <button type="submit" className={styles.bubbleBtn} title="Apply">✓</button>
          <button type="button" className={styles.bubbleBtn} title="Cancel"
            onClick={() => { setLinkMode(false); editor.commands.focus() }}>✕</button>
        </form>
      ) : (
        <>
          {/* Headings */}
          <BBtn editor={editor} active={editor.isActive('heading', { level: 1 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="Heading 1">
            <Heading1 size={14} />
          </BBtn>
          <BBtn editor={editor} active={editor.isActive('heading', { level: 2 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="Heading 2">
            <Heading2 size={14} />
          </BBtn>
          <BBtn editor={editor} active={editor.isActive('heading', { level: 3 })}
            onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Heading 3">
            <Heading3 size={14} />
          </BBtn>

          <Divider />

          {/* Text marks */}
          <BBtn editor={editor} active={editor.isActive('bold')}
            onClick={() => editor.chain().focus().toggleBold().run()} title="Bold">
            <Bold size={14} />
          </BBtn>
          <BBtn editor={editor} active={editor.isActive('italic')}
            onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic">
            <Italic size={14} />
          </BBtn>
          <BBtn editor={editor} active={editor.isActive('strike')}
            onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough">
            <Strikethrough size={14} />
          </BBtn>

          <Divider />

          {/* Code */}
          <BBtn editor={editor} active={editor.isActive('code')}
            onClick={() => editor.chain().focus().toggleCode().run()} title="Inline Code">
            <Code size={14} />
          </BBtn>
          <BBtn editor={editor} active={editor.isActive('codeBlock')}
            onClick={() => editor.chain().focus().toggleCodeBlock().run()} title="Code Block">
            <FileCode size={14} />
          </BBtn>

          <Divider />

          {/* Block */}
          <BBtn editor={editor} active={editor.isActive('blockquote')}
            onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Blockquote">
            <Quote size={14} />
          </BBtn>

          <Divider />

          {/* Link & Highlight */}
          <BBtn editor={editor} active={editor.isActive('link')}
            onClick={handleLinkClick} title="Link">
            <Link size={14} />
          </BBtn>
          <BBtn editor={editor} active={editor.isActive('highlight')}
            onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight">
            <Highlighter size={14} />
          </BBtn>
        </>
      )}
    </div>
  )

  return ReactDOM.createPortal(menu, document.body)
}

// ── Small helper components ───────────────────────────────────────────────────

interface BBtnProps {
  editor: Editor
  active: boolean
  onClick: () => void
  title: string
  children: React.ReactNode
}

const BBtn: React.FC<BBtnProps> = ({ active, onClick, title, children }) => (
  <button
    className={`${styles.bubbleBtn} ${active ? styles.bubbleBtnActive : ''}`}
    onClick={onClick}
    title={title}
  >
    {children}
  </button>
)

const Divider: React.FC = () => <span className={styles.bubbleDivider} />
