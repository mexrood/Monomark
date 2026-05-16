import React, { useEffect, useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { Row } from '../SettingsDialog'
import styles from '../SettingsDialog.module.css'
import { useUIStore } from '../../../store/useUIStore'
import type { Theme } from '../../../store/useUIStore'
import { useVaultStore } from '../../../store/useVaultStore'
import { useAppStore } from '../../../store/useAppStore'
import type { UpdateState } from '../../../types/window'

const THEME_OPTIONS: { id: Theme; name: string }[] = [
  { id: 'midnight', name: 'Midnight' },
  { id: 'slate', name: 'Slate' },
  { id: 'dim', name: 'Dim' },
  { id: 'paper', name: 'Paper' },
  { id: 'cream', name: 'Cream' },
]

export const GeneralPanel: React.FC = () => {
  const theme = useUIStore(s => s.theme)
  const setTheme = useUIStore(s => s.setTheme)
  const closeSettings = useUIStore(s => s.closeSettings)
  const version = useAppStore(s => s.version)
  const [updateState, setUpdateState] = useState<UpdateState>({ status: 'idle' })
  const updater = window.marrow.updater

  useEffect(() => {
    if (!updater) return
    updater.getState().then(setUpdateState).catch(() => {})
    updater.onStateChange(setUpdateState)
    return () => updater.offStateChange()
  }, [updater])

  const handleChangeVault = async () => {
    const path = await window.marrow.vault.pickVaultFolder()
    if (path) {
      await useVaultStore.getState().setVaultPath(path)
      useVaultStore.getState().closeDocument()
      closeSettings()
    }
  }

  return (
    <>
      <div className={styles.themeSection}>
        <div className={styles.rowMeta}>
          <span className={styles.rowLabel}>Theme</span>
          <span className={styles.rowSub}>Choose how Monomark looks</span>
        </div>
        <div className={styles.themeGrid}>
          {THEME_OPTIONS.map(t => (
            <button
              key={t.id}
              className={`${styles.themeCard} ${theme === t.id ? styles.themeCardActive : ''}`}
              onClick={() => setTheme(t.id)}
              tabIndex={-1}
            >
              <div className={styles.swatch} data-theme={t.id}>
                <div className={styles.swatchChrome} />
                <div className={styles.swatchCanvas} />
                <div className={styles.swatchText}>Aa</div>
              </div>
              <span className={styles.themeName}>{t.name}</span>
            </button>
          ))}
        </div>
      </div>
      <Row label="Vault folder" sub="The directory where your notes are stored">
        <button className={styles.actionBtn} onClick={handleChangeVault} tabIndex={-1}>
          <FolderOpen size={13} strokeWidth={1.5} />
          <span>Change…</span>
        </button>
      </Row>

      <UpdatesRow state={updateState} hasUpdater={!!updater} />
      <Row label="Version">
        <span className={styles.value}>{version || '—'}</span>
      </Row>
      <Row label="License">
        <span className={styles.value}>MIT</span>
      </Row>
    </>
  )
}

const UpdatesRow: React.FC<{ state: UpdateState; hasUpdater: boolean }> = ({ state, hasUpdater }) => {
  const sub = updateSubtext(state)
  const button = renderUpdateButton(state, hasUpdater)
  const showProgress = state.status === 'downloading'
  const showReleaseNotes = state.status === 'available' && !!state.releaseNotes

  return (
    <Row label="Updates" sub={sub}>
      <div className={styles.updatesControl}>
        {button}
        {showProgress && (
          <div className={styles.progress}>
            <div className={styles.progressBar} style={{ width: `${state.percent}%` }} />
          </div>
        )}
        {showReleaseNotes && (
          <details className={styles.releaseNotes}>
            <summary>What's changed</summary>
            <div className={styles.releaseNotesBody}>{state.releaseNotes}</div>
          </details>
        )}
      </div>
    </Row>
  )
}

function renderUpdateButton(state: UpdateState, hasUpdater: boolean): React.ReactNode {
  if (!hasUpdater) {
    return <span className={styles.value}>unavailable</span>
  }
  switch (state.status) {
    case 'checking':
      return <button className={styles.actionBtn} disabled>Checking…</button>
    case 'available':
      return (
        <button className={styles.actionBtn} onClick={() => void window.marrow.updater.download()}>
          Download v{state.version}
        </button>
      )
    case 'downloading':
      return <button className={styles.actionBtn} disabled>{state.percent}%</button>
    case 'downloaded':
      return (
        <button className={styles.actionBtn} onClick={() => void window.marrow.updater.install()}>
          Install and restart
        </button>
      )
    case 'installing':
      return <button className={styles.actionBtn} disabled>Installing…</button>
    case 'error':
      return (
        <button className={styles.actionBtn} onClick={() => void window.marrow.updater.check()}>
          Try again
        </button>
      )
    case 'up-to-date':
    case 'idle':
    default:
      return (
        <button className={styles.actionBtn} onClick={() => void window.marrow.updater.check()}>
          Check for updates
        </button>
      )
  }
}

function updateSubtext(state: UpdateState): string | undefined {
  switch (state.status) {
    case 'idle':
      return state.lastChecked ? `Last checked ${formatRelative(state.lastChecked)}` : undefined
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return `You are on the latest version (v${state.version}).`
    case 'available':
      return `New version v${state.version} available.`
    case 'downloading':
      return `${formatBytes(state.transferred)} / ${formatBytes(state.total)} · ${formatBytes(state.bytesPerSecond)}/s`
    case 'downloaded':
      return 'Ready to install. App will restart on update.'
    case 'installing':
      return 'Installing… app will restart.'
    case 'error':
      return state.message
  }
}

function formatBytes(n: number): string {
  if (!n || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.round(diff / 1000)
  if (sec < 60) return 'just now'
  const min = Math.round(sec / 60)
  if (min < 60) return `${min} min ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr} h ago`
  return `${Math.round(hr / 24)} d ago`
}
