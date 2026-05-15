import React, { useEffect } from 'react'
import styles from './App.module.css'
import { TitleBar } from './components/TitleBar/TitleBar'
import { Sidebar } from './components/Sidebar/Sidebar'
import { Document } from './components/Document/Document'
import { Welcome } from './components/Welcome/Welcome'
import { ConfirmDialog } from './components/Dialog/ConfirmDialog'
import { SettingsView } from './components/Settings/SettingsView'
import { ToastContainer } from './components/Toast/Toast'
import { McpStatusDot } from './components/McpStatusDot/McpStatusDot'
import { ScrollBar } from './components/ScrollBar/ScrollBar'
import { SearchPalette } from './components/SearchPalette/SearchPalette'
import { useVaultInit } from './hooks/useVaultInit'
import { useFileWatcher } from './hooks/useFileWatcher'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useVaultStore } from './store/useVaultStore'
import { useSearchStore } from './store/useSearchStore'
import { useDialogStore } from './store/useDialogStore'
import { useAppStore } from './store/useAppStore'
import { useUIStore } from './store/useUIStore'
import { useDragStore } from './store/useDragStore'
import { flattenTree } from './store/useVaultStore'


const MainApp: React.FC = () => {
  useFileWatcher()
  useKeyboardShortcuts()

  // Init app-level store (version, autostart, MCP status)
  useEffect(() => { useAppStore.getState().init() }, [])

  // Restore last open document
  useEffect(() => {
    const lastDoc = localStorage.getItem('monomark-last-doc')
    if (!lastDoc) return
    const tick = setTimeout(() => {
      useVaultStore.getState().openDocument(lastDoc).catch(() => {})
    }, 0)
    return () => clearTimeout(tick)
  }, [])

  // Register OS file-open handler (macOS open-file + Windows second-instance)
  useEffect(() => {
    if (!window.marrow?.fileOpen) return
    const handleOpenFile = (path: string) => {
      useVaultStore.getState().openDocument(path)
    }
    window.marrow.fileOpen.onOpenFile(handleOpenFile)
    return () => window.marrow.fileOpen?.offOpenFile()
  }, [])

  // Window X button → hide to tray (with unsaved-changes prompt)
  // monomark:close-requested is fired by TitleBar X
  // monomark:quit-requested is fired by "Quit Marrow" in tray/Settings
  useEffect(() => {
    const handleCloseRequested = async () => {
      const doc = useVaultStore.getState().document
      if (doc.kind === 'vault' && doc.dirty) {
        const confirmed = await useDialogStore.getState().confirm({
          title: 'Unsaved changes',
          message: `"${doc.path.split(/[\\/]/).pop()}" has unsaved changes. Hide anyway?`,
          confirmLabel: 'Hide without saving',
          cancelLabel: 'Cancel',
          danger: false,
        })
        if (!confirmed) return
      }
      // Hide to tray — main process intercepts window:close and hides
      window.marrow.window.close()
    }

    const handleQuitRequested = async () => {
      const doc = useVaultStore.getState().document
      if (doc.kind === 'vault' && doc.dirty) {
        const confirmed = await useDialogStore.getState().confirm({
          title: 'Unsaved changes',
          message: `"${doc.path.split(/[\\/]/).pop()}" has unsaved changes. Quit anyway?`,
          confirmLabel: 'Quit without saving',
          cancelLabel: 'Cancel',
          danger: true,
        })
        if (!confirmed) return
      }
      await window.marrow.app?.quit()
    }

    window.addEventListener('monomark:close-requested', handleCloseRequested)
    window.addEventListener('monomark:quit-requested', handleQuitRequested)
    return () => {
      window.removeEventListener('monomark:close-requested', handleCloseRequested)
      window.removeEventListener('monomark:quit-requested', handleQuitRequested)
    }
  }, [])

  // Build search index when tree loads
  const tree = useVaultStore(s => s.tree)
  const rebuildIndex = useSearchStore(s => s.rebuildIndex)

  useEffect(() => {
    if (!tree.length || !window.marrow?.vault) return
    const files = flattenTree(tree)
    Promise.all(
      files.map(async f => ({
        id: f.path,
        title: f.name.replace(/\.md$/i, ''),
        content: await window.marrow.vault.readFile(f.path).catch(() => ''),
      }))
    ).then(docs => rebuildIndex(docs))
  }, [tree, rebuildIndex])

  const appMode = useUIStore(s => s.appMode)
  const openSettings = useUIStore(s => s.openSettings)
  const searchPaletteOpen = useUIStore(s => s.searchPaletteOpen)

  // ── External file drag & drop ──────────────────────────────────────────────
  // Window-level listeners coordinate a single source of truth (useDragStore)
  // for: feedback overlay, sidebar dashed-border styling, and target folder.
  useEffect(() => {
    const hasFiles = (e: DragEvent) =>
      !!e.dataTransfer &&
      Array.from(e.dataTransfer.types).includes('Files') &&
      !Array.from(e.dataTransfer.types).includes('application/x-monomark-node')

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      useDragStore.getState().setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e: DragEvent) => {
      // Browsers fire dragleave on inner element transitions too; only act on
      // a leave to "outside the window" (relatedTarget === null).
      if (e.relatedTarget === null) {
        useDragStore.getState().reset()
      }
    }
    const onDrop = async (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      const target = useDragStore.getState().hoveredFolder
      useDragStore.getState().reset()
      const files = Array.from(e.dataTransfer?.files || [])
      if (files.length === 0) return
      await useVaultStore.getState().importFiles(files, target)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <>
      <TitleBar onOpenSettings={() => openSettings()} />
      <McpStatusDot />
      {searchPaletteOpen && <SearchPalette />}
      <main className={styles.main}>
        <Sidebar />
        <div className={styles.contentWrap}>
          <div className={styles.navBlur}>
            <div className={styles.blurLayer1} />
            <div className={styles.blurLayer2} />
            <div className={styles.blurLayer3} />
            <div className={styles.blurLayer4} />
            <div className={styles.gradientOverlay} />
          </div>
          {appMode === 'settings' ? <SettingsView /> : <Document />}
          <ScrollBar />
        </div>
      </main>
      <ToastContainer />
    </>
  )
}

export const App: React.FC = () => {
  const initState = useVaultInit()
  const vaultPath = useVaultStore(s => s.vaultPath)

  if (initState === 'loading') {
    return (
      <div className={styles.app} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>Loading…</div>
      </div>
    )
  }

  if (initState === 'welcome' && !vaultPath) {
    return (
      <div className={styles.app}>
        <Welcome />
      </div>
    )
  }

  return (
    <div className={styles.app}>
      <MainApp />
      <ConfirmDialog />
      <div id="popup-portal" className={styles.popupPortal} />
    </div>
  )
}
