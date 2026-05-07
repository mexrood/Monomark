import styles from './Switch.module.css'

interface SwitchProps {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
}

export function Switch({ checked, onChange, disabled }: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      className={styles.switch}
      data-checked={String(checked)}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  )
}
