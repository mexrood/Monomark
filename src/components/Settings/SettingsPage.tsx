import React from 'react'
import styles from './SettingsPage.module.css'

/**
 * Shared layout primitives for Settings panels — a page shell with a large
 * heading, uppercase section labels, and consistent rows.
 */

export const SettingsPage: React.FC<{
  title: string
  description?: string
  children: React.ReactNode
}> = ({ title, description, children }) => (
  <div className={styles.page}>
    <header className={styles.pageHeader}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {description && <p className={styles.pageDescription}>{description}</p>}
    </header>
    {children}
  </div>
)

export const Section: React.FC<{
  title: string
  children: React.ReactNode
}> = ({ title, children }) => (
  <section className={styles.section}>
    <h2 className={styles.sectionTitle}>{title}</h2>
    <div className={styles.sectionBody}>{children}</div>
  </section>
)

export const Row: React.FC<{
  title: string
  description?: React.ReactNode
  action?: React.ReactNode
}> = ({ title, description, action }) => (
  <div className={styles.row}>
    <div className={styles.rowText}>
      <div className={styles.rowTitle}>{title}</div>
      {description && <div className={styles.rowDescription}>{description}</div>}
    </div>
    {action && <div className={styles.rowAction}>{action}</div>}
  </div>
)
