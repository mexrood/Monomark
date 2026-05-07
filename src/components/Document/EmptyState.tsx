import React, { useCallback } from 'react'
import { useVaultStore } from '../../store/useVaultStore'
import styles from './EmptyState.module.css'

export const EmptyState: React.FC = () => {
  const vaultPath = useVaultStore(s => s.vaultPath)
  const refreshTree = useVaultStore(s => s.refreshTree)
  const openDocument = useVaultStore(s => s.openDocument)

  const handleNew = useCallback(async () => {
    if (!vaultPath) return
    const path = await window.marrow.vault.createFile(vaultPath, 'Untitled')
    await refreshTree()
    await openDocument(path)
  }, [vaultPath, refreshTree, openDocument])

  return (
    <div className={styles.root}>
      <p className={styles.hint}>Select a document or create a new one</p>
      <button className={styles.newBtn} onClick={handleNew}>
        New Note
      </button>
    </div>
  )
}
