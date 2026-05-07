import { promises as fs } from 'fs'
import * as path from 'path'
import { safeResolveInVault } from '../paths'
import { VaultError } from '../paths'
import { store } from '../../store'

export async function toolWrite(args: {
  path: string
  content: string
  overwrite?: boolean
}) {
  const vaultPath = store.get('vaultPath') as string | undefined
  if (!vaultPath) throw new Error('No vault configured')

  // If path has no directory component, put it in inbox/
  let targetRelPath = args.path
  if (!targetRelPath.includes('/') && !targetRelPath.includes('\\')) {
    targetRelPath = `inbox/${targetRelPath}`
  }

  // Ensure .md extension
  if (!targetRelPath.endsWith('.md')) {
    targetRelPath = `${targetRelPath}.md`
  }

  const absPath = await safeResolveInVault(vaultPath, targetRelPath)

  // Check if file already exists
  let wasNew = true
  try {
    await fs.access(absPath)
    wasNew = false
    if (!args.overwrite) {
      throw new VaultError(
        'already_exists',
        `File already exists: ${targetRelPath}. Set overwrite: true to replace it.`
      )
    }
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException
    if (e.code !== 'ENOENT' && !(err instanceof VaultError)) throw err
    if (err instanceof VaultError) throw err
  }

  // Create parent directories if needed
  const parent = path.dirname(absPath)
  await fs.mkdir(parent, { recursive: true })

  // Verify parent is inside vault (mkdir may have created it)
  const parentStat = await fs.stat(parent)
  if (!parentStat.isDirectory()) {
    throw new VaultError('parent_not_a_folder', `Parent path is not a directory`)
  }

  await fs.writeFile(absPath, args.content, 'utf-8')

  const stat = await fs.stat(absPath)

  return {
    path: targetRelPath,
    bytes_written: stat.size,
    was_new: wasNew,
  }
}
