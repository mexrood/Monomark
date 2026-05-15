import React from 'react'
import styles from './DropFeedback.module.css'
import { useDragStore } from '../../store/useDragStore'

/**
 * Subtle overlay shown over the document area while an external file is
 * being dragged. Tells the user where the drop will land (hovered folder
 * if any, otherwise the default `inbox/`).
 *
 * Not a modal — pointer-events: none so the underlying drop handler runs.
 */
export const DropFeedback: React.FC = () => {
  const isDragging = useDragStore(s => s.isDragging)
  const hoveredFolder = useDragStore(s => s.hoveredFolder)

  if (!isDragging) return null

  const target = hoveredFolder
    ? hoveredFolder.replace(/\\/g, '/').split('/').pop() || 'folder'
    : 'inbox'

  return (
    <div className={styles.overlay}>
      <div className={styles.hint}>Drop to add to <strong>{target}/</strong></div>
    </div>
  )
}
