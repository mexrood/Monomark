import { ipcMain } from 'electron'
import * as path from 'path'
import {
  findRelatedToBlock,
  searchBlocks,
  countStrongSynapses,
  countRelatedForBlocks,
  type SearchOptions,
} from '../blocks/search'
import { classifyFile } from '../blocks/classify'
import { store } from '../store'

export function registerSearchIPC(): void {
  ipcMain.handle('search:findRelatedToBlock', (_event, blockId: string, options?: SearchOptions) =>
    findRelatedToBlock(blockId, options ?? {}),
  )

  ipcMain.handle('search:searchBlocks', (_event, query: string, options?: SearchOptions) =>
    searchBlocks(query, options ?? {}),
  )

  ipcMain.handle('search:countSynapses', () => countStrongSynapses())

  ipcMain.handle('search:countRelatedForBlocks', (_event, blockIds: string[], threshold?: number) =>
    countRelatedForBlocks(blockIds, threshold),
  )

  // Intent classification (Phase B). Takes an absolute file path and resolves
  // it to the vault-relative key the index stores blocks under.
  ipcMain.handle('search:classifyFile', (_event, absPath: string) => {
    const vaultPath = store.get('vaultPath') as string | undefined
    if (!vaultPath || !absPath) return { counts: zeroIntents(), total: 0 }
    const rel = path.relative(vaultPath, absPath).replace(/\\/g, '/')
    return classifyFile(rel)
  })
}

function zeroIntents() {
  return { decision: 0, question: 0, todo: 0, observation: 0 }
}
