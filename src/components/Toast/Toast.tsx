import React from 'react'
import { X } from 'lucide-react'
import styles from './Toast.module.css'
import { useToastStore } from '../../store/useToastStore'

export const ToastContainer: React.FC = () => {
  const toasts = useToastStore(s => s.toasts)
  const dismiss = useToastStore(s => s.dismiss)

  if (toasts.length === 0) return null

  return (
    <div className={styles.container} aria-live="polite">
      {toasts.map(t => (
        <div key={t.id} className={`${styles.toast} ${styles[t.kind]}`}>
          <span className={styles.message}>{t.message}</span>
          {t.action && (
            <button
              className={styles.actionBtn}
              onClick={() => {
                t.action!.onClick()
                dismiss(t.id)
              }}
            >
              {t.action.label}
            </button>
          )}
          <button
            className={styles.closeBtn}
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss"
          >
            <X size={12} strokeWidth={1.5} />
          </button>
        </div>
      ))}
    </div>
  )
}
