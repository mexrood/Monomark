import { create } from 'zustand'
import type { VaultNode, VaultFile, DocumentState } from '../types/vault'

interface VaultStore {
  vaultPath: string | null
  tree: VaultNode[]
  document: DocumentState
  expandedFolders: Set<string>

  setVaultPath(path: string): Promise<void>
  refreshTree(): Promise<void>
  openDocument(path: string): Promise<void>
  closeDocument(): void
  updateContent(content: string): void
  saveToVault(): Promise<void>
  toggleFolder(path: string): void
  expandPathTo(path: string): void
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function sep(p: string) { return p.includes('/') ? '/' : '\\' }

/** Find a non-conflicting filename: "name.md" → "name (1).md" → "name (2).md" */
async function resolveConflict(fullPath: string): Promise<string> {
  const exists = await window.marrow.vault.exists(fullPath)
  if (!exists) return fullPath

  const dir = fullPath.replace(/[\\/][^\\/]+$/, '')
  const base = fullPath.replace(/\\/g, '/').split('/').pop()!
  const [name, ext] = base.endsWith('.md')
    ? [base.slice(0, -3), '.md']
    : [base, '']

  for (let i = 1; i < 100; i++) {
    const candidate = `${dir}${sep(dir)}${name} (${i})${ext}`
    const taken = await window.marrow.vault.exists(candidate)
    if (!taken) return candidate
  }
  return fullPath
}

export function flattenTree(nodes: VaultNode[]): VaultFile[] {
  const files: VaultFile[] = []
  for (const node of nodes) {
    if (node.kind === 'file') files.push(node)
    else files.push(...flattenTree(node.children))
  }
  return files
}

// ── Store ──────────────────────────────────────────────────────────────────────

export const useVaultStore = create<VaultStore>((set, get) => ({
  vaultPath: null,
  tree: [],
  document: { kind: 'empty' },
  expandedFolders: new Set(),

  async setVaultPath(path) {
    await window.marrow.vault.setVaultPath(path)
    set({ vaultPath: path })
    await get().refreshTree()
  },

  async refreshTree() {
    const tree = await window.marrow.vault.listTree()
    set({ tree })
  },

  async openDocument(path) {
    const isInside = await window.marrow.vault.isInsideVault(path)
    const content = await window.marrow.vault.readFile(path)
    if (isInside) {
      localStorage.setItem('monomark-last-doc', path)
      set({ document: { kind: 'vault', path, content, dirty: false } })
      get().expandPathTo(path)
      // Bring the main window forward (needed when opened via file association
      // while the window was hidden to tray)
      window.marrow.app.showWindow().catch(() => {})
    } else {
      // Open external files in a dedicated preview window.
      // Then hide the main window to tray so only the preview is visible.
      if (window.marrow.preview) {
        await window.marrow.preview.open(path, content)
        window.marrow.window.close()  // hide main window → tray
      } else {
        set({ document: { kind: 'external', path, content } })
      }
    }
  },

  closeDocument() {
    set({ document: { kind: 'empty' } })
  },

  updateContent(content) {
    const doc = get().document
    if (doc.kind !== 'vault') return
    set({ document: { ...doc, content, dirty: true } })
  },

  async saveToVault() {
    const doc = get().document
    if (doc.kind !== 'external') return

    const vaultPath = get().vaultPath
    if (!vaultPath) return

    const filename = doc.path.replace(/\\/g, '/').split('/').pop()!
    const inboxDir = `${vaultPath}${sep(vaultPath)}inbox`
    const targetPath = `${inboxDir}${sep(inboxDir)}${filename}`
    const finalPath = await resolveConflict(targetPath)

    await window.marrow.vault.writeFile(finalPath, doc.content)
    await get().refreshTree()
    await get().openDocument(finalPath)  // reopens as vault file
  },

  toggleFolder(path) {
    const expanded = new Set(get().expandedFolders)
    if (expanded.has(path)) expanded.delete(path)
    else expanded.add(path)
    set({ expandedFolders: expanded })
  },

  expandPathTo(filePath) {
    const vaultPath = get().vaultPath
    if (!vaultPath) return
    const expanded = new Set(get().expandedFolders)
    let current = filePath
    while (true) {
      const parent = current.replace(/[\\/][^\\/]+$/, '')
      if (!parent || parent === current || parent.length < vaultPath.length) break
      expanded.add(parent)
      current = parent
    }
    set({ expandedFolders: expanded })
  },
}))
