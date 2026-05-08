import React, { useEffect, useState } from 'react'
import { Row } from '../SettingsDialog'
import styles from '../SettingsDialog.module.css'
import { useAppStore } from '../../../store/useAppStore'
import type { UpdateState } from '../../../types/window'

export const AboutPanel: React.FC = () => {
  const version = useAppStore(s => s.version)
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const updater = window.marrow.updater

  // Subscribe to updater state on mount, fetch initial state
  useEffect(() => {
    if (!updater) return
    updater.getState().then(setUpdateState).catch(() => {})
    updater.onStateChange(setUpdateState)
    return () => updater.offStateChange()
  }, [updater])

  const handleClick = () => {
    if (!updater) return
    if (updateState.status === 'downloaded') {
      void updater.install()
    } else {
      void updater.check()
    }
  }

  const button = renderButton(updateState, !!updater, handleClick)

  return (
    <>
      <Row label="Version">
        <span className={styles.value}>{version || '—'}</span>
      </Row>
      <Row label="Updates" sub={updateSubtext(updateState)}>
        {button}
      </Row>
      <Row label="License">
        <span className={styles.value}>MIT</span>
      </Row>
    </>
  )
}

function renderButton(state: UpdateState, hasUpdater: boolean, onClick: () => void): React.ReactNode {
  if (!hasUpdater) {
    return <span className={styles.value}>unavailable</span>
  }
  switch (state.status) {
    case 'checking':
      return <button className={styles.actionBtn} disabled>Checking…</button>
    case 'available':
      return <button className={styles.actionBtn} disabled>Downloading v{state.version}…</button>
    case 'downloading':
      return <button className={styles.actionBtn} disabled>Downloading v{state.version} ({state.percent}%)</button>
    case 'downloaded':
      return <button className={styles.actionBtn} onClick={onClick}>Update Now → v{state.version}</button>
    case 'error':
      return <button className={styles.actionBtn} onClick={onClick}>Retry check</button>
    case 'up-to-date':
    case 'idle':
    default:
      return <button className={styles.actionBtn} onClick={onClick}>Check for updates</button>
  }
}

function updateSubtext(state: UpdateState): string | undefined {
  switch (state.status) {
    case 'up-to-date': return `You are on the latest version (v${state.version}).`
    case 'available':  return `New version v${state.version} found.`
    case 'downloaded': return `Ready to install. App will restart on update.`
    case 'error':      return state.message
    default:           return undefined
  }
}
