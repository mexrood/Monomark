import React, { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw } from 'lucide-react'
import { SettingsPage, Section, Row } from '../SettingsPage'
import { Button } from '../../ui/Button'
import { Card } from '../../ui/Card'
import styles from '../SettingsPage.module.css'
import grid from '../SettingsDialog.module.css'
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

// Update states that take over the top of the page as a prominent card.
const PROMINENT = new Set<UpdateState['status']>([
  'available', 'downloading', 'downloaded', 'installing',
])

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

  const isProminent = PROMINENT.has(updateState.status)

  return (
    <SettingsPage title="General" description="Manage your preferences">

      {isProminent && (
        <div className={styles.updateCardWrap}>
          <UpdateCard state={updateState} />
        </div>
      )}

      <Section title="Appearance">
        <Row title="Theme" description="Choose how Monomark looks" />
        <div className={styles.themeGrid}>
          {THEME_OPTIONS.map(t => (
            <button
              key={t.id}
              className={[grid.themeCard, theme === t.id ? grid.themeCardActive : '']
                .filter(Boolean).join(' ')}
              onClick={() => setTheme(t.id)}
              tabIndex={-1}
            >
              <div className={grid.swatch} data-theme={t.id}>
                <div className={grid.swatchChrome} />
                <div className={grid.swatchCanvas} />
                <div className={grid.swatchText}>Aa</div>
              </div>
              <span className={grid.themeName}>{t.name}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Vault">
        <Row
          title="Vault folder"
          description="The directory where your notes are stored"
          action={
            <Button
              variant="secondary"
              icon={<FolderOpen size={14} strokeWidth={1.5} />}
              onClick={handleChangeVault}
            >
              Change…
            </Button>
          }
        />
      </Section>

      <Section title="About">
        {!isProminent && (
          <Row
            title="Updates"
            description={idleUpdateText(updateState, !!updater)}
            action={renderIdleUpdateAction(updateState, !!updater)}
          />
        )}
        <Row title="Version" action={<span className={styles.value}>{version || '—'}</span>} />
        <Row title="License" action={<span className={styles.value}>MIT</span>} />
      </Section>
    </SettingsPage>
  )
}

// ── Updates prominent card ────────────────────────────────────────────────────

const UpdateCard: React.FC<{ state: UpdateState }> = ({ state }) => (
  <Card variant="accent">
    <div className={styles.updateHeader}>
      <div className={styles.updateBadge}>UPDATE</div>
      <h3 className={styles.updateTitle}>{updateTitle(state)}</h3>
      <p className={styles.updateSubtitle}>{updateSubtitle(state)}</p>
    </div>

    {state.status === 'downloading' && (
      <div className={styles.progress}>
        <div className={styles.progressBar} style={{ width: `${state.percent}%` }} />
      </div>
    )}

    {state.status === 'available' && state.releaseNotes && (
      <details className={styles.releaseNotes}>
        <summary>What's changed</summary>
        <div className={styles.releaseNotesBody}>{state.releaseNotes}</div>
      </details>
    )}

    <div className={styles.updateActions}>{renderUpdateAction(state)}</div>
  </Card>
)

function updateTitle(state: UpdateState): string {
  switch (state.status) {
    case 'available':   return 'Update available'
    case 'downloading': return 'Downloading update…'
    case 'downloaded':  return 'Update ready to install'
    case 'installing':  return 'Installing update…'
    default:            return 'Updates'
  }
}

function updateSubtitle(state: UpdateState): string {
  switch (state.status) {
    case 'available':
      return `Version ${state.version} is ready to download.`
    case 'downloading':
      return `${formatBytes(state.transferred)} / ${formatBytes(state.total)} · ${formatBytes(state.bytesPerSecond)}/s`
    case 'downloaded':
      return 'Monomark will restart to finish the update.'
    case 'installing':
      return 'Monomark is restarting to apply the update.'
    default:
      return ''
  }
}

function renderUpdateAction(state: UpdateState): React.ReactNode {
  switch (state.status) {
    case 'available':
      return (
        <Button variant="primary" onClick={() => void window.marrow.updater?.download()}>
          Download v{state.version}
        </Button>
      )
    case 'downloading':
      return <Button variant="primary" disabled>{state.percent}%</Button>
    case 'downloaded':
      return (
        <Button variant="primary" onClick={() => void window.marrow.updater?.install()}>
          Install and restart
        </Button>
      )
    case 'installing':
      return <Button variant="primary" disabled>Installing…</Button>
    default:
      return null
  }
}

// ── Idle updates row ──────────────────────────────────────────────────────────

function idleUpdateText(state: UpdateState, hasUpdater: boolean): string {
  if (!hasUpdater) return 'Updates are unavailable in this build.'
  switch (state.status) {
    case 'idle':
      return state.lastChecked
        ? `Last checked ${formatRelative(state.lastChecked)}.`
        : 'Check for the latest version of Monomark.'
    case 'checking':
      return 'Checking for updates…'
    case 'up-to-date':
      return `You're on the latest version (v${state.version}).`
    case 'error':
      return state.message
    default:
      return 'Check for the latest version of Monomark.'
  }
}

function renderIdleUpdateAction(state: UpdateState, hasUpdater: boolean): React.ReactNode {
  if (!hasUpdater) return null
  if (state.status === 'checking') {
    return <Button variant="secondary" disabled>Checking…</Button>
  }
  const label = state.status === 'error' ? 'Try again' : 'Check for updates'
  return (
    <Button
      variant="secondary"
      icon={<RefreshCw size={14} strokeWidth={1.5} />}
      onClick={() => void window.marrow.updater?.check()}
    >
      {label}
    </Button>
  )
}

// ── Formatters ────────────────────────────────────────────────────────────────

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
