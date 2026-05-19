import React from 'react'
import { useIndexStore } from '../../store/useIndexStore'
import styles from './IndexIndicator.module.css'

/**
 * Subtle bottom-right indicator shown while the embeddings index is being
 * built. Hidden once indexing is done (`ready` / `idle`).
 */
export const IndexIndicator: React.FC = () => {
  const status = useIndexStore(s => s.status)

  if (status.kind === 'ready' || status.kind === 'idle') return null

  return (
    <div className={styles.indicator} role="status">
      {status.kind === 'error' ? (
        <span className={styles.warn} aria-hidden="true">!</span>
      ) : (
        <span className={styles.spinner} aria-hidden="true" />
      )}
      <span className={styles.label}>
        {status.kind === 'initializing' && 'Setting up memory…'}
        {status.kind === 'indexing' && `Indexing ${status.current}/${status.total}`}
        {status.kind === 'error' && 'Indexing paused'}
      </span>
    </div>
  )
}
