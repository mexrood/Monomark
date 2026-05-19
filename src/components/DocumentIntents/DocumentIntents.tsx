import React, { useEffect, useState } from 'react'
import styles from './DocumentIntents.module.css'
import { useIndexStore } from '../../store/useIndexStore'
import type { FileIntents, Intent } from '../../types/window'

// Phase B — Tier 0 intent badges shown under the note title. Block intents are
// classified locally from embeddings (no LLM); see electron/blocks/classify.ts.

const ORDER: Intent[] = ['decision', 'question', 'todo', 'observation']

const LABEL: Record<Intent, [singular: string, plural: string]> = {
  decision: ['decision', 'decisions'],
  question: ['question', 'questions'],
  todo: ['to-do', 'to-dos'],
  observation: ['observation', 'observations'],
}

export const DocumentIntents: React.FC<{ path: string }> = ({ path }) => {
  // Re-classify when the index finishes (re)building — the embeddings the
  // classifier reads only exist once indexing reaches 'ready'.
  const indexKind = useIndexStore(s => s.status.kind)
  const [intents, setIntents] = useState<FileIntents | null>(null)

  useEffect(() => {
    const search = window.marrow?.search
    if (!search || !path) {
      setIntents(null)
      return
    }
    let alive = true
    search
      .classifyFile(path)
      .then(result => { if (alive) setIntents(result) })
      .catch(() => { if (alive) setIntents(null) })
    return () => { alive = false }
  }, [path, indexKind])

  if (!intents || intents.total === 0) return null

  const shown = ORDER.filter(intent => intents.counts[intent] > 0)
  if (shown.length === 0) return null

  return (
    <div
      className={styles.bar}
      title="Intent of this note's blocks — detected locally from embeddings"
    >
      {shown.map(intent => {
        const count = intents.counts[intent]
        const [singular, plural] = LABEL[intent]
        return (
          <span key={intent} className={`${styles.badge} ${styles[intent]}`}>
            <span className={styles.dot} aria-hidden="true" />
            {count} {count === 1 ? singular : plural}
          </span>
        )
      })}
    </div>
  )
}
