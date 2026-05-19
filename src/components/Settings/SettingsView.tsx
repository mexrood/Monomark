import React, { useEffect, useRef } from 'react'
import styles from './SettingsView.module.css'
import { useUIStore } from '../../store/useUIStore'
import { scrollRegistry } from '../../utils/scrollRegistry'
import { GeneralPanel } from './panels/GeneralPanel'
import { LaunchPanel } from './panels/LaunchPanel'
import { McpPanel } from './McpPanel'
import { AIPanel } from './panels/AIPanel'

export const SettingsView: React.FC = () => {
  const settingsTab = useUIStore(s => s.settingsTab)
  const viewRef = useRef<HTMLDivElement>(null)

  // Register the scroll container so the shared <ScrollBar/> overlay (the
  // same custom scrollbar used for documents) tracks the Settings scroll.
  useEffect(() => {
    scrollRegistry.set(viewRef.current)
    return () => scrollRegistry.set(null)
  }, [])

  return (
    <div className={styles.view} ref={viewRef}>
      {settingsTab === 'general' && <GeneralPanel />}
      {settingsTab === 'launch'  && <LaunchPanel />}
      {settingsTab === 'mcp'     && <McpPanel />}
      {settingsTab === 'ai'      && <AIPanel />}
    </div>
  )
}
