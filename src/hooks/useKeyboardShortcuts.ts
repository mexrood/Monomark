import { useEffect } from 'react'
import { useVaultStore } from '../store/useVaultStore'
import { useUIStore } from '../store/useUIStore'
import { useRelatedStore } from '../store/useRelatedStore'
import { editorRegistry } from '../utils/editorRegistry'
import { blockIdAtCursor } from '../components/Document/RichEditor/RelatedHints'
import { maybeInitProject } from '../utils/initProject'

export function useKeyboardShortcuts() {
  useEffect(() => {
    const handler = async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey

      // Escape — close settings or search palette
      if (e.key === 'Escape') {
        if (useUIStore.getState().appMode === 'settings') {
          useUIStore.getState().closeSettings()
          return
        }
        if (useUIStore.getState().searchPaletteOpen) {
          useUIStore.getState().closeSearchPalette()
          return
        }
      }

      // Ctrl/Cmd + K — open search palette
      if (mod && e.key === 'k') {
        e.preventDefault()
        useUIStore.getState().openSearchPalette()
        return
      }

      // Ctrl/Cmd + Shift + F — find thoughts related to the block at the cursor
      if (mod && e.shiftKey && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault()
        const editor = editorRegistry.get()
        if (!editor) return
        const bid = blockIdAtCursor(editor.state)
        if (bid) useRelatedStore.getState().openPanel(bid)
        return
      }

      // Ctrl/Cmd + B — toggle sidebar
      if (mod && e.key === 'b') {
        e.preventDefault()
        useUIStore.getState().toggleSidebar()
        return
      }

      // Ctrl/Cmd + N — new note
      if (mod && !e.shiftKey && e.key === 'n') {
        e.preventDefault()
        const { vaultPath, document } = useVaultStore.getState()
        if (!vaultPath || !window.marrow?.vault) return
        let parentDir = vaultPath
        if (document.kind === 'vault') {
          parentDir = document.path.replace(/[\\/][^\\/]+$/, '') || vaultPath
        }
        const path = await window.marrow.vault.createFile(parentDir, 'Untitled')
        await useVaultStore.getState().refreshTree()
        await useVaultStore.getState().openDocument(path)
        return
      }

      // Ctrl/Cmd + Shift + N — new folder
      if (mod && e.shiftKey && e.key === 'N') {
        e.preventDefault()
        const { vaultPath, document } = useVaultStore.getState()
        if (!vaultPath || !window.marrow?.vault) return
        const parentDir = document.kind === 'vault'
          ? document.path.replace(/[\\/][^\\/]+$/, '') || vaultPath
          : vaultPath
        const folderPath = await window.marrow.vault.createFolder(parentDir, 'New Folder')
        await useVaultStore.getState().refreshTree()
        await maybeInitProject(folderPath)
        return
      }

      // Ctrl/Cmd + S — force save
      if (mod && !e.shiftKey && e.key === 's') {
        const doc = useVaultStore.getState().document
        if (doc.kind !== 'vault' || !window.marrow?.vault) return
        await window.marrow.vault.writeFile(doc.path, doc.content)
        useVaultStore.setState(s => ({
          document: s.document.kind === 'vault' ? { ...s.document, dirty: false } : s.document,
        }))
        return
      }

      // Ctrl/Cmd + O — open file
      if (mod && e.key === 'o') {
        e.preventDefault()
        if (!window.marrow?.vault) return
        const path = await window.marrow.vault.pickVaultFolder()
        if (path) await useVaultStore.getState().openDocument(path)
        return
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])
}
