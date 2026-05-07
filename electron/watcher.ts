import { BrowserWindow } from 'electron'
import chokidar, { FSWatcher } from 'chokidar'
import { updateFile } from './mcp/search-index'

let watcher: FSWatcher | null = null
let treeDebounce: ReturnType<typeof setTimeout> | null = null
let contentDebounce: Map<string, ReturnType<typeof setTimeout>> = new Map()

const recentSelfWrites = new Map<string, number>()

export function markSelfWrite(absPath: string) {
  recentSelfWrites.set(absPath, Date.now())
  setTimeout(() => {
    const t = recentSelfWrites.get(absPath)
    if (t && Date.now() - t > 4000) recentSelfWrites.delete(absPath)
  }, 5000)
}

function isRecentSelfWrite(absPath: string): boolean {
  const t = recentSelfWrites.get(absPath)
  if (!t) return false
  return Date.now() - t < 1500
}

function getWindow(): BrowserWindow | null {
  const wins = BrowserWindow.getAllWindows()
  return wins[0] ?? null
}

function emitTreeChange() {
  if (treeDebounce) clearTimeout(treeDebounce)
  treeDebounce = setTimeout(() => {
    getWindow()?.webContents.send('watcher:tree-change')
  }, 200)
}

function emitContentChange(filePath: string) {
  const existing = contentDebounce.get(filePath)
  if (existing) clearTimeout(existing)
  const timer = setTimeout(() => {
    contentDebounce.delete(filePath)
    getWindow()?.webContents.send('watcher:file-content-change', filePath)
  }, 200)
  contentDebounce.set(filePath, timer)
}

export function startWatcher(vaultPath: string) {
  stopWatcher()

  watcher = chokidar.watch(vaultPath, {
    ignored: /(^|[/\\])\../,   // skip dotfiles
    ignoreInitial: true,
    persistent: true,
    awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
  })

  watcher
    .on('add', (filePath: string) => {
      if (filePath.endsWith('.md')) updateFile(filePath).catch(() => {})
      emitTreeChange()
    })
    .on('addDir', emitTreeChange)
    .on('unlink', (filePath: string) => {
      if (filePath.endsWith('.md')) updateFile(filePath).catch(() => {})
      emitTreeChange()
    })
    .on('unlinkDir', emitTreeChange)
    // Note: 'rename' is not a chokidar event; unlink+add handles renames
    .on('change', (filePath: string) => {
      if (isRecentSelfWrite(filePath)) return
      if (filePath.endsWith('.md')) updateFile(filePath).catch(() => {})
      emitContentChange(filePath)
    })
}

export function stopWatcher() {
  if (watcher) {
    watcher.close()
    watcher = null
  }
  if (treeDebounce) clearTimeout(treeDebounce)
  contentDebounce.forEach(t => clearTimeout(t))
  contentDebounce.clear()
}
