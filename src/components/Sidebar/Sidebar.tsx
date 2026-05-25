import React, { useState, useCallback, useEffect, useRef } from 'react'
import { FolderPlus, FileText, Plus } from 'lucide-react'
import { useUIStore } from '../../store/useUIStore'
import { useVaultStore } from '../../store/useVaultStore'
import { useDialogStore } from '../../store/useDialogStore'
import { TreeNode, TreeContextMenu } from './TreeNode'
import { SettingsNav } from '../Settings/SettingsNav'
import type { ContextMenuState, DropTarget } from './TreeNode'
import type { VaultNode, VaultFolder } from '../../types/vault'
import styles from './Sidebar.module.css'

function getParentPath(p: string): string {
  return p.replace(/[\\/][^\\/]+$/, '')
}

function findFolder(nodes: VaultNode[], folderPath: string): VaultFolder | null {
  for (const node of nodes) {
    if (node.path === folderPath && node.kind === 'folder') return node as VaultFolder
    if (node.kind === 'folder') {
      const found = findFolder((node as VaultFolder).children, folderPath)
      if (found) return found
    }
  }
  return null
}

const NewMenu: React.FC<{ onNewNote: () => void; onNewFolder: () => void }> = ({ onNewNote, onNewFolder }) => {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button className={styles.newPill} onClick={() => setOpen(o => !o)}>
        <Plus size={14} strokeWidth={1.5} />
        New
      </button>
      {open && (
        <div className={styles.newMenu}>
          <button className={styles.newMenuItem} onClick={() => { onNewNote(); setOpen(false) }}>
            <FileText size={14} strokeWidth={1.5} />
            New Note
          </button>
          <button className={styles.newMenuItem} onClick={() => { onNewFolder(); setOpen(false) }}>
            <FolderPlus size={14} strokeWidth={1.5} />
            New Folder
          </button>
        </div>
      )}
    </div>
  )
}

