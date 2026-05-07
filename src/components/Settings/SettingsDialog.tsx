/**
 * Shared UI primitives for Settings panels.
 * The modal wrapper has been removed — see SettingsView.tsx.
 */
import React from 'react'
import styles from './SettingsDialog.module.css'

export const Row: React.FC<{ label: string; sub?: string; children: React.ReactNode }> = ({ label, sub, children }) => (
  <div className={styles.row}>
    <div className={styles.rowMeta}>
      <span className={styles.rowLabel}>{label}</span>
      {sub && <span className={styles.rowSub}>{sub}</span>}
    </div>
    <div className={styles.rowControl}>{children}</div>
  </div>
)

export const Toggle: React.FC<{ checked: boolean; onChange(): void }> = ({ checked, onChange }) => (
  <button
    role="switch"
    aria-checked={checked}
    className={`${styles.toggle} ${checked ? styles.toggleOn : ''}`}
    onClick={onChange}
    tabIndex={-1}
  >
    <span className={styles.toggleThumb} />
  </button>
)

export { styles as settingStyles }
