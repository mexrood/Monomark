import React from 'react'
import styles from './SettingsView.module.css'
import { useUIStore } from '../../store/useUIStore'
import { GeneralPanel } from './panels/GeneralPanel'
import { LaunchPanel } from './panels/LaunchPanel'
import { McpPanel } from './McpPanel'

const TAB_LABELS: Record<string, string> = {
  general: 'General',
  launch:  'Launch',
  mcp:     'Server (MCP)',
}

export const SettingsView: React.FC = () => {
  const settingsTab = useUIStore(s => s.settingsTab)

  return (
    <div className={styles.view}>
      <div className={styles.content}>
        <h1 className={styles.title}>{TAB_LABELS[settingsTab]}</h1>
        {settingsTab === 'general' && <GeneralPanel />}
        {settingsTab === 'launch'  && <LaunchPanel />}
        {settingsTab === 'mcp'     && <McpPanel />}
      </div>
    </div>
  )
}
