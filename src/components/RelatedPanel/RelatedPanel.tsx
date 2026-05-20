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

/**
 * "Related thoughts" panel — shows the LLM-judged useful relations for the
 * block at the cursor. Same data as the inline ↗ arrows, so panel and arrow
 * never disagree. Opened via Cmd+Shift+F.
 */
export const RelatedPanel: React.FC = () => {
  const { isOpen, blockId, results, loading, close, setResults, setLoading } = useRelatedStore()

  useEffect(() => {
    if (!isOpen || !blockId || !window.marrow?.vault?.getRelationsForBlock) return
    let cancelled = false
    setLoading(true)
    window.marrow.vault
      .getRelationsForBlock(blockId)
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
            No useful relations yet — keep writing.
            <span className={styles.hint}>Connections appear here as the local AI judges them.</span>
          </div>
        )}

        {!loading && results.length > 0 && (
          <ul className={styles.results}>
            {results.map(r => (
              <li key={r.toId} className={styles.result}>
                <button onClick={() => { void navigateToBlock(r.toFile, r.toId); close() }}>
                  <div className={styles.meta}>
                    <span className={styles.file}>{fileName(r.toFile)}</span>
                  </div>
                  <div className={styles.text}><strong>{r.label}</strong></div>
                  <div className={styles.text}>{truncate(r.toText, 200)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
