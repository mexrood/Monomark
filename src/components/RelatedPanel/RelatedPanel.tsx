import React, { useEffect } from 'react'
import { X } from 'lucide-react'
import { useRelatedStore } from '../../store/useRelatedStore'
import { navigateToBlock } from '../../utils/blockNav'
import styles from './RelatedPanel.module.css'

function truncate(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max).trimEnd() + '…' : t
}

function fileName(relPath: string): string {
  return relPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? relPath
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.round(diff / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.round(hr / 24)
  if (days < 30) return `${days}d ago`
  return new Date(ts).toLocaleDateString()
}

/** "Related thoughts" panel — semantically similar blocks (Cmd+Shift+F). */
export const RelatedPanel: React.FC = () => {
  const { isOpen, blockId, results, loading, close, setResults, setLoading } = useRelatedStore()

  useEffect(() => {
    if (!isOpen || !blockId || !window.marrow?.search) return
    let cancelled = false
    setLoading(true)
    window.marrow.search
      .findRelatedToBlock(blockId, { threshold: 0.8, limit: 8 })
      .then(r => { if (!cancelled) { setResults(r); setLoading(false) } })
      .catch(() => { if (!cancelled) { setResults([]); setLoading(false) } })
    return () => { cancelled = true }
  }, [isOpen, blockId, setResults, setLoading])

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, close])

  if (!isOpen) return null

  return (
    <div className={styles.overlay} onClick={close}>
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        <header className={styles.header}>
          <h3 className={styles.title}>Related thoughts</h3>
          <button className={styles.closeBtn} onClick={close} aria-label="Close">
            <X size={16} />
          </button>
        </header>

        {loading && <div className={styles.state}>Searching…</div>}

        {!loading && results.length === 0 && (
          <div className={styles.state}>
            No related thoughts found yet.
            <span className={styles.hint}>Keep writing — connections form as your vault grows.</span>
          </div>
        )}

        {!loading && results.length > 0 && (
          <ul className={styles.results}>
            {results.map(r => (
              <li key={r.id} className={styles.result}>
                <button onClick={() => { navigateToBlock(r.file, r.id); close() }}>
                  <div className={styles.meta}>
                    <span className={styles.file}>{fileName(r.file)}</span>
                    <span className={styles.score}>{Math.round(r.similarity * 100)}%</span>
                  </div>
                  <div className={styles.text}>{truncate(r.text, 200)}</div>
                  <div className={styles.date}>{formatRelative(r.updated_at)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
