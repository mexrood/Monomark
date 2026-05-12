import React, { useEffect, useCallback } from 'react'
import { FileText } from 'lucide-react'
import styles from './DropOverlay.module.css'

interface DropOverlayProps {
  onDrop(path: string): void
  onCancel(): void
}

export const DropOverlay: React.FC<DropOverlayProps> = ({ onDrop, onCancel }) => {
  // Escape closes the overlay
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onCancel])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (!file) { onCancel(); return }
    const filePath = window.marrow?.util?.getPathForFile(file)
    if (filePath) onDrop(filePath)
    else onCancel()
  }, [onDrop, onCancel])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only cancel if leaving the entire overlay (not entering a child)
    if (!e.currentTarget.contains(e.relatedTarget as Node)) onCancel()
  }, [onCancel])

  return (
    <div
      className={styles.backdrop}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onDragLeave={handleDragLeave}
    >
      <div className={styles.zone}>
        <FileText size={36} strokeWidth={1.25} className={styles.icon} />
        <span className={styles.title}>Drop to open</span>
        <span className={styles.sub}>Markdown or any text file</span>
      </div>
    </div>
  )
}
