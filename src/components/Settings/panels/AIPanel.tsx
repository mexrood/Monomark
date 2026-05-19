import React, { useState } from 'react'
import { Download, Trash2, Check, Loader, Play, Pause, Sparkles } from 'lucide-react'
import { SettingsPage, Section, Row } from '../SettingsPage'
import { Button } from '../../ui/Button'
import { Switch } from '../../ui/Switch'
import styles from './AIPanel.module.css'
import { useAIStore } from '../../../store/useAIStore'
import type { AICatalogModel } from '../../../types/window'

export const AIPanel: React.FC = () => {
  const ai = useAIStore()

  const active = ai.catalog.find(m => m.id === ai.activeModelId) ?? null

  return (
    <SettingsPage
      title="AI Model"
      description="Run a local model on your terms — pick one that fits your hardware, or skip AI entirely."
    >
      <Section title="Local AI">
        <Row
          title="Enable AI"
          description={
            ai.enabled
              ? 'AI features can use a downloaded model.'
              : 'AI is off. Models stay on disk but are never loaded into RAM.'
          }
          action={
            <Switch
              checked={ai.enabled}
              disabled={!ai.available}
              onChange={next => ai.setEnabled(next)}
            />
          }
        />
        {!ai.available && (
          <p className={styles.note}>Local AI is only available in the Monomark desktop app.</p>
        )}
      </Section>

      {ai.available && ai.enabled && active && (
        <Section title="Active model">
          <ActiveModelCard model={active} />
        </Section>
      )}

      {ai.available && ai.enabled && ai.engineState === 'ready' && (
        <Section title="Test">
          <TestPrompt />
        </Section>
      )}

      {ai.available && ai.enabled && (
        <Section title="Available models">
          <div className={styles.modelGrid}>
            {ai.catalog.map(model => (
              <ModelCard key={model.id} model={model} />
            ))}
          </div>
        </Section>
      )}
    </SettingsPage>
  )
}

// ── Active model card ──────────────────────────────────────────────────────────

const ActiveModelCard: React.FC<{ model: AICatalogModel }> = ({ model }) => {
  const { engineState, engineError, activate, unload } = useAIStore()
  const [busy, setBusy] = useState(false)

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  let status: React.ReactNode
  let action: React.ReactNode

  switch (engineState) {
    case 'loading':
      status = <span className={styles.statusText}>Loading model into RAM…</span>
      action = <Loader size={16} className={styles.spin} />
      break
    case 'ready':
      status = <span className={styles.statusText}>Loaded — ready</span>
      action = (
        <Button variant="secondary" onClick={() => run(() => unload())} disabled={busy}>
          Unload
        </Button>
      )
      break
    case 'error':
      status = <span className={styles.errorText}>{engineError ?? 'Failed to load'}</span>
      action = (
        <Button variant="primary" onClick={() => run(() => activate(model.id))} disabled={busy}>
          Retry
        </Button>
      )
      break
    default:
      status = <span className={styles.statusText}>Downloaded — not loaded</span>
      action = (
        <Button
          variant="primary"
          icon={<Play size={14} strokeWidth={1.5} />}
          onClick={() => run(() => activate(model.id))}
          disabled={busy}
        >
          Load model
        </Button>
      )
  }

  return (
    <div className={`${styles.modelCard} ${styles.modelCardActive}`}>
      <div className={styles.modelInfo}>
        <div className={styles.modelName}>
          {model.name}
          {engineState === 'ready' && <span className={`${styles.badge} ${styles.badgeReady}`}>Active</span>}
        </div>
        <div className={styles.modelMeta}>
          <span>{model.params}</span>
          <span>{model.ram} RAM</span>
          <span>{model.speed}</span>
        </div>
        <div style={{ marginTop: 6 }}>{status}</div>
      </div>
      <div className={styles.modelAction}>{action}</div>
    </div>
  )
}

// ── Test prompt ────────────────────────────────────────────────────────────────

