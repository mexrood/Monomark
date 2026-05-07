import React from 'react'
import { Row } from '../SettingsDialog'
import styles from '../SettingsDialog.module.css'
import { useAppStore } from '../../../store/useAppStore'

export const AboutPanel: React.FC = () => {
  const version = useAppStore(s => s.version)
  return (
    <>
      <Row label="Version">
        <span className={styles.value}>{version || '—'}</span>
      </Row>
      <Row label="License">
        <span className={styles.value}>MIT</span>
      </Row>
    </>
  )
}
