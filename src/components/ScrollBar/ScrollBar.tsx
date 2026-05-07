import React, { useEffect, useRef, useState, useCallback } from 'react'
import { scrollRegistry } from '../../utils/scrollRegistry'
import styles from './ScrollBar.module.css'

export const ScrollBar: React.FC = () => {
  const [thumbTop, setThumbTop] = useState(0)
  const [thumbHeight, setThumbHeight] = useState(0)
  const [visible, setVisible] = useState(false)
  const elRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    let ro: ResizeObserver | null = null

    const update = () => {
      const el = elRef.current
      if (!el) { setVisible(false); return }
      const { scrollTop, scrollHeight, clientHeight } = el
      if (scrollHeight <= clientHeight + 1) { setVisible(false); return }
      setVisible(true)
      const th = Math.max((clientHeight / scrollHeight) * clientHeight, 24)
      const maxTop = clientHeight - th
      setThumbTop((scrollTop / (scrollHeight - clientHeight)) * maxTop)
      setThumbHeight(th)
    }

    const unsubscribe = scrollRegistry.subscribe(el => {
      if (elRef.current) elRef.current.removeEventListener('scroll', update)
      ro?.disconnect()
      elRef.current = el
      if (el) {
        el.addEventListener('scroll', update, { passive: true })
        ro = new ResizeObserver(update)
        ro.observe(el)
        update()
      } else {
        setVisible(false)
      }
    })

    return () => {
      unsubscribe()
      if (elRef.current) elRef.current.removeEventListener('scroll', update)
      ro?.disconnect()
    }
  }, [])

  const handleThumbMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    const el = elRef.current
    if (!el) return

    const startY = e.clientY
    const startScrollTop = el.scrollTop
    const { scrollHeight, clientHeight } = el
    const th = Math.max((clientHeight / scrollHeight) * clientHeight, 24)
    const trackHeight = clientHeight
    const scrollRange = scrollHeight - clientHeight
    const thumbRange = trackHeight - th

    const onMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientY - startY
      el.scrollTop = startScrollTop + (delta / thumbRange) * scrollRange
    }

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [])

  if (!visible) return null

  return (
    <div className={styles.track}>
      <div
        className={styles.thumb}
        style={{ top: thumbTop, height: thumbHeight }}
        onMouseDown={handleThumbMouseDown}
      />
    </div>
  )
}