export const Sidebar: React.FC = () => {
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const setRenamingPath = useUIStore(s => s.setRenamingPath)
  const focusedFolder = useUIStore(s => s.focusedFolder)
  const appMode = useUIStore(s => s.appMode)

  const tree = useVaultStore(s => s.tree)
  const vaultPath = useVaultStore(s => s.vaultPath)
  const refreshTree = useVaultStore(s => s.refreshTree)
  const document = useVaultStore(s => s.document)

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  // Drag & drop state (transient UI)
  const [draggingPath, setDraggingPath] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [treeScrolled, setTreeScrolled] = useState(false)
  const treeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = treeRef.current
    if (!el) return
    const onScroll = () => setTreeScrolled(el.scrollTop > 0)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [appMode])

  const isExternal = document.kind === 'external'

  const handleNewNote = useCallback(async () => {
    if (!vaultPath) return
    // Priority: last-clicked folder → current doc's parent folder → vault root
    let parentDir = vaultPath
    if (focusedFolder) {
      parentDir = focusedFolder
    } else if (document.kind === 'vault') {
      parentDir = document.path.replace(/[\\/][^\\/]+$/, '') || vaultPath
    }
    const path = await window.marrow.vault.createFile(parentDir, 'Untitled')
    await refreshTree()
    await useVaultStore.getState().openDocument(path)
    setRenamingPath(path)
  }, [vaultPath, focusedFolder, document, refreshTree, setRenamingPath])

  // Always creates at vault root
  const handleNewFolder = useCallback(async () => {
    if (!vaultPath) return
    const folderPath = await window.marrow.vault.createFolder(vaultPath, 'New Folder')
    await refreshTree()
    setRenamingPath(folderPath)
  }, [vaultPath, refreshTree, setRenamingPath])

  // ── Drag & Drop ────────────────────────────────────────────────────────────

  const handleDragStart = useCallback((path: string, kind: 'file' | 'folder') => {
    setDraggingPath(path)
  }, [])

  const handleDragEnd = useCallback(() => {
    setDraggingPath(null)
    setDropTarget(null)
  }, [])

  const handleSidebarDragOver = useCallback((e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes('application/x-monomark-node')) {
      e.dataTransfer.dropEffect = 'none'
    }
  }, [])

  const handleDrop = useCallback(async (
    dragging: { path: string; kind: 'file' | 'folder' },
    target: DropTarget
  ) => {
    setDraggingPath(null)
    setDropTarget(null)

    if (dragging.path === target.nodePath) return

    if (target.position === 'into') {
      if (dragging.kind === 'folder' && (
        target.nodePath === dragging.path ||
        target.nodePath.startsWith(dragging.path + '/') ||
        target.nodePath.startsWith(dragging.path + '\\')
      )) return

      const result = await window.marrow.vault.move(dragging.path, target.nodePath)

      if (result.conflict) {
        const name = dragging.path.replace(/.*[\\/]/, '')
        const confirmed = await useDialogStore.getState().confirm({
          title: 'Replace existing file?',
          message: `A file named "${name}" already exists in this folder. Replace it?`,
          confirmLabel: 'Replace',
          cancelLabel: 'Cancel',
          danger: true,
        })
        if (!confirmed) return
        await window.marrow.vault.delete(result.newPath)
        await window.marrow.vault.move(dragging.path, target.nodePath)
      }

      const srcParent = getParentPath(dragging.path)
      const srcOrder = await window.marrow.vault.getFolderOrder(srcParent)
      if (srcOrder) {
        const draggedName = dragging.path.replace(/.*[\\/]/, '')
        await window.marrow.vault.setFolderOrder(srcParent, srcOrder.filter(n => n !== draggedName))
      }

      const destOrder = await window.marrow.vault.getFolderOrder(target.nodePath)
      const itemName = dragging.path.replace(/.*[\\/]/, '')
      await window.marrow.vault.setFolderOrder(
        target.nodePath,
        destOrder ? [...destOrder, itemName] : [itemName]
      )

      await refreshTree()
      return
    }

    // before / after — reorder (possibly with cross-folder move)
    const draggingParent = getParentPath(dragging.path)

    if (draggingParent !== target.parentPath) {
      // Cross-folder before/after: move file then insert at the right position

      // 1. Snapshot dest children BEFORE move (tree reflects old state)
      const destChildren = target.parentPath === vaultPath
        ? tree
        : (findFolder(tree, target.parentPath)?.children ?? [])
      const destOnDisk = destChildren.map(c => c.name)
      const destOrder = await window.marrow.vault.getFolderOrder(target.parentPath)

      // 2. Move the file
      const result = await window.marrow.vault.move(dragging.path, target.parentPath)
      if (result.conflict) {
        const name = dragging.path.replace(/.*[\\/]/, '')
        const confirmed = await useDialogStore.getState().confirm({
          title: 'Replace existing file?',
          message: `"${name}" already exists here. Replace it?`,
          confirmLabel: 'Replace', cancelLabel: 'Cancel', danger: true,
        })
        if (!confirmed) return
        await window.marrow.vault.delete(result.newPath)
        await window.marrow.vault.move(dragging.path, target.parentPath)
      }

      // 3. Remove dragged item from source order
      const srcOrder = await window.marrow.vault.getFolderOrder(draggingParent)
      if (srcOrder) {
        const draggedName = dragging.path.replace(/.*[\\/]/, '')
        await window.marrow.vault.setFolderOrder(draggingParent, srcOrder.filter(n => n !== draggedName))
      }

      // 4. Build destination order with dragged item at the target position
      const draggedName = dragging.path.replace(/.*[\\/]/, '')
      const targetName  = target.nodePath.replace(/.*[\\/]/, '')
      const baseOrder = destOrder
        ? [...destOrder.filter(n => destOnDisk.includes(n)), ...destOnDisk.filter(n => !destOrder.includes(n))]
        : [...destOnDisk]
      const without = baseOrder.filter(n => n !== draggedName)
      const tIdx = without.indexOf(targetName)
      const iIdx = target.position === 'before' ? tIdx : tIdx + 1
      const newOrder = tIdx === -1
        ? [...without, draggedName]
        : [...without.slice(0, iIdx), draggedName, ...without.slice(iIdx)]
      await window.marrow.vault.setFolderOrder(target.parentPath, newOrder)

      await refreshTree()
      return
    }

    // Same-parent reorder
    const children = target.parentPath === vaultPath
      ? tree
      : (findFolder(tree, target.parentPath)?.children ?? [])
    const onDisk = children.map(c => c.name)
    const currentOrder = await window.marrow.vault.getFolderOrder(target.parentPath)

    let nameList: string[]
    if (currentOrder) {
      nameList = [
        ...currentOrder.filter(n => onDisk.includes(n)),
        ...onDisk.filter(n => !currentOrder.includes(n)),
      ]
    } else {
      nameList = [...onDisk]
    }

    const draggedName = dragging.path.replace(/.*[\\/]/, '')
    const targetName = target.nodePath.replace(/.*[\\/]/, '')
    const withoutDragged = nameList.filter(n => n !== draggedName)
    const targetIdx = withoutDragged.indexOf(targetName)
    if (targetIdx === -1) return

    const insertIdx = target.position === 'before' ? targetIdx : targetIdx + 1
    const newOrder = [
      ...withoutDragged.slice(0, insertIdx),
      draggedName,
      ...withoutDragged.slice(insertIdx),
    ]

    await window.marrow.vault.setFolderOrder(target.parentPath, newOrder)
    await refreshTree()
  }, [tree, refreshTree])

  return (
    <div
      className={styles.sidebar}
      style={{ width: isExternal ? 0 : (sidebarOpen ? 240 : 0) }}
      onDragOver={handleSidebarDragOver}
    >
      <div className={styles.clip}>
        <div className={styles.inner}>

          {appMode === 'settings' ? (
            <SettingsNav />
          ) : (
          <>

          {/* New button with dropdown */}
          <div className={styles.topActions}>
            <NewMenu onNewNote={handleNewNote} onNewFolder={handleNewFolder} />
          </div>

          {/* Spacer between actions and tree */}
          <div className={styles.sectionLabel} />
          <div className={`${styles.treeWrap} ${treeScrolled ? styles.treeWrapScrolled : ''}`}>
          <div className={styles.tree} ref={treeRef}>
              {tree.length === 0 ? (
                <div style={{ padding: '8px 12px', fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
                  {vaultPath ? 'Vault is empty' : 'No vault selected'}
                </div>
              ) : (
                tree.map(node => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    parentPath={vaultPath ?? ''}
                    setContextMenu={setContextMenu}
                    draggingPath={draggingPath}
                    dropTarget={dropTarget}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onDropTarget={setDropTarget}
                    onDrop={handleDrop}
                  />
                ))
              )}
            </div>
          </div>

          </>
          )}

        </div>
      </div>

      {contextMenu && (
        <TreeContextMenu
          menu={contextMenu}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  )
}
