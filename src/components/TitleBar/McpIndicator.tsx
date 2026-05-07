import React, { useCallback } from 'react'
import { useAppStore } from '../../store/useAppStore'
import styles from './McpIndicator.module.css'

export const McpIndicator: React.FC = () => {
  const mcpStatus = useAppStore(s => s.mcpStatus)
  const mcpAuditLog = useAppStore(s => s.mcpAuditLog)
  const toggleMcp = useAppStore(s => s.toggleMcp)

  const running = mcpStatus.running
  const port = mcpStatus.port

  const today = new Date().toDateString()
  const callsToday = mcpAuditLog.filter(c => new Date(c.ts).toDateString() === today).length

  const status: 'on' | 'off' = running ? 'on' : 'off'

  const tooltip =
    status === 'on'
      ? `MCP active on :${port} · ${callsToday} calls today`
      : 'MCP off — click to enable'

  const handleClick = useCallback(() => {
    toggleMcp()
  }, [toggleMcp])

  return (
    <button
      className={`${styles.indicator} ${styles[status]}`}
      onClick={handleClick}
      title={tooltip}
      tabIndex={-1}
    >
      <span className={styles.dot} />
      <span className={styles.label}>MCP</span>
    </button>
  )
}
