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
    if (!editor) return
    const update = () => {
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
    }
    update()
    editor.on('update', update)
    return () => {
      editor.off('update', update)
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

    const view = editor.view

    const findHeadingDom = (pos: number): HTMLElement | null => {
      try {
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
      // Trigger zone: 80px below the navBlur (44px topbar + 36px breathing).
      // The heading whose top is closest to but not below this line is active.
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

  if (!editor || headings.length < 2) return null

  const scrollTo = (pos: number) => {
    if (!scrollContainer) return
    try {
      const dom = editor.view.domAtPos(pos + 1)
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
    <div className={styles.outline} aria-label="Document outline">
      {headings.map(h => {
        const lvl = Math.min(Math.max(h.level, 1), 4)
        const cls = [
          styles.item,
          styles[`level${lvl}`],
          h.pos === activePos ? styles.active : '',
        ].filter(Boolean).join(' ')
        return (
          <button
            key={h.pos}
            className={cls}
            onClick={() => scrollTo(h.pos)}
            title={h.text}
            type="button"
          >
            <span className={styles.label}>{h.text || '(untitled)'}</span>
            <span className={styles.line} aria-hidden="true" />
          </button>
        )
      })}
    </div>
  )
}
