import React from 'react'
import styles from './Button.module.css'

interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'danger'
  size?: 'sm' | 'md'
  icon?: React.ReactNode
  children: React.ReactNode
  onClick?: () => void
  disabled?: boolean
}

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  onClick,
  disabled,
}: ButtonProps) {
  return (
    <button
      type="button"
      className={[styles.btn, styles[variant], styles[size]].join(' ')}
      onClick={onClick}
      disabled={disabled}
      tabIndex={-1}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      <span>{children}</span>
    </button>
  )
}
