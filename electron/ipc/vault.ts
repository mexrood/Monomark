import { ipcMain, dialog } from 'electron'
import { promises as fs } from 'fs'
import * as path from 'path'
import { store } from '../store'
import { startWatcher, stopWatcher, markSelfWrite } from '../watcher'
import { buildIndex, updateFile } from '../mcp/search-index'

type VaultNode =
  | { kind: 'file'; path: string; name: string; mtime: number }
  | { kind: 'folder'; path: string; name: string; children: VaultNode[] }

async function readFolderOrder(dirPath: string): Promise<string[] | null> {
  const orderFile = path.join(dirPath, '.marrow-order.json')
  try {
    const raw = await fs.readFile(orderFile, 'utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.version === 1 && Array.isArray(parsed.order)) return parsed.order as string[]
  } catch { /* no order file or invalid */ }
  return null
}

async function buildTree(dirPath: string): Promise<VaultNode[]> {
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true })
  } catch {
    return []
  }

  const nodes: VaultNode[] = []

  for (const entry of entries) {
    // Skip dotfiles/dotfolders (includes .marrow-order.json)
    if (entry.name.startsWith('.')) continue

    const fullPath = path.join(dirPath, entry.name)

    if (entry.isDirectory()) {
      // Skip system/hidden directories (e.g. _attachments)
      if (entry.name.startsWith('_')) continue
      const children = await buildTree(fullPath)
      nodes.push({ kind: 'folder', path: fullPath, name: entry.name, children })
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const stat = await fs.stat(fullPath)
      nodes.push({ kind: 'file', path: fullPath, name: entry.name, mtime: stat.mtimeMs })
    }
  }

  const orderList = await readFolderOrder(dirPath)

  if (orderList) {
    const byName = new Map(nodes.map(n => [n.name, n]))
    const ordered: VaultNode[] = []
    for (const name of orderList) {
      const node = byName.get(name)
      if (node) { ordered.push(node); byName.delete(name) }
    }
    // Nodes on disk but not in order file → sort by name, append after
    const remaining = Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
    ordered.push(...remaining)
    return ordered
  }

  // Default sort: folders first (alpha), then files (mtime desc); CLAUDE.md pinned
  nodes.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'folder' ? -1 : 1
    if (a.kind === 'file' && b.kind === 'file') {
      if (a.name === 'CLAUDE.md') return -1
      if (b.name === 'CLAUDE.md') return 1
      return b.mtime - a.mtime
    }
    return a.name.localeCompare(b.name)
  })

  return nodes
}