const TestPrompt: React.FC = () => {
  const [text, setText] = useState('In one sentence, what is a knowledge base?')
  const [response, setResponse] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const run = async () => {
    if (busy || !text.trim()) return
    setBusy(true)
    setError(null)
    setResponse(null)
    try {
      const out = await window.marrow.ai!.prompt(text.trim())
      setResponse(out)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.testBox}>
      <textarea
        className={styles.testInput}
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Ask the local model something…"
      />
      <div>
        <Button
          variant="primary"
          icon={busy
            ? <Loader size={14} className={styles.spin} />
            : <Sparkles size={14} strokeWidth={1.5} />}
          onClick={run}
          disabled={busy}
        >
          {busy ? 'Generating…' : 'Run prompt'}
        </Button>
      </div>
      {error && <div className={styles.errorText}>{error}</div>}
      {response && <div className={styles.testResponse}>{response}</div>}
    </div>
  )
}

// ── Catalog model card ─────────────────────────────────────────────────────────

const ModelCard: React.FC<{ model: AICatalogModel }> = ({ model }) => {
  const ai = useAIStore()
  const [busy, setBusy] = useState(false)

  const isDownloaded = ai.downloadedIds.includes(model.id)
  const isPartial = ai.partialIds.includes(model.id)
  const isRecommended = ai.recommendedId === model.id
  const isActive = ai.activeModelId === model.id
  const progress = ai.downloads[model.id]

  const run = async (fn: () => Promise<void>) => {
    setBusy(true)
    try { await fn() } finally { setBusy(false) }
  }

  let action: React.ReactNode
  if (progress) {
    action = (
      <>
        <div className={styles.progress}>
          <div
            className={styles.progressBar}
            style={{ width: `${progress.percent < 0 ? 50 : progress.percent}%` }}
          />
        </div>
        <span className={styles.progressText}>
          {formatBytes(progress.transferred)}
          {progress.total > 0 ? ` / ${formatBytes(progress.total)}` : ''}
        </span>
        <Button
          variant="secondary"
          icon={<Pause size={14} strokeWidth={1.5} />}
          onClick={() => ai.cancelDownload(model.id)}
        >
          Pause
        </Button>
      </>
    )
  } else if (!isDownloaded && isPartial) {
    action = (
      <>
        <span className={styles.progressText}>Download paused</span>
        <Button
          variant="primary"
          icon={<Download size={14} strokeWidth={1.5} />}
          onClick={() => ai.download(model.id)}
        >
          Resume
        </Button>
        <Button
          variant="secondary"
          icon={<Trash2 size={14} strokeWidth={1.5} />}
          onClick={() => run(() => ai.deleteModel(model.id))}
          disabled={busy}
        >
          Discard
        </Button>
      </>
    )
  } else if (!isDownloaded) {
    action = (
      <Button
        variant="secondary"
        icon={<Download size={14} strokeWidth={1.5} />}
        onClick={() => ai.download(model.id)}
      >
        Download
      </Button>
    )
  } else if (isActive) {
    action = (
      <span className={styles.statusText}>
        <Check size={14} strokeWidth={2} /> Selected
      </span>
    )
  } else {
    action = (
      <>
        <Button
          variant="primary"
          onClick={() => run(() => ai.activate(model.id))}
          disabled={busy}
        >
          Activate
        </Button>
        <Button
          variant="secondary"
          icon={<Trash2 size={14} strokeWidth={1.5} />}
          onClick={() => run(() => ai.deleteModel(model.id))}
          disabled={busy}
        >
          Delete
        </Button>
      </>
    )
  }

  return (
    <div className={styles.modelCard}>
      <div className={styles.modelInfo}>
        <div className={styles.modelName}>
          {model.name}
          {isRecommended && <span className={styles.badge}>Recommended</span>}
        </div>
        <div className={styles.modelUseCase}>{model.useCase}</div>
        <div className={styles.modelMeta}>
          <span>{formatBytes(model.sizeBytes)}</span>
          <span>{model.ram} RAM</span>
          <span>{model.speed}</span>
          <span>{model.license}</span>
        </div>
      </div>
      <div className={styles.modelAction}>{action}</div>
    </div>
  )
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatBytes(n: number): string {
  if (!n || n < 0) return '—'
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(1)} GB`
  return `${Math.round(n / 1024 / 1024)} MB`
}
