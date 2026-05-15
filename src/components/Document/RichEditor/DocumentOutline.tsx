import React, { useEffect, useState, useRef } from 'react'
import type { Editor } from '@tiptap/react'
import styles from './DocumentOutline.module.css'
import { useUIStore } from '../../../store/useUIStore'

interface Heading {
  level: number
  text: string
  pos: number
}

interface Props {
  editor: Editor | null
  scrollContainer: HTMLElement | null
}

// ── Windowed minimap geometry ─────────────────────────────────────────────────
const WINDOW_SIZE = 15 // bars visible at once for long documents
const BAR_HEIGHT = 2
const BAR_GAP = 9
const BAR_SLOT = BAR_HEIGHT + BAR_GAP // vertical pitch of one bar

function computeWindow(activeIdx: number, total: number, size: number) {
  if (total <= size) return { start: 0, end: total }
  const half = Math.floor(size / 2)
  let start = Math.max(0, activeIdx - half)
  let end = start + size
  if (end > total) {
    end = total
    start = end - size
  }
  return { start, end }
}

export const DocumentOutline: React.FC<Props> = ({ editor, scrollContainer }) => {
  const [headings, setHeadings] = useState<Heading[]>([])
  const [activePos, setActivePos] = useState<number>(-1)
  const [isHovered, setIsHovered] = useState(false)
  const userScrollLockRef = useRef(false)
  const expandedRef = useRef<HTMLDivElement>(null)
  const sidebarOpen = useUIStore(s => s.sidebarOpen)

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
    // Coalesce scroll bursts into one update per frame — a fast flick can fire
    // dozens of scroll events, and recomputing on each one makes the windowed
    // minimap jitter as activePos skips around.
    let rafId = 0
    const onScroll = () => {
      // Don't update active during programmatic smooth-scroll: it briefly
      // flickers through earlier headings.
      if (userScrollLockRef.current) return
      if (rafId) return
      rafId = requestAnimationFrame(() => {
        rafId = 0
        computeActive()
      })
    }
    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      scrollContainer.removeEventListener('scroll', onScroll)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [editor, scrollContainer, headings])

  // ── On hover, bring the active item into view inside the expanded panel ─────
  useEffect(() => {
    if (!isHovered || !expandedRef.current) return
    const activeEl = expandedRef.current.querySelector(
      `[data-heading-id="${activePos}"]`,
    )
    activeEl?.scrollIntoView({ block: 'center', behavior: 'instant' })
  }, [isHovered, activePos])

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

  const total = headings.length
  const isWindowed = total > WINDOW_SIZE
  const activeIdx = Math.max(0, headings.findIndex(h => h.pos === activePos))
  const { start, end } = computeWindow(activeIdx, total, WINDOW_SIZE)
  const trackOffset = -start * BAR_SLOT
  const visibleCount = Math.min(total, WINDOW_SIZE)
  const viewportHeight = visibleCount * BAR_SLOT - BAR_GAP

  return (
    <aside
      className={styles.toc}
      aria-label="Document outline"
      style={{ left: sidebarOpen ? 256 : 16 }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={[styles.barsViewport, isWindowed ? styles.windowed : '']
          .filter(Boolean).join(' ')}
        style={{ height: viewportHeight }}
      >
        <div
          className={styles.barsTrack}
          style={{ transform: `translateY(${trackOffset}px)` }}
        >
          {headings.map((h, i) => {
            const lvl = Math.min(Math.max(h.level, 1), 6)
            const cls = [
              styles.bar,
              styles[`level${lvl}`],
              i === activeIdx ? styles.active : '',
              isWindowed && (i < start || i >= end) ? styles.outOfWindow : '',
            ].filter(Boolean).join(' ')
            return <div key={h.pos} className={cls} aria-hidden="true" />
          })}
        </div>
      </div>
      <div className={styles.expanded} ref={expandedRef}>
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
              data-heading-id={h.pos}
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
