import { useEffect, useCallback } from 'react'
import { useVaultStore } from '../store/useVaultStore'
import { useSearchStore } from '../store/useSearchStore'
import { autoSavingPaths } from '../utils/autoSaveGuard'

export function useFileWatcher() {
  const refreshTree = useVaultStore(s => s.refreshTree)
  const rebuildIndex = useSearchStore(s => s.rebuildIndex)

  const handleTreeChange = useCallback(async () => {
    await refreshTree()
    // Rebuild search index after tree changes
    const tree = useVaultStore.getState().tree
    const vaultPath = useVaultStore.getState().vaultPath
    if (vaultPath) {
      const allFiles = flattenTree(tree)
      const docs = await Promise.all(
        allFiles.map(async f => ({
          id: f.path,
          title: f.name.replace(/\.md$/i, ''),
          content: await window.marrow.vault.readFile(f.path).catch(() => ''),
        }))
      )
      await rebuildIndex(docs)
    }
  }, [refreshTree, rebuildIndex])

  const handleFileContentChange = useCallback(async (changedPath: string) => {
    // Ignore watcher events caused by our own auto-save writes.
    if (autoSavingPaths.has(changedPath)) return

    const store = useVaultStore.getState()
    const doc = store.document

    if (doc.kind === 'vault' && doc.path === changedPath) {
      if (doc.dirty) {
        // Confirm before reloading — dirty buffer vs external change
        const choice = await window.marrow.util?.showMessageBox({
          type: 'question',
          title: 'File changed externally',
          message: `"${changedPath.split(/[\\/]/).pop()}" was modified on disk.`,
          buttons: ['Keep my version', 'Reload from disk'],
          defaultId: 1,
          cancelId: 0,
        })
        if (choice !== 1) return
      }
      // Silent reload (Claude Code edited the file)
      const content = await window.marrow.vault.readFile(changedPath)
      useVaultStore.setState({
        document: { kind: 'vault', path: changedPath, content, dirty: false },
      })
    }

    // Incremental search index update for changed file
    const { title } = { title: changedPath.split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? '' }
    const content = await window.marrow.vault.readFile(changedPath).catch(() => '')
    useSearchStore.getState().updateDoc({ id: changedPath, title, content })
  }, [])

  useEffect(() => {
    if (!window.marrow?.watcher) return

    window.marrow.watcher.onTreeChange(handleTreeChange)
    window.marrow.watcher.onFileContentChange(handleFileContentChange)

    return () => {
      window.marrow.watcher?.offTreeChange(handleTreeChange)
      // offFileContentChange signature differs — pass no-op
    }
  }, [handleTreeChange, handleFileContentChange])
}

// ── Helpers ───────────────────────────────────────────────────────────────────

import type { VaultNode, VaultFile } from '../types/vault'

function flattenTree(nodes: VaultNode[]): VaultFile[] {
  const files: VaultFile[] = []
  for (const node of nodes) {
    if (node.kind === 'file') files.push(node)
    else files.push(...flattenTree(node.children))
  }
  return files
}
