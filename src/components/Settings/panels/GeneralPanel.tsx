import React from 'react'
import { Moon, Sun, FolderOpen } from 'lucide-react'
import { Row } from '../SettingsDialog'
import styles from '../SettingsDialog.module.css'
import { useUIStore } from '../../../store/useUIStore'
import { useVaultStore } from '../../../store/useVaultStore'

export const GeneralPanel: React.FC = () => {
  const theme = useUIStore(s => s.theme)
  const toggleTheme = useUIStore(s => s.toggleTheme)
  const closeSettings = useUIStore(s => s.closeSettings)

  const handleChangeVault = async () => {
    const path = await window.marrow.vault.pickVaultFolder()
    if (path) {
      await useVaultStore.getState().setVaultPath(path)
      useVaultStore.getState().closeDocument()
      closeSettings()
    }
  }

  return (
    <>
      <Row label="Theme" sub="Switch between light and dark appearance">
        <button className={styles.actionBtn} onClick={toggleTheme} tabIndex={-1}>
          {theme === 'dark'
            ? <><Moon size={13} strokeWidth={1.5} /><span>Dark</span></>
            : <><Sun size={13} strokeWidth={1.5} /><span>Light</span></>
          }
        </button>
      </Row>
      <Row label="Vault folder" sub="The directory where your notes are stored">
        <button className={styles.actionBtn} onClick={handleChangeVault} tabIndex={-1}>
          <FolderOpen size={13} strokeWidth={1.5} />
          <span>Change…</span>
        </button>
      </Row>
    </>
  )
}
