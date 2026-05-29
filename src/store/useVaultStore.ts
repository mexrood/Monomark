import { create } from 'zustand'
import type { VaultNode, VaultFile, DocumentState } from '../types/vault'
import { useToastStore } from './useToastStore'
import { attachImageFromBlob } from '../utils/attachImage'

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
  importFiles(files: File[], targetFolder: string | null): Promise<void>
  importFilePaths(paths: string[], targetFolder: string | null): Promise<void>
}

// Supported import extensions.
const TEXT_EXTS = new Set(['.md', '.markdown', '.txt', '.json', '.yaml', '.yml'])
const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i).toLowerCase() : ''
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

  async importFiles(files, targetFolder) {
    const vaultPath = get().vaultPath
    if (!vaultPath || files.length === 0) return

    // Resolve target dir. If null → default to <vault>/inbox.
    const target = targetFolder ?? `${vaultPath}${sep(vaultPath)}inbox`
    const folderLabel = target.replace(/\\/g, '/').split('/').pop() || 'vault'
    const toast = useToastStore.getState()

    const importedPaths: string[] = []
    const skipped: string[] = []
    let imageOnlyCount = 0

    for (const file of files) {
      const ext = extOf(file.name)
      const srcPath = window.marrow.util?.getPathForFile?.(file)

      if (IMAGE_EXTS.has(ext)) {
        // Images go to _attachments via the existing image flow regardless of target.
        try {
          await attachImageFromBlob(file)
          imageOnlyCount++
        } catch {
          skipped.push(file.name)
        }
        continue
      }

      if (!TEXT_EXTS.has(ext)) {
        toast.error(`Unsupported file type: ${ext || file.name}`)
        skipped.push(file.name)
        continue
      }

      if (!srcPath) {
        // Fallback: read file content via FileReader (works in all WebViews)
        try {
          const content = await file.text()
          let fileName = file.name
          let destPath = `${target}${sep(target)}${fileName}`
          const exists = await window.marrow.vault.exists(destPath)
          let renamedFrom: string | undefined
          if (exists) {
            const base = fileName.replace(/\.\w+$/, '')
            const extPart = fileName.slice(base.length)
            fileName = `${base}-${Date.now().toString(36)}${extPart}`
            destPath = `${target}${sep(target)}${fileName}`
            renamedFrom = file.name
          }
          await window.marrow.vault.writeFile(destPath, content)
          importedPaths.push(destPath)
          if (renamedFrom) {
            toast.info(`Renamed "${renamedFrom}" → "${fileName}" (name was taken)`)
          }
        } catch {
          toast.error(`Failed to import ${file.name}`)
          skipped.push(file.name)
        }
        continue
      }

      // keep-both is the default — silently rename on conflict.
      const result = await window.marrow.vault.importFile(srcPath, target, 'keep-both')
      if (!result.ok) {
        toast.error(`Failed to import ${file.name}${'message' in result && result.message ? `: ${result.message}` : ''}`)
        skipped.push(file.name)
        continue
      }
      importedPaths.push(result.path)
      if (result.renamedFrom) {
        toast.info(`Renamed "${result.renamedFrom}" → "${result.path.split(/[\\/]/).pop()}" (name was taken)`)
      }
    }

    if (importedPaths.length > 0 || imageOnlyCount > 0) {
      await get().refreshTree()
    }

    // Build summary toast for text imports.
    if (importedPaths.length === 1) {
      const onlyPath = importedPaths[0]
      const name = onlyPath.split(/[\\/]/).pop()
      toast.success(`Added: ${name} → ${folderLabel}/`, {
        action: {
          label: 'Open',
          onClick: () => { void get().openDocument(onlyPath) },
        },
      })
    } else if (importedPaths.length > 1) {
      toast.success(`Added ${importedPaths.length} files → ${folderLabel}/`)
    }

    if (imageOnlyCount > 0 && importedPaths.length === 0) {
      toast.success(
        imageOnlyCount === 1
          ? 'Image saved to attachments'
          : `${imageOnlyCount} images saved to attachments`
      )
    }
  },

  async importFilePaths(paths, targetFolder) {
    const vaultPath = get().vaultPath
    if (!vaultPath || paths.length === 0) return
    const target = targetFolder ?? `${vaultPath}${sep(vaultPath)}inbox`
    const folderLabel = target.replace(/\\/g, '/').split('/').pop() || 'vault'
    const toast = useToastStore.getState()
    const importedPaths: string[] = []

    for (const srcPath of paths) {
      const ext = extOf(srcPath.split(/[\\/]/).pop() || '')
      if (!TEXT_EXTS.has(ext) && !IMAGE_EXTS.has(ext)) {
        toast.error(`Unsupported file type: ${ext}`)
        continue
      }
      if (IMAGE_EXTS.has(ext)) {
        // TODO: handle image import from path
        continue
      }
      const result = await window.marrow.vault.importFile(srcPath, target, 'keep-both')
      if (!result.ok) {
        toast.error(`Failed to import ${srcPath.split(/[\\/]/).pop()}`)
        continue
      }
      importedPaths.push(result.path)
    }

    if (importedPaths.length > 0) {
      await get().refreshTree()
      if (importedPaths.length === 1) {
        const name = importedPaths[0].split(/[\\/]/).pop()
        toast.success(`Added: ${name} → ${folderLabel}/`, {
          action: { label: 'Open', onClick: () => { void get().openDocument(importedPaths[0]) } },
        })
      } else {
        toast.success(`Added ${importedPaths.length} files → ${folderLabel}/`)
      }
    }
  },
}))
