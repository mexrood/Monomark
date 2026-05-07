import { promises as fs } from 'fs'
import * as path from 'path'
import { safeResolveInVault, toRelative } from '../paths'
import { store } from '../../store'

interface ListItem {
  path: string
  kind: 'file' | 'folder'
  size?: number
  mtime: number
}

async function walk(
  dir: string,
  vaultPath: string,
  recursive: boolean
): Promise<ListItem[]> {
  const items: ListItem[] = []
  let entries: import('fs').Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return items
  }

  for (const e of entries) {
    if (e.name.startsWith('.')) continue // skip hidden
    const full = path.join(dir, e.name)
    const stat = await fs.stat(full).catch(() => null)
    if (!stat) continue

    const rel = toRelative(vaultPath, full)

    if (e.isDirectory()) {
      items.push({ path: rel, kind: 'folder', mtime: stat.mtimeMs })
      if (recursive) {
        items.push(...(await walk(full, vaultPath, true)))
      }
    } else if (e.isFile() && e.name.endsWith('.md')) {
      items.push({ path: rel, kind: 'file', size: stat.size, mtime: stat.mtimeMs })
    }
  }
  return items
}

export async function toolList(args: { path?: string; recursive?: boolean }) {
  const vaultPath = store.get('vaultPath') as string | undefined
  if (!vaultPath) throw new Error('No vault configured')

  const targetPath = args.path
    ? await safeResolveInVault(vaultPath, args.path)
    : vaultPath

  const recursive = args.recursive !== false
  const items = await walk(targetPath, vaultPath, recursive)

  return {
    vault_root: vaultPath,
    items,
  }
}
