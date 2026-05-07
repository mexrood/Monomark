import React, { useEffect, useRef } from 'react'
import { useDialogStore } from '../../store/useDialogStore'
import styles from './ConfirmDialog.module.css'

export const ConfirmDialog: React.FC = () => {
  const { open, options, _confirm, _cancel } = useDialogStore()
  const confirmRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (open) confirmRef.current?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') _cancel()
      if (e.key === 'Enter') _confirm()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, _confirm, _cancel])

  if (!open || !options) return null

  return (
    <div className={styles.overlay} onClick={_cancel}>
      <div className={styles.dialog} onClick={e => e.stopPropagation()}>
        <h2 className={styles.title}>{options.title}</h2>
        <p className={styles.message}>{options.message}</p>
        <div className={styles.actions}>
          <button className={styles.cancel} onClick={_cancel}>
            {options.cancelLabel ?? 'Cancel'}
          </button>
          <button
            ref={confirmRef}
            className={`${styles.confirm} ${options.danger ? styles.danger : ''}`}
            onClick={_confirm}
          >
            {options.confirmLabel ?? 'OK'}
          </button>
        </div>
      </div>
    </div>
  )
}