export function registerVaultIPC() {
  ipcMain.handle('vault:pickVaultFolder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Choose Vault Folder',
      properties: ['openDirectory', 'createDirectory'],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('vault:pickFile', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open File',
      properties: ['openFile'],
      filters: [
        { name: 'Markdown', extensions: ['md', 'markdown'] },
        { name: 'Text', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  ipcMain.handle('vault:getVaultPath', () => {
    return store.get('vaultPath') || null
  })

  ipcMain.handle('vault:setVaultPath', (_event, vaultPath: string) => {
    store.set('vaultPath', vaultPath)
    if (vaultPath) {
      startWatcher(vaultPath)
      buildIndex(vaultPath).catch(e =>
        console.error('[vault] Failed to rebuild search index:', e)
      )
    } else {
      stopWatcher()
    }
  })

  ipcMain.handle('vault:listTree', async () => {
    const vaultPath = store.get('vaultPath')
    if (!vaultPath) return []
    return buildTree(vaultPath)
  })

  ipcMain.handle('vault:readFile', async (_event, absPath: string) => {
    return fs.readFile(absPath, 'utf-8')
  })

  ipcMain.handle('vault:writeFile', async (_event, absPath: string, content: string) => {
    await fs.mkdir(path.dirname(absPath), { recursive: true })
    markSelfWrite(absPath)
    await fs.writeFile(absPath, content, 'utf-8')
  })

  ipcMain.handle('vault:createFile', async (_event, parentDir: string, name: string) => {
    const fileName = name.endsWith('.md') ? name : `${name}.md`
    const fullPath = path.join(parentDir, fileName)
    await fs.writeFile(fullPath, '', 'utf-8')
    return fullPath
  })

  ipcMain.handle('vault:createFolder', async (_event, parentDir: string, name: string) => {
    const fullPath = path.join(parentDir, name)
    await fs.mkdir(fullPath, { recursive: true })
    return fullPath
  })

  ipcMain.handle('vault:rename', async (_event, oldPath: string, newName: string) => {
    const newPath = path.join(path.dirname(oldPath), newName)
    await fs.rename(oldPath, newPath)
    return newPath
  })

  ipcMain.handle('vault:delete', async (_event, absPath: string) => {
    const { shell } = await import('electron')
    await shell.trashItem(absPath)
  })

  ipcMain.handle('vault:exists', async (_event, absPath: string) => {
    try {
      await fs.access(absPath)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('vault:isInsideVault', (_event, absPath: string) => {
    const vaultPath = store.get('vaultPath')
    if (!vaultPath) return false
    return path.resolve(absPath).startsWith(path.resolve(vaultPath))
  })

  ipcMain.handle('vault:move', async (_event, oldPath: string, newParentDir: string) => {
    const name = path.basename(oldPath)
    const newPath = path.join(newParentDir, name)
    try {
      await fs.access(newPath)
      return { conflict: true, newPath }
    } catch { /* no conflict */ }
    await fs.rename(oldPath, newPath)
    return { conflict: false, newPath }
  })

  ipcMain.handle('vault:setFolderOrder', async (_event, folderPath: string, order: string[]) => {
    const orderFile = path.join(folderPath, '.marrow-order.json')
    await fs.writeFile(orderFile, JSON.stringify({ version: 1, order }, null, 2), 'utf-8')
  })

  ipcMain.handle('vault:getFolderOrder', async (_event, folderPath: string) => {
    const orderFile = path.join(folderPath, '.marrow-order.json')
    try {
      const raw = await fs.readFile(orderFile, 'utf-8')
      const parsed = JSON.parse(raw)
      if (parsed.version === 1 && Array.isArray(parsed.order)) return parsed.order as string[]
    } catch { /* no order file */ }
    return null
  })

  ipcMain.handle('vault:fileExists', async (_event, relPath: string) => {
    const vaultPath = store.get('vaultPath')
    if (!vaultPath) return false
    const abs = path.resolve(vaultPath, relPath)
    // Safety: must stay within vault
    if (!abs.startsWith(path.resolve(vaultPath))) return false
    try {
      await fs.access(abs)
      return true
    } catch {
      return false
    }
  })

  ipcMain.handle('vault:writeBinary', async (_event, relPath: string, base64: string) => {
    const vaultPath = store.get('vaultPath')
    if (!vaultPath) throw new Error('No vault path set')
    const abs = path.resolve(vaultPath, relPath)
    // Safety: must stay within vault
    if (!abs.startsWith(path.resolve(vaultPath))) throw new Error('Path escapes vault')
    const buf = Buffer.from(base64, 'base64')
    await fs.mkdir(path.dirname(abs), { recursive: true })
    await fs.writeFile(abs, buf)
    return { ok: true, relPath }
  })

  /**
   * Copy an external file from the user's filesystem into the vault.
   * `targetFolderAbs` is either an absolute path inside the vault (e.g. when
   * dropped on a folder in the tree) or a vault-relative path like 'inbox'.
   *
   * conflict:
   *   - 'fail'       — error out with reason: 'conflict' and the existing path
   *   - 'replace'    — overwrite the existing file
   *   - 'keep-both'  — append " (1)", " (2)", … until the name is free
   */
  ipcMain.handle('vault:importFile', async (
    _event,
    srcAbsPath: string,
    targetFolder: string,
    conflict: 'fail' | 'replace' | 'keep-both' = 'keep-both'
  ): Promise<
    | { ok: true; path: string; renamedFrom?: string }
    | { ok: false; reason: 'conflict' | 'outside-vault' | 'no-vault' | 'error'; message?: string; existing?: string }
  > => {
    try {
      const vaultPath = store.get('vaultPath')
      if (!vaultPath) return { ok: false, reason: 'no-vault' }
      const vaultAbs = path.resolve(vaultPath)

      // Resolve target dir: absolute path or vault-relative.
      const targetAbs = path.isAbsolute(targetFolder)
        ? path.resolve(targetFolder)
        : path.resolve(vaultAbs, targetFolder)

      if (!targetAbs.startsWith(vaultAbs)) {
        return { ok: false, reason: 'outside-vault' }
      }

      await fs.mkdir(targetAbs, { recursive: true })

      const originalName = path.basename(srcAbsPath)
      let destAbs = path.join(targetAbs, originalName)
      let renamedFrom: string | undefined

      const exists = async (p: string) => {
        try { await fs.access(p); return true } catch { return false }
      }

      if (await exists(destAbs)) {
        if (conflict === 'fail') {
          return { ok: false, reason: 'conflict', existing: destAbs }
        }
        if (conflict === 'keep-both') {
          renamedFrom = originalName
          const ext = path.extname(originalName)
          const stem = ext ? originalName.slice(0, -ext.length) : originalName
          for (let i = 1; i < 1000; i++) {
            const candidate = path.join(targetAbs, `${stem} (${i})${ext}`)
            if (!(await exists(candidate))) {
              destAbs = candidate
              break
            }
          }
        }
        // 'replace' falls through to copyFile and overwrites
      }

      // Mark as self-write so the file watcher doesn't pop a "changed externally" dialog.
      markSelfWrite(destAbs)
      await fs.copyFile(srcAbsPath, destAbs)

      return renamedFrom
        ? { ok: true, path: destAbs, renamedFrom }
        : { ok: true, path: destAbs }
    } catch (err) {
      return { ok: false, reason: 'error', message: err instanceof Error ? err.message : String(err) }
    }
  })
}
