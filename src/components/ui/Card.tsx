import React from 'react'
import styles from './Card.module.css'

export function Card({
  variant = 'default',
  children,
}: {
  variant?: 'default' | 'accent'
  children: React.ReactNode
}) {
  const cls = variant === 'accent'
    ? `${styles.card} ${styles.accent}`
    : styles.card
  return <div className={cls}>{children}</div>
}
