import React, { useEffect, useState } from 'react'
import styles from './SynapseCounter.module.css'

/**
 * Subtle bottom-right counter of strong synapses (similarity > 0.85 pairs).
 * Hidden when there are none or the count is still unknown.
 */
export const SynapseCounter: React.FC = () => {
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    if (!window.marrow?.search) return
    let alive = true
    const update = () => {
      window.marrow.search!.countSynapses()
        .then(n => { if (alive) setCount(n) })
        .catch(() => {})
    }
    update()
    const interval = setInterval(update, 60_000)
    return () => { alive = false; clearInterval(interval) }
  }, [])

  if (count === null || count === 0) return null

  return (
    <div className={styles.counter} title="Strong semantic connections across your vault">
      <span className={styles.dot} aria-hidden="true" />
      <span>{count.toLocaleString()} synapses</span>
    </div>
  )
}
