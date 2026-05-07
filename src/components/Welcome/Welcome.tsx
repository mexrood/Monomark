import React, { useCallback } from 'react'
import styles from './Welcome.module.css'
import { useVaultStore } from '../../store/useVaultStore'

export const Welcome: React.FC = () => {
  const setVaultPath = useVaultStore(s => s.setVaultPath)

  const handleChooseVault = useCallback(async () => {
    const path = await window.marrow.vault.pickVaultFolder()
    if (path) await setVaultPath(path)
  }, [setVaultPath])

  const handleCreateVault = useCallback(async () => {
    // Pick a location, then create default structure inside it
    const path = await window.marrow.vault.pickVaultFolder()
    if (!path) return
    await window.marrow.vault.createFolder(path, 'projects')
    await window.marrow.vault.createFolder(path, 'personal')
    await window.marrow.vault.createFolder(path, 'inbox')
    await setVaultPath(path)
  }, [setVaultPath])

  return (
    <div className={styles.root}>
      <div className={styles.card}>
        <div className={styles.logo}>M</div>
        <h1 className={styles.title}>Monomark</h1>
        <p className={styles.subtitle}>Your knowledge vault for markdown notes</p>

        <div className={styles.actions}>
          <button className={styles.primaryButton} onClick={handleChooseVault}>
            Choose vault folder
          </button>
          <button className={styles.secondaryButton} onClick={handleCreateVault}>
            Create new vault
          </button>
        </div>
      </div>
    </div>
  )
}
