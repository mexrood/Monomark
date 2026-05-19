import React, { useState, useRef, useEffect, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { ChevronRight, Folder, FolderOpen, FileText, MoreVertical } from 'lucide-react'
import type { VaultNode } from '../../types/vault'
import { useVaultStore } from '../../store/useVaultStore'
import { useUIStore } from '../../store/useUIStore'
import { useDragStore } from '../../store/useDragStore'
import { useSummaryStore } from '../../store/useSummaryStore'
import styles from './Sidebar.module.css'

export interface ContextMenuState {
  node: VaultNode
  x: number
  y: number
}

export interface DropTarget {
  nodePath: string
  nodeKind: 'file' | 'folder'
  parentPath: string
  position: 'before' | 'after' | 'into'
}

interface TreeNodeProps {
  node: VaultNode
  depth: number
  parentPath: string
  setContextMenu: (m: ContextMenuState | null) => void
  draggingPath: string | null
  dropTarget: DropTarget | null
  onDragStart: (path: string, kind: 'file' | 'folder') => void
  onDragEnd: () => void
  onDropTarget: (target: DropTarget | null) => void
  onDrop: (dragging: { path: string; kind: 'file' | 'folder' }, target: DropTarget) => void
}

function displayName(node: VaultNode): string {
  if (node.kind === 'file') return node.name.replace(/\.md$/i, '')
  return node.name
}

function clampToWindow(x: number, y: number, popupW: number, popupH: number) {
  const margin = 8
  const maxX = window.innerWidth - popupW - margin
  const maxY = window.innerHeight - popupH - margin
  return {
    x: Math.max(margin, Math.min(x, maxX)),
    y: Math.max(margin, Math.min(y, maxY)),
  }
}

export const TreeNode: React.FC<TreeNodeProps> = ({
  node, depth, parentPath,
  setContextMenu,
  draggingPath, dropTarget,
  onDragStart, onDragEnd, onDropTarget, onDrop,
}) => {
  const document = useVaultStore(s => s.document)
  const expandedFolders = useVaultStore(s => s.expandedFolders)
  const toggleFolder = useVaultStore(s => s.toggleFolder)
  const openDocument = useVaultStore(s => s.openDocument)
  const refreshTree = useVaultStore(s => s.refreshTree)

  const renamingPath = useUIStore(s => s.renamingPath)
  const setRenamingPath = useUIStore(s => s.setRenamingPath)
  const setFocusedFolder = useUIStore(s => s.setFocusedFolder)

  // Phase D — one-line AI summary shown under the file name (files only).
  const summary = useSummaryStore(s =>
    node.kind === 'file' ? s.summaries[node.path] : undefined
  )

  const isActive = document.kind === 'vault' && document.path === node.path
  const isOpen = node.kind === 'folder' && expandedFolders.has(node.path)
  const isRenaming = renamingPath === node.path

  // External drag state (drives dashed/solid drop-target outlines on folders).
  const externalDragging = useDragStore(s => s.isDragging)
  const hoveredFolder = useDragStore(s => s.hoveredFolder)
  const isExternalDropCandidate = node.kind === 'folder' && externalDragging
  const isExternalDropActive = isExternalDropCandidate && hoveredFolder === node.path
  const autoExpandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [renameValue, setRenameValue] = useState('')
  const renameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isRenaming) {
      setRenameValue(displayName(node))
      setTimeout(() => {
        renameRef.current?.focus()
        renameRef.current?.select()
      }, 0)
    }
  }, [isRenaming, node])

  const handleClick = useCallback(() => {
    if (isRenaming) return
    if (node.kind === 'folder') {
      toggleFolder(node.path)
      setFocusedFolder(node.path)
    } else {
      openDocument(node.path)
      setFocusedFolder(parentPath)
    }
  }, [isRenaming, node, parentPath, toggleFolder, openDocument, setFocusedFolder])

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setRenamingPath(node.path)
  }, [node.path, setRenamingPath])

  const handleDotClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const clamped = clampToWindow(rect.right + 4, rect.top, 160, 140)
    setContextMenu({ node, x: clamped.x, y: clamped.y })
  }, [node, setContextMenu])

  const commitRename = useCallback(async () => {
    const trimmed = renameValue.trim()
    setRenamingPath(null)
    if (!trimmed || trimmed === displayName(node)) return
    const newName = node.kind === 'file'
      ? (trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`)
      : trimmed
    try {
      await window.marrow.vault.rename(node.path, newName)
      await refreshTree()
    } catch { /* rename failed */ }
  }, [renameValue, node, refreshTree, setRenamingPath])

  const handleRenameKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitRename()
    if (e.key === 'Escape') setRenamingPath(null)
  }, [commitRename, setRenamingPath])

  // ── Drag & Drop ─────────────────────────────────────────────────────────────

  const computePosition = useCallback((e: React.DragEvent): 'before' | 'after' | 'into' => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const relY = (e.clientY - rect.top) / rect.height
    if (node.kind === 'folder') {
      if (relY < 0.25) return 'before'
      if (relY > 0.75) return 'after'
      return 'into'
    }
    return relY < 0.5 ? 'before' : 'after'
  }, [node.kind])

  const handleDragStart = useCallback((e: React.DragEvent) => {
    e.stopPropagation()
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData(
      'application/x-monomark-node',
      JSON.stringify({ path: node.path, kind: node.kind })
    )
    onDragStart(node.path, node.kind)
  }, [node, onDragStart])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    const types = e.dataTransfer.types
    const isInternal = types.includes('application/x-monomark-node')
    const isExternal = types.includes('Files') && !isInternal

    if (isInternal) {
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'move'
      onDropTarget({ nodePath: node.path, nodeKind: node.kind, parentPath, position: computePosition(e) })
      return
    }

    if (isExternal && node.kind === 'folder') {
      // Accept the drop on this folder; the window-level handler reads
      // useDragStore.hoveredFolder to know the target.
      e.preventDefault()
      e.stopPropagation()
      e.dataTransfer.dropEffect = 'copy'
      if (hoveredFolder !== node.path) {
        useDragStore.getState().setHoveredFolder(node.path)
      }
      // Auto-expand collapsed folders after 700ms of hover.
      if (!isOpen && !autoExpandTimerRef.current) {
        autoExpandTimerRef.current = setTimeout(() => {
          toggleFolder(node.path)
          autoExpandTimerRef.current = null
        }, 700)
      }
    }
  }, [node, parentPath, computePosition, onDropTarget, hoveredFolder, isOpen, toggleFolder])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
      onDropTarget(null)
      if (autoExpandTimerRef.current) {
        clearTimeout(autoExpandTimerRef.current)
        autoExpandTimerRef.current = null
      }
      // Only clear hoveredFolder if we are still the one set — another folder
      // entered may have replaced it already.
      if (useDragStore.getState().hoveredFolder === node.path) {
        useDragStore.getState().setHoveredFolder(null)
      }
    }
  }, [onDropTarget, node.path])

  useEffect(() => () => {
    if (autoExpandTimerRef.current) clearTimeout(autoExpandTimerRef.current)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    const data = e.dataTransfer.getData('application/x-monomark-node')
    if (!data) return  // external file — let it bubble to window-level handler
    e.preventDefault()
    e.stopPropagation()
    const dragging = JSON.parse(data) as { path: string; kind: 'file' | 'folder' }
    onDrop(dragging, { nodePath: node.path, nodeKind: node.kind, parentPath, position: computePosition(e) })
  }, [node, parentPath, computePosition, onDrop])

  // ── Styles ──────────────────────────────────────────────────────────────────

  const paddingLeft = 8 + depth * 16

  const isDragging = draggingPath === node.path
  const isDragOver = dropTarget?.nodePath === node.path && dropTarget?.position === 'into'
  const isInsertBefore = dropTarget?.nodePath === node.path && dropTarget?.position === 'before'
  const isInsertAfter = dropTarget?.nodePath === node.path && dropTarget?.position === 'after'

  const rowClass = [
    styles.treeRow,
    summary ? styles.treeRowSummary : '',
    isActive ? styles.treeRowActive : '',
    isDragging ? styles.treeRowDragging : '',
    isDragOver ? styles.treeRowDragOver : '',
    isInsertBefore ? styles.treeRowInsertBefore : '',
    isInsertAfter ? styles.treeRowInsertAfter : '',
    isExternalDropCandidate ? styles.treeRowExtCandidate : '',
    isExternalDropActive ? styles.treeRowExtActive : '',
  ].filter(Boolean).join(' ')

  return (
    <div>
      <div
        className={rowClass}
        style={{ paddingLeft, paddingRight: 4 }}
        onClick={handleClick}
        onDoubleClick={handleDoubleClick}
        draggable={!isRenaming}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onDragEnd={onDragEnd}
      >
        {/* Chevron (folders only) */}
        {node.kind === 'folder' ? (
          <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`}>
            <ChevronRight size={12} strokeWidth={1.5} />
          </span>
        ) : (
          <span style={{ width: 16, flexShrink: 0 }} />
        )}

        {/* File / folder icon */}
        <span className={styles.nodeIcon}>
          {node.kind === 'folder'
            ? (isOpen
                ? <FolderOpen size={15} strokeWidth={1.5} />
                : <Folder size={15} strokeWidth={1.5} />)
            : <FileText size={14} strokeWidth={1.5} />
          }
        </span>

        {isRenaming ? (
          <input
            ref={renameRef}
            className={styles.renameInput}
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleRenameKey}
            onClick={e => e.stopPropagation()}
            maxLength={120}
          />
        ) : (
          <>
            <div className={styles.nodeText}>
              <span className={`${styles.nodeName} ${node.kind === 'folder' ? styles.nodeNameFolder : ''}`}>
                {displayName(node)}
              </span>
              {summary && <span className={styles.nodeSummary}>{summary}</span>}
            </div>
            <button
              className={styles.dotButton}
              onClick={handleDotClick}
              title="More options"
            >
              <MoreVertical size={14} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {node.kind === 'folder' && isOpen && (
        <div className={styles.children}>
          {node.children.length === 0 ? (
            <div style={{ paddingLeft: paddingLeft + 20, paddingTop: 2, paddingBottom: 2, color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)' }}>
              Empty
            </div>
          ) : (
            node.children.map(child => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                parentPath={node.path}
                setContextMenu={setContextMenu}
                draggingPath={draggingPath}
                dropTarget={dropTarget}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDropTarget={onDropTarget}
                onDrop={onDrop}
              />
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Context menu ──────────────────────────────────────────────────────────────

interface TreeContextMenuProps {
  menu: ContextMenuState
  onClose: () => void
}

export const TreeContextMenu: React.FC<TreeContextMenuProps> = ({ menu, onClose }) => {
  const refreshTree = useVaultStore(s => s.refreshTree)
  const closeDocument = useVaultStore(s => s.closeDocument)
  const vaultDoc = useVaultStore(s => s.document)
  const setRenamingPath = useUIStore(s => s.setRenamingPath)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose()
    }
    window.addEventListener('mousedown', handler)
    return () => window.removeEventListener('mousedown', handler)
  }, [onClose])

  const act = useCallback((fn: () => void) => () => { fn(); onClose() }, [onClose])

  const showInFolder = act(() => window.marrow.util?.showInFolder(menu.node.path))
  const copyPath = act(() => window.marrow.util?.copyToClipboard(menu.node.path))
  const rename = act(() => setRenamingPath(menu.node.path))

  const deleteFn = act(async () => {
    if (vaultDoc.kind === 'vault' && vaultDoc.path === menu.node.path) closeDocument()
    await window.marrow.vault.delete(menu.node.path)
    await refreshTree()
  })

  const portal = window.document.getElementById('popup-portal')

  const menuEl = (
    <div
      ref={menuRef}
      className={styles.contextMenu}
      style={{ position: 'absolute', left: menu.x, top: menu.y }}
    >
      <button className={styles.contextItem} onClick={showInFolder}>Show in Folder</button>
      <button className={styles.contextItem} onClick={copyPath}>Copy Path</button>
      <button className={styles.contextItem} onClick={rename}>Rename</button>
      <div className={styles.menuDivider} />
      <button className={`${styles.contextItem} ${styles.contextDanger}`} onClick={deleteFn}>
        Move to Trash
      </button>
    </div>
  )

  if (portal) return ReactDOM.createPortal(menuEl, portal)
  return menuEl
}
