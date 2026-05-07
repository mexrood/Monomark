import React from 'react'
import { Power } from 'lucide-react'
import { Row, Toggle } from '../SettingsDialog'
import styles from '../SettingsDialog.module.css'
import { useAppStore } from '../../../store/useAppStore'

export const LaunchPanel: React.FC = () => {
  const { autostartEnabled, toggleAutostart } = useAppStore()

  const handleQuit = () => {
    window.dispatchEvent(new Event('monomark:quit-requested'))
  }

  return (
    <>
      <Row label="Launch at login" sub="Start Monomark automatically when you log in">
        <Toggle checked={autostartEnabled} onChange={toggleAutostart} />
      </Row>
      <Row label="Quit app" sub="Fully exit Monomark (not just hide to tray)">
        <button className={`${styles.actionBtn} ${styles.danger}`} onClick={handleQuit} tabIndex={-1}>
          <Power size={13} strokeWidth={1.5} />
          <span>Quit Monomark</span>
        </button>
      </Row>
      <p className={styles.hint}>
        Closing the window hides Monomark to the system tray.
        The MCP server keeps running so Claude can always reach your vault.
      </p>
    </>
  )
}
