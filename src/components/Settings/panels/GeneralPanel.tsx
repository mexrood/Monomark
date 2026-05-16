import React, { useEffect, useState } from 'react'
import { FolderOpen, RefreshCw, Download, Check, ArrowRight } from 'lucide-react'
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
    <SettingsPage title="General" description="Manage your preferences">

      <div className={styles.updateCardWrap}>
        <UpdatesCard state={updateState} />
      </div>

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
        <Row title="Version" action={<span className={styles.value}>{version || '—'}</span>} />
        <Row title="License" action={<span className={styles.value}>MIT</span>} />
      </Section>
    </SettingsPage>
  )
}

// ── Updates card — always rendered, content driven by update state ────────────

interface CardConfig {
  label: string
  accent: boolean
  icon?: React.ReactNode
  title: string
  subtitle?: string
  progress?: number
  releaseNotes?: string
  action?: React.ReactNode
}

const UpdatesCard: React.FC<{ state: UpdateState }> = ({ state }) => {
  const cfg = updateCardConfig(state)
  return (
    <Card variant={cfg.accent ? 'accent' : 'default'}>
      <div className={[styles.cardLabel, cfg.accent ? styles.cardLabelAccent : '']
        .filter(Boolean).join(' ')}>
        {cfg.label}
      </div>
      <div className={styles.cardBody}>
        <div className={styles.cardContent}>
          <div className={styles.cardTitle}>
            {cfg.icon}
            <span>{cfg.title}</span>
          </div>
          {cfg.subtitle && <div className={styles.cardSubtitle}>{cfg.subtitle}</div>}
          {cfg.progress !== undefined && (
            <div className={styles.progress}>
              <div className={styles.progressBar} style={{ width: `${cfg.progress}%` }} />
            </div>
          )}
          {cfg.releaseNotes && (
            <details className={styles.releaseNotes}>
              <summary>What's changed</summary>
              <div className={styles.releaseNotesBody}>{cfg.releaseNotes}</div>
            </details>
          )}
        </div>
        {cfg.action && <div className={styles.cardAction}>{cfg.action}</div>}
      </div>
    </Card>
  )
}

const checkUpdates = () => void window.marrow.updater?.check()

function checkButton(label: string): React.ReactNode {
  return (
    <Button
      variant="secondary"
      icon={<RefreshCw size={14} strokeWidth={1.5} />}
      onClick={checkUpdates}
    >
      {label}
    </Button>
  )
}

function updateCardConfig(state: UpdateState): CardConfig {
  switch (state.status) {
    case 'idle':
      return {
        label: 'UPDATES',
        accent: false,
        title: "You're on the latest version",
        subtitle: state.lastChecked
          ? `Last checked ${formatRelative(state.lastChecked)}`
          : 'Click to check for updates',
        action: checkButton('Check for updates'),
      }
    case 'checking':
      return {
        label: 'UPDATES',
        accent: false,
        title: 'Checking for updates…',
        subtitle: 'This might take a moment',
        action: (
          <Button
            variant="secondary"
            disabled
            icon={<RefreshCw size={14} strokeWidth={1.5} className={styles.spin} />}
          >
            Checking…
          </Button>
        ),
      }
    case 'up-to-date':
      return {
        label: 'UPDATES',
        accent: false,
        icon: <Check size={16} strokeWidth={2} />,
        title: "You're on the latest version",
        subtitle: 'Checked just now',
        action: checkButton('Check again'),
      }
    case 'available':
      return {
        label: 'UPDATE AVAILABLE',
        accent: true,
        title: `Version ${state.version} is ready to download`,
        releaseNotes: state.releaseNotes || undefined,
        action: (
          <Button
            variant="primary"
            icon={<Download size={14} strokeWidth={1.5} />}
            onClick={() => void window.marrow.updater?.download()}
          >
            Download
          </Button>
        ),
      }
    case 'downloading':
      return {
        label: 'UPDATE AVAILABLE',
        accent: true,
        title: `Downloading version ${state.version}`,
        subtitle: `${formatMB(state.transferred)} / ${formatMB(state.total)}`,
        progress: state.percent,
      }
    case 'downloaded':
      return {
        label: 'UPDATE READY',
        accent: true,
        title: `Version ${state.version} will install on restart`,
        subtitle: 'Click below to restart now',
        action: (
          <Button
            variant="primary"
            icon={<ArrowRight size={14} strokeWidth={1.5} />}
            onClick={() => void window.marrow.updater?.install()}
          >
            Install and restart
          </Button>
        ),
      }
    case 'installing':
      return {
        label: 'UPDATE READY',
        accent: true,
        title: 'Installing update…',
        subtitle: 'Monomark is restarting to apply the update',
      }
    case 'error':
      return {
        label: 'UPDATES',
        accent: false,
        title: "Couldn't check for updates",
        subtitle: state.message,
        action: checkButton('Try again'),
      }
  }
}

// ── Formatters ────────────────────────────────────────────────────────────────

function formatMB(n: number): string {
  if (!n || n < 0) return '0 MB'
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
