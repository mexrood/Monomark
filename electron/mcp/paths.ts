import * as path from 'path'
import { promises as fs } from 'fs'

export class VaultError extends Error {
  constructor(public code: string, message: string) {
    super(message)
    this.name = 'VaultError'
  }
}

/**
 * Resolve a relative path inside the vault safely.
 * - Rejects absolute paths (MCP tools only take relative)
 * - Resolves symlinks via realpath and verifies the result stays inside the vault
 * - For non-existent targets (e.g., write), resolves the parent and re-appends basename
 */
export async function safeResolveInVault(
  vaultPath: string,
  relativeOrAbs: string
): Promise<string> {
  if (path.isAbsolute(relativeOrAbs)) {
    throw new VaultError('outside_vault', 'Path must be relative to vault root')
  }

  const joined = path.resolve(vaultPath, relativeOrAbs)
  let real: string

  try {
    real = await fs.realpath(joined)
  } catch (err: unknown) {
    const e = err as NodeJS.ErrnoException
    if (e.code === 'ENOENT') {
      // Target doesn't exist yet (write case) — resolve parent
      const parent = path.dirname(joined)
      let parentReal: string
      try {
        parentReal = await fs.realpath(parent)
      } catch {
        // Parent also doesn't exist; we'll create it later — use raw resolve
        parentReal = path.resolve(vaultPath, path.dirname(relativeOrAbs))
      }
      real = path.join(parentReal, path.basename(joined))
    } else {
      throw err
    }
  }

  const vaultReal = await fs.realpath(vaultPath).catch(() => path.resolve(vaultPath))
  if (!real.startsWith(vaultReal + path.sep) && real !== vaultReal) {
    throw new VaultError(
      'outside_vault',
      `Path resolves outside vault: ${relativeOrAbs}`
    )
  }

  return real
}

/** Convert an absolute vault-internal path to vault-relative, forward-slash separated */
export function toRelative(vaultPath: string, absPath: string): string {
  return absPath
    .replace(/\\/g, '/')
    .replace(vaultPath.replace(/\\/g, '/').replace(/\/?$/, '/'), '')
}
