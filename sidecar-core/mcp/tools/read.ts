import { promises as fs } from 'fs'
import { safeResolveInVault } from '../paths'
import { VaultError } from '../paths'
import { store } from '../../store'

export async function toolRead(args: { path: string }) {
  const vaultPath = store.get('vaultPath') as string | undefined
  if (!vaultPath) throw new Error('No vault configured')

  const absPath = await safeResolveInVault(vaultPath, args.path)

  let stat: import('fs').Stats
  try {
    stat = await fs.stat(absPath)
  } catch {
    throw new VaultError('not_found', `File not found: ${args.path}`)
  }

  if (stat.isDirectory()) {
    throw new VaultError('not_a_file', `Path is a folder: ${args.path}`)
  }

  const content = await fs.readFile(absPath, 'utf-8')

  return {
    path: args.path,
    content,
    size: stat.size,
    mtime: stat.mtimeMs,
  }
}
