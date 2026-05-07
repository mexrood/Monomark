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
}
