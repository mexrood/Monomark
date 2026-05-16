import React, { useState, useCallback, useEffect, useRef } from 'react'
import { PanelLeft, Menu, ArrowLeft, Search } from 'lucide-react'
import styles from './TitleBar.module.css'
import { useUIStore } from '../../store/useUIStore'
import { useVaultStore } from '../../store/useVaultStore'
import { maybeInitProject } from '../../utils/initProject'

// ── Platform shortcuts ────────────────────────────────────────────────────────

const isMac = navigator.platform.toUpperCase().startsWith('MAC')
const mod = isMac ? '⌘' : 'Ctrl+'
const shift = isMac ? '⇧' : 'Shift+'

// ── Breadcrumb ────────────────────────────────────────────────────────────────

function useBreadcrumb() {
  const doc = useVaultStore(s => s.document)
  const vaultPath = useVaultStore(s => s.vaultPath)

  if (doc.kind === 'empty') return null

  if (doc.kind === 'external') {
    const name = doc.path.replace(/\\/g, '/').split('/').pop() ?? doc.path
    return { prefix: 'External', name, dirty: false }
  }

  // vault: build prefix relative to vault root
  const vaultSlash = (vaultPath ?? '').replace(/\\/g, '/').replace(/\/?$/, '/')
  const rel = doc.path.replace(/\\/g, '/').replace(vaultSlash, '')
  const parts = rel.split('/')
  const name = parts.pop()?.replace(/\.md$/i, '') ?? ''
  const prefix = parts.join(' / ')

  return { prefix, name, dirty: doc.dirty }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface TitleBarProps {
  onOpenSettings?(): void
}

const TAB_LABELS: Record<string, string> = {
  general: 'General',
  launch:  'Launch',
  mcp:     'Server (MCP)',
  about:   'About',
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
  const sidebarOpen = useUIStore(s => s.sidebarOpen)
  const toggleSidebar = useUIStore(s => s.toggleSidebar)
  const setRenamingPath = useUIStore(s => s.setRenamingPath)
  const focusedFolder = useUIStore(s => s.focusedFolder)
  const appMode = useUIStore(s => s.appMode)
  const settingsTab = useUIStore(s => s.settingsTab)
  const closeSettings = useUIStore(s => s.closeSettings)
  const openSearchPalette = useUIStore(s => s.openSearchPalette)
  const docState = useVaultStore(s => s.document)
  const vaultPath = useVaultStore(s => s.vaultPath)
  const refreshTree = useVaultStore(s => s.refreshTree)
  const openDocument = useVaultStore(s => s.openDocument)

  const [isMaximized, setIsMaximized] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const breadcrumb = useBreadcrumb()

  const isExternal = docState.kind === 'external'

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const handleMinimize = useCallback(() => window.marrow?.window.minimize(), [])
  const handleMaximize = useCallback(async () => {
    await window.marrow?.window.maximize()
    setIsMaximized(await window.marrow?.window.isMaximized() ?? false)
  }, [])
  const handleClose = useCallback(() => {
    window.dispatchEvent(new Event('monomark:close-requested'))
  }, [])

  const handleBreadcrumbDoubleClick = useCallback(() => {
    if (docState.kind !== 'vault') return
    if (!sidebarOpen) toggleSidebar()
    setRenamingPath(docState.path)
  }, [docState, sidebarOpen, toggleSidebar, setRenamingPath])

  // ── Menu actions ──────────────────────────────────────────────────────────

  const menuAction = useCallback((fn: () => void) => {
    setMenuOpen(false)
    fn()
  }, [])

  const handleNewNote = useCallback(async () => {
    if (!vaultPath) return
    let parentDir = vaultPath
    if (focusedFolder) {
      parentDir = focusedFolder
    } else if (docState.kind === 'vault') {
      parentDir = docState.path.replace(/[\\/][^\\/]+$/, '') || vaultPath
    }
    const path = await window.marrow.vault.createFile(parentDir, 'Untitled')
    await refreshTree()
    await openDocument(path)
  }, [vaultPath, focusedFolder, docState, refreshTree, openDocument])

  const handleNewFolder = useCallback(async () => {
    if (!vaultPath) return
    const parentDir = docState.kind === 'vault'
      ? docState.path.replace(/[\\/][^\\/]+$/, '') || vaultPath
      : vaultPath
    const folderPath = await window.marrow.vault.createFolder(parentDir, 'New Folder')
    await refreshTree()
    await maybeInitProject(folderPath)
  }, [vaultPath, docState, refreshTree])

  const handleOpenFile = useCallback(async () => {
    const path = await window.marrow.vault.pickFile()
    if (path) await openDocument(path)
  }, [openDocument])

  const handleChangeVault = useCallback(async () => {
    const path = await window.marrow.vault.pickVaultFolder()
    if (path) {
      await useVaultStore.getState().setVaultPath(path)
      useVaultStore.getState().closeDocument()
    }
  }, [])

  return (
    <div className={styles.titleBar}>

      {/* ── Left ── */}
      <div className={styles.leftControls}>
        {appMode === 'settings' ? (
          <button
            className={`${styles.titleButton} ${styles.burgerButton}`}
            onClick={closeSettings}
            title="Back"
            tabIndex={-1}
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
          </button>
        ) : (
          <button
            className={`${styles.titleButton} ${styles.burgerButton} ${sidebarOpen ? styles.active : ''}`}
            onClick={toggleSidebar}
            title="Toggle sidebar (Ctrl+B)"
            tabIndex={-1}
            style={isExternal ? { display: 'none' } : undefined}
          >
            <PanelLeft size={16} strokeWidth={1.5} />
          </button>
        )}

        <button
          className={`${styles.titleButton} ${styles.burgerButton} ${menuOpen ? styles.active : ''}`}
          onClick={() => setMenuOpen(v => !v)}
          title="Menu"
          tabIndex={-1}
        >
          <Menu size={16} strokeWidth={1.5} />
        </button>

        {menuOpen && (
          <>
            <div className={styles.menuOverlay} onClick={() => setMenuOpen(false)} />
            <div ref={menuRef} className={styles.appMenu}>
              <button className={styles.menuItem} onClick={() => menuAction(handleNewNote)}>
                New Note<span className={styles.menuShortcut}>{mod}N</span>
              </button>
              <button className={styles.menuItem} onClick={() => menuAction(handleNewFolder)}>
                New Folder<span className={styles.menuShortcut}>{mod}{shift}N</span>
              </button>
              <button className={styles.menuItem} onClick={() => menuAction(handleOpenFile)}>
                Open file…<span className={styles.menuShortcut}>{mod}O</span>
              </button>
              <div className={styles.menuDivider} />
              <button className={styles.menuItem} onClick={() => menuAction(() => onOpenSettings?.())}>
                Settings…<span className={styles.menuShortcut}>{mod},</span>
              </button>
              <button className={styles.menuItem} onClick={() => menuAction(handleChangeVault)}>
                Change vault folder…
              </button>
            </div>
          </>
        )}

        {appMode !== 'settings' && (
          <button
            className={styles.titleButton}
            onClick={openSearchPalette}
            title={`Search (${isMac ? '⌘' : 'Ctrl+'}K)`}
            tabIndex={-1}
          >
            <Search size={15} strokeWidth={1.5} />
          </button>
        )}
      </div>

      {/* ── Center — breadcrumb ── */}
      <div className={styles.center}>
        {appMode === 'settings' ? (
          <span className={styles.breadcrumb}>
            <span className={styles.breadcrumbPath}>Settings</span>
            <span className={styles.breadcrumbSeparator}>/</span>
            <span className={styles.breadcrumbName}>{TAB_LABELS[settingsTab]}</span>
          </span>
        ) : breadcrumb ? (
          <span className={styles.breadcrumb}>
            {breadcrumb.dirty && <span className={styles.dirtyDot}>•</span>}
            {breadcrumb.prefix && (
              <>
                <span className={styles.breadcrumbPath}>{breadcrumb.prefix}</span>
                <span className={styles.breadcrumbSeparator}>/</span>
              </>
            )}
            <span
              className={styles.breadcrumbName}
              onDoubleClick={handleBreadcrumbDoubleClick}
              title="Double-click to rename"
            >{breadcrumb.name}</span>
          </span>
        ) : (
          <span className={styles.appName}>Monomark</span>
        )}
      </div>

      {/* ── Right ── */}
      <div className={styles.rightControls}>
        {isExternal && (
          <button
            className={styles.saveToVaultBtn}
            onClick={() => useVaultStore.getState().saveToVault?.()}
            tabIndex={-1}
          >
            Save to Vault
          </button>
        )}

        <div className={styles.windowControls}>
          <button className={`${styles.winButton} ${styles.minimize}`} onClick={handleMinimize} title="Minimize">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
          <button className={`${styles.winButton} ${styles.maximize}`} onClick={handleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}>
            {isMaximized ? (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1.5" y="3.5" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.2" />
                <path d="M3.5 3.5V2.5a1 1 0 011-1h5a1 1 0 011 1v5a1 1 0 01-1 1h-1" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            ) : (
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1.5" y="1.5" width="9" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              </svg>
            )}
          </button>
          <button className={`${styles.winButton} ${styles.close}`} onClick={handleClose} title="Close">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2.5 2.5l7 7M9.5 2.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
