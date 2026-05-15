import React, { useEffect, useState, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import styles from './DocumentOutline.module.css'

interface Heading {
  level: number
  text: string
  pos: number
}

interface Props {
  editor: Editor | null
  scrollContainer: HTMLElement | null
}

export const DocumentOutline: React.FC<Props> = ({ editor, scrollContainer }) => {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activePos, setActivePos] = useState<number>(-1)
  const userScrollLockRef = useRef(false)

  // ── Extract headings whenever the editor doc changes ────────────────────────
  useEffect(() => {
    // Reset stale state from previous editor — positions are not portable.
    setHeadings([])
    setActivePos(-1)
    if (!editor) return

    const update = () => {
      if (editor.isDestroyed) return
      try {
        const list: Heading[] = []
        editor.state.doc.descendants((node, pos) => {
          if (node.type.name === 'heading') {
            list.push({
              level: typeof node.attrs.level === 'number' ? node.attrs.level : 1,
              text: node.textContent || '',
              pos,
            })
          }
        })
        setHeadings(list)
      } catch {
        /* editor in transition — skip this tick */
      }
    }
    update()
    editor.on('update', update)
    return () => {
      try { editor.off('update', update) } catch { /* destroyed */ }
    }
  }, [editor])

  // ── Track active heading via scroll position ────────────────────────────────
  // Using a scroll listener (instead of IntersectionObserver) gives us a reliable
  // "topmost heading whose top is above a small offset from the viewport top"
  // semantic, even when no heading is currently in view.
  useEffect(() => {
    if (!editor || !scrollContainer || headings.length === 0) {
      setActivePos(-1)
      return
    }

    const findHeadingDom = (pos: number): HTMLElement | null => {
      if (editor.isDestroyed) return null
      try {
        const view = editor.view
        if (pos + 1 > view.state.doc.content.size) return null
        const dom = view.domAtPos(pos + 1)
        let el: HTMLElement | null = (dom.node as HTMLElement) || null
        while (el && el.tagName && !/^H[1-6]$/.test(el.tagName)) {
          el = el.parentElement
        }
        return el
      } catch {
        return null
      }
    }

    const computeActive = () => {
      try {
        const containerRect = scrollContainer.getBoundingClientRect()
        const triggerY = containerRect.top + 80
        let bestPos = headings[0].pos
        for (const h of headings) {
          const el = findHeadingDom(h.pos)
          if (!el) continue
          const elTop = el.getBoundingClientRect().top
          if (elTop <= triggerY + 4) {
            bestPos = h.pos
          } else {
            break
          }
        }
        setActivePos(bestPos)
      } catch {
        /* editor in transition */
      }
    }

    computeActive()
    const onScroll = () => {
      // Don't update active during programmatic smooth-scroll: it briefly
      // flickers through earlier headings.
      if (userScrollLockRef.current) return
      computeActive()
    }
    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => scrollContainer.removeEventListener('scroll', onScroll)
  }, [editor, scrollContainer, headings])

  if (!editor || headings.length < 3) return null

  const scrollTo = (pos: number) => {
    if (!scrollContainer || !editor || editor.isDestroyed) return
    try {
      const view = editor.view
      if (pos + 1 > view.state.doc.content.size) return
      const dom = view.domAtPos(pos + 1)
      let el: HTMLElement | null = (dom.node as HTMLElement) || null
      while (el && el.tagName && !/^H[1-6]$/.test(el.tagName)) {
        el = el.parentElement
      }
      if (!el) return

      const elRect = el.getBoundingClientRect()
      const containerRect = scrollContainer.getBoundingClientRect()
      // 80px offset = below the navBlur fade-out zone
      const targetTop = scrollContainer.scrollTop + (elRect.top - containerRect.top) - 80

      // Optimistically set active so the UI feels instant
      setActivePos(pos)
      userScrollLockRef.current = true
      scrollContainer.scrollTo({ top: targetTop, behavior: 'smooth' })
      // Release lock after the smooth-scroll finishes (~400ms)
      setTimeout(() => { userScrollLockRef.current = false }, 500)
    } catch {
      /* ignore */
    }
  }

  return (
    <aside className={styles.toc} aria-label="Document outline">
      <div className={styles.bars}>
        {headings.map(h => {
          const lvl = Math.min(Math.max(h.level, 1), 6)
          const cls = [
            styles.bar,
            styles[`level${lvl}`],
            h.pos === activePos ? styles.active : '',
          ].filter(Boolean).join(' ')
          return <div key={h.pos} className={cls} aria-hidden="true" />
        })}
      </div>
      <div className={styles.expanded}>
        <div className={styles.label}>On this page</div>
        {headings.map(h => {
          const lvl = Math.min(Math.max(h.level, 1), 6)
          const cls = [
            styles.item,
            styles[`itemLevel${lvl}`],
            h.pos === activePos ? styles.itemActive : '',
          ].filter(Boolean).join(' ')
          return (
            <a
              key={h.pos}
              href={`#h-${h.pos}`}
              className={cls}
              onClick={(e) => { e.preventDefault(); scrollTo(h.pos) }}
              title={h.text}
            >
              {h.text || '(untitled)'}
            </a>
          )
        })}
      </div>
    </aside>
  )
}
