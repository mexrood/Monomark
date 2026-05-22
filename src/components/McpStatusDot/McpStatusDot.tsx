import { useRef, useState, useEffect } from 'react'
import { ChevronRight } from 'lucide-react'
import styles from './McpStatusDot.module.css'
import { useAppStore } from '../../store/useAppStore'
import { useUIStore } from '../../store/useUIStore'
import { Switch } from '../ui/Switch'
import { McpStatusPill } from './McpStatusPill'

export function McpStatusDot() {
  const mcpStatus = useAppStore(s => s.mcpStatus)
  const toggleMcp = useAppStore(s => s.toggleMcp)
  const openSettings = useUIStore(s => s.openSettings)

  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hovered, setHovered] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onMouseDown = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onMouseDown)
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const handleToggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await toggleMcp()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div
      className={styles.wrapper}
      ref={wrapperRef}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {open && (
        <div className={styles.popover}>
          <div className={styles.popoverRow}>
            <span className={styles.popoverLabel}>Enable MCP server</span>
            <Switch checked={mcpStatus.running} onChange={() => handleToggle()} disabled={busy} />
          </div>
          <div className={styles.popoverDivider} />
          <button
            className={styles.openSettingsRow}
            onClick={() => { openSettings('mcp'); setOpen(false) }}
          >
            <span className={styles.popoverLabel}>Open settings</span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
      <McpStatusPill running={mcpStatus.running} state={mcpStatus.state} hovered={hovered && !open} />
      <button
        className={styles.dot}
        data-status={mcpStatus.running ? 'on' : 'off'}
        onClick={() => setOpen(v => !v)}
        aria-label={mcpStatus.running ? 'MCP server running' : 'MCP server stopped'}
        title={mcpStatus.running ? 'MCP running — click to manage' : 'MCP stopped — click to manage'}
      />
    </div>
  )
}
