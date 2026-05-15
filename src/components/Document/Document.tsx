import React, { useRef, useEffect } from 'react'
import { useVaultStore } from '../../store/useVaultStore'
import { RichEditor } from './RichEditor/RichEditor'
import { ExternalView } from './ExternalView'
import { EmptyState } from './EmptyState'
import { DropFeedback } from '../DropFeedback/DropFeedback'
import { scrollRegistry } from '../../utils/scrollRegistry'
import styles from './Document.module.css'

export const Document: React.FC = () => {
  const document = useVaultStore(s => s.document)
  const saveToVault = useVaultStore(s => s.saveToVault)
  const externalRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (document.kind !== 'external') return
    scrollRegistry.set(externalRef.current)
    return () => scrollRegistry.set(null)
  }, [document.kind])

  if (document.kind === 'empty') {
    return (
      <div className={styles.wrap}>
        <EmptyState />
        <DropFeedback />
      </div>
    )
  }

  if (document.kind === 'external') {
    return (
      <div className={styles.wrap}>
        <div className={styles.externalBanner}>
          <span className={styles.externalPath}>{document.path}</span>
          <button className={styles.saveBtn} onClick={() => saveToVault()}>
            Save to Vault
          </button>
        </div>
        <div className={styles.externalWrap} ref={externalRef}>
          <ExternalView content={document.content} filePath={document.path} />
        </div>
        <DropFeedback />
      </div>
    )
  }

  // Vault document — always live-edit (no toggle)
  return (
    <div className={styles.wrap}>
      <RichEditor />
      <DropFeedback />
    </div>
  )
}
