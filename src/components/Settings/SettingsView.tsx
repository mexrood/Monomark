import React from 'react'
import styles from './SettingsView.module.css'
import { useUIStore } from '../../store/useUIStore'
import { GeneralPanel } from './panels/GeneralPanel'
import { LaunchPanel } from './panels/LaunchPanel'
import { McpPanel } from './McpPanel'

export const SettingsView: React.FC = () => {
  const settingsTab = useUIStore(s => s.settingsTab)

  return (
    <div className={styles.view}>
      {settingsTab === 'general' && <GeneralPanel />}
      {settingsTab === 'launch'  && <LaunchPanel />}
      {settingsTab === 'mcp'     && <McpPanel />}
    </div>
  )
}
