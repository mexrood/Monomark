import { useEffect, useState, useRef, useCallback } from 'react'
import { Bot } from 'lucide-react'
import styles from './McpStatusPill.module.css'
import type { McpActivityEvent, McpStats } from '../../types/window'

export function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return n.toLocaleString('en-US')
  return String(n)
}

type PillState = 'hidden' | 'reading' | 'distilling' | 'done' | 'hover'

interface McpStatusPillProps {
  running: boolean
  state: string
  hovered: boolean
}

export function McpStatusPill({ running, state, hovered }: McpStatusPillProps) {
  const [pillState, setPillState] = useState<PillState>('hidden')
  const [savedTokens, setSavedTokens] = useState(0)
  const [todayTokens, setTodayTokens] = useState<number | null>(null)
  const collapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const prevHovered = useRef(false)

  const clearCollapse = useCallback(() => {
    if (collapseTimer.current) {
      clearTimeout(collapseTimer.current)
      collapseTimer.current = null
    }
  }, [])

  const scheduleCollapse = useCallback((ms: number) => {
    clearCollapse()
    collapseTimer.current = setTimeout(() => {
      setPillState('hidden')
    }, ms)
  }, [clearCollapse])

  useEffect(() => {
    const mcp = window.marrow.mcp
    if (!mcp) return

    const handler = (event: unknown) => {
      const e = event as McpActivityEvent
      clearCollapse()
      if (e.type === 'reading') {
        setPillState('reading')
      } else if (e.type === 'distilling') {
        setPillState('distilling')
      } else if (e.type === 'done') {
        setSavedTokens(e.tokensSaved)
        setPillState('done')
        scheduleCollapse(e.tokensSaved > 0 ? 3500 : 2000)
      }
    }

    mcp.onActivity(handler)
    return () => {
      mcp.offActivity()
      clearCollapse()
    }
  }, [clearCollapse, scheduleCollapse])

  useEffect(() => {
    const wasHovered = prevHovered.current
    prevHovered.current = hovered

    if (hovered && !wasHovered) {
      clearCollapse()
      if (pillState === 'hidden') {
        window.marrow.mcp?.getStatsToday().then((stats: McpStats) => {
          setTodayTokens(stats.tokensSaved)
        }).catch(() => {})
        setPillState('hover')
      }
    } else if (!hovered && wasHovered) {
      if (pillState === 'hover') {
        setPillState('hidden')
      } else if (pillState === 'done') {
        scheduleCollapse(1000)
      }
    }
  }, [hovered, pillState, clearCollapse, scheduleCollapse])

  const connectionStatus = !running
    ? 'off'
    : state === 'starting' ? 'reconnecting' : 'on'

  const visible = pillState !== 'hidden'

  let text: React.ReactNode
  if (pillState === 'reading') {
    text = <span className={styles.text}>Claude is reading…</span>
  } else if (pillState === 'distilling') {
    text = <span className={styles.text}>Grok distilling…</span>
  } else if (pillState === 'done') {
    text = (
      <span className={styles.text}>
        Saved <span className={styles.savedCount}>{formatTokens(savedTokens)}</span> tokens
      </span>
    )
  } else if (pillState === 'hover') {
    text = (
      <span className={styles.text}>
        Saved <span className={styles.savedCount}>{formatTokens(todayTokens ?? 0)}</span> tokens today
      </span>
    )
  }

  return (
    <div className={`${styles.pill} ${!visible ? styles.pillHidden : ''}`}>
      <div className={styles.icon}>
        <PillIcon />
      </div>
      {text}
      <div className={styles.miniDot} data-status={connectionStatus} />
    </div>
  )
}

export function PillIcon() {
  return <Bot size={16} strokeWidth={1.5} />
}
