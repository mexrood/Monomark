import React from 'react'
import styles from './SettingsNav.module.css'
import { useUIStore } from '../../store/useUIStore'
import type { SettingsTab } from '../../store/useUIStore'

const TABS: { id: SettingsTab; label: string }[] = [
  { id: 'general',  label: 'General' },
  { id: 'launch',   label: 'Launch' },
  { id: 'mcp',      label: 'Server (MCP)' },
]

export const SettingsNav: React.FC = () => {
  const settingsTab = useUIStore(s => s.settingsTab)
  const setSettingsTab = useUIStore(s => s.setSettingsTab)

  return (
    <nav className={styles.nav}>
      {TABS.map(tab => (
        <button
          key={tab.id}
          className={`${styles.item} ${settingsTab === tab.id ? styles.itemActive : ''}`}
          onClick={() => setSettingsTab(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}
