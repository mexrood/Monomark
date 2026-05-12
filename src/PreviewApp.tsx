import React, { useEffect, useState, useCallback } from 'react'
import { FileText, X, Sun, Moon } from 'lucide-react'
import { ExternalView } from './components/Document/ExternalView'
import { useUIStore } from './store/useUIStore'
import styles from './PreviewApp.module.css'

interface PreviewData {
  filePath: string
  content: string
}

const Corners: React.FC = () => (
  <div className={styles.corners}>
    <div className={`${styles.corner} ${styles.cornerTL}`} />
    <div className={`${styles.corner} ${styles.cornerTR}`} />
    <div className={`${styles.corner} ${styles.cornerBL}`} />
    <div className={`${styles.corner} ${styles.cornerBR}`} />
  </div>
)

export const PreviewApp: React.FC = () => {
  const [data, setData] = useState<PreviewData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const theme = useUIStore(s => s.theme)
  const toggleTheme = useUIStore(s => s.toggleTheme)

  // Receive file data from the main process
  useEffect(() => {
    window.marrow.preview?.onLoad((incoming) => {
      setData(incoming)
      setSaved(false)
    })
    return () => { window.marrow.preview?.offLoad() }
  }, [])

  const handleClose = useCallback(() => {
    window.marrow.window.close()
  }, [])

  const handleSave = useCallback(async () => {
    if (!data || saving) return
    setSaving(true)
    try {
      const vaultPath = await window.marrow.vault.getVaultPath()
      if (!vaultPath) return

      const sep = vaultPath.includes('/') ? '/' : '\\'
      const filename = data.filePath.replace(/\\/g, '/').split('/').pop()!
      const inboxDir = `${vaultPath}${sep}inbox`
      const targetPath = `${inboxDir}${sep}${filename}`

      // Avoid overwriting an existing file
      let finalPath = targetPath
      const exists = await window.marrow.vault.exists(targetPath)
      if (exists) {
        const [name, ext] = filename.endsWith('.md')
          ? [filename.slice(0, -3), '.md']
          : [filename, '']
        for (let i = 1; i < 100; i++) {
          const candidate = `${inboxDir}${sep}${name} (${i})${ext}`
          const taken = await window.marrow.vault.exists(candidate)
          if (!taken) { finalPath = candidate; break }
        }
      }

      await window.marrow.vault.writeFile(finalPath, data.content)
      setSaved(true)
      // Show the file in the main window, then close this preview window
      setTimeout(() => window.marrow.preview?.openInMain(finalPath), 800)
    } catch (e) {
      console.error('[preview] save failed', e)
    } finally {
      setSaving(false)
    }
  }, [data, saving])

  const fileName = data?.filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const dirPath = data?.filePath
    ? (() => {
        const parts = data.filePath.replace(/\\/g, '/').split('/')
        parts.pop()
        return parts.join('/')
      })()
    : ''

  return (
    <div className={styles.app}>
      <Corners />

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.dragRegion} />
        <div className={styles.headerLeft}>
          <FileText size={13} strokeWidth={1.5} className={styles.fileIcon} />
          <span className={styles.fileName}>{fileName || 'Preview'}</span>
        </div>
        <div className={styles.headerRight}>
          <button
            className={styles.iconBtn}
            onClick={toggleTheme}
            title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
            tabIndex={-1}
          >
            {theme === 'dark'
              ? <Sun size={14} strokeWidth={1.5} />
              : <Moon size={14} strokeWidth={1.5} />
            }
          </button>
          <div className={styles.winControls}>
            <button
              className={`${styles.winBtn} ${styles.winClose}`}
              onClick={handleClose}
              title="Close"
              tabIndex={-1}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className={styles.content}>
        {data ? (
          <ExternalView content={data.content} filePath={data.filePath} />
        ) : (
          <div className={styles.empty}>
            <FileText size={32} strokeWidth={1} className={styles.emptyIcon} />
            <span>Waiting for file…</span>
          </div>
        )}
      </div>

      {/* ── Footer ── */}
      {data && (
        <div className={styles.footer}>
          <div className={styles.footerMeta}>
            <span className={styles.footerDir}>{dirPath}</span>
            <span className={styles.footerSep}>/</span>
            <span className={styles.footerFile}>{fileName}</span>
          </div>
          <div className={styles.footerActions}>
            <button
              className={styles.dismissBtn}
              onClick={handleClose}
              tabIndex={-1}
            >
              <X size={12} />
              Dismiss
            </button>
            <button
              className={`${styles.saveBtn} ${saved ? styles.saveBtnDone : ''}`}
              onClick={handleSave}
              disabled={saving || saved}
              tabIndex={-1}
            >
              {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save to Vault'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
