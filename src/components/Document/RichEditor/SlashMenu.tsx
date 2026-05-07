import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react'
import type { Editor, Range } from '@tiptap/core'
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  CheckSquare,
  Code2,
  Quote,
  Table,
  Minus,
} from 'lucide-react'

export interface SlashCommand {
  label: string
  keywords: string[]
  icon: React.FC<{ size?: number }>
  action: (editor: Editor, range: Range) => void
}

export interface SlashMenuRef {
  onKeyDown: (props: { event: KeyboardEvent }) => boolean
}

interface Props {
  items: SlashCommand[]
  command: (item: SlashCommand) => void
}

export const SlashMenu = forwardRef<SlashMenuRef, Props>(({ items, command }, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  // Reset selection when items change
  useEffect(() => setSelectedIndex(0), [items])

  // Scroll active item into view
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const active = container.querySelector<HTMLButtonElement>('[data-active="true"]')
    active?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }) {
      if (event.key === 'ArrowUp') {
        setSelectedIndex(i => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        setSelectedIndex(i => (i + 1) % items.length)
        return true
      }
      if (event.key === 'Enter') {
        if (items[selectedIndex]) command(items[selectedIndex])
        return true
      }
      return false
    },
  }))

  if (items.length === 0) return null

  return (
    <div className="slash-menu" ref={containerRef}>
      {items.map((item, index) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            className="slash-menu__item"
            data-active={index === selectedIndex ? 'true' : 'false'}
            onMouseEnter={() => setSelectedIndex(index)}
            onMouseDown={e => {
              e.preventDefault()
              command(item)
            }}
          >
            <span className="slash-menu__icon">
              <Icon size={16} />
            </span>
            <span className="slash-menu__label">{item.label}</span>
          </button>
        )
      })}
    </div>
  )
})

SlashMenu.displayName = 'SlashMenu'

// ── Command definitions ───────────────────────────────────────────────────────

export const SLASH_COMMANDS: SlashCommand[] = [
  {
    label: 'Heading 1',
    keywords: ['h1', 'heading', 'title'],
    icon: Heading1,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 1 }).run(),
  },
  {
    label: 'Heading 2',
    keywords: ['h2', 'heading'],
    icon: Heading2,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 2 }).run(),
  },
  {
    label: 'Heading 3',
    keywords: ['h3', 'heading'],
    icon: Heading3,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleHeading({ level: 3 }).run(),
  },
  {
    label: 'Bullet List',
    keywords: ['bullet', 'list', 'ul'],
    icon: List,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    label: 'Numbered List',
    keywords: ['numbered', 'ordered', 'ol', 'list'],
    icon: ListOrdered,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    label: 'Task List',
    keywords: ['task', 'todo', 'checkbox'],
    icon: CheckSquare,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    label: 'Code Block',
    keywords: ['code', 'pre', 'snippet'],
    icon: Code2,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    label: 'Quote',
    keywords: ['quote', 'blockquote'],
    icon: Quote,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    label: 'Table',
    keywords: ['table', 'grid'],
    icon: Table,
    action: (editor, range) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
  {
    label: 'Divider',
    keywords: ['divider', 'hr', 'rule', 'separator'],
    icon: Minus,
    action: (editor, range) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
]
