import { ipcMain } from 'electron'
import {
  findRelatedToBlock,
  searchBlocks,
  countStrongSynapses,
  countRelatedForBlocks,
  type SearchOptions,
} from '../blocks/search'

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
}
