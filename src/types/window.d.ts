import type { VaultNode } from './vault'

interface MarrowWindowAPI {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
}

interface MarrowAppAPI {
  getVersion(): Promise<string>
  getAutostartEnabled(): Promise<boolean>
  setAutostartEnabled(enabled: boolean): Promise<void>
  quit(): Promise<void>
  showWindow(): Promise<void>
  setTheme(theme: 'dark' | 'light'): Promise<void>
}

interface MarrowVaultAPI {
  pickVaultFolder(): Promise<string | null>
  pickFile(): Promise<string | null>
  getVaultPath(): Promise<string | null>
  setVaultPath(path: string): Promise<void>
  listTree(): Promise<VaultNode[]>
  readFile(absPath: string): Promise<string>
  writeFile(absPath: string, content: string): Promise<void>
  createFile(parentDir: string, name: string): Promise<string>
  createFolder(parentDir: string, name: string): Promise<string>
  rename(oldPath: string, newName: string): Promise<string>
  delete(absPath: string): Promise<void>
  exists(absPath: string): Promise<boolean>
  isInsideVault(absPath: string): Promise<boolean>
  move(oldPath: string, newParentDir: string): Promise<{ conflict: boolean; newPath: string }>
  setFolderOrder(folderPath: string, order: string[]): Promise<void>
  getFolderOrder(folderPath: string): Promise<string[] | null>
  fileExists(relPath: string): Promise<boolean>
  writeBinary(relPath: string, base64: string): Promise<{ ok: boolean; relPath: string }>
}

interface MarrowFileOpenAPI {
  onOpenFile(cb: (path: string) => void): void
  offOpenFile(): void
}

interface MarrowWatcherAPI {
  onTreeChange(cb: () => void): void
  offTreeChange(cb: () => void): void
  onFileContentChange(cb: (path: string) => void): void
  offFileContentChange(cb: (...args: unknown[]) => void): void
}

interface MarrowTerminalAPI {
  openInTerminal(folderPath: string): Promise<void>
}

interface MarrowUtilAPI {
  showInFolder(path: string): Promise<void>
  copyToClipboard(text: string): Promise<void>
  showMessageBox(opts: unknown): Promise<number>
  getPathForFile(file: File): string
}

interface MarrowMcpAPI {
  getStatus(): Promise<{ running: boolean; port: number | null; token: string | null; state: string; error: string | null }>
  start(): Promise<{ port: number; token: string }>
  stop(): Promise<void>
  getAuditLog(limit?: number): Promise<McpAuditEntry[]>
  regenerateToken(): Promise<string>
  onStatusChange(cb: (status: { running: boolean; port: number | null; state: string; error: string | null }) => void): void
  offStatusChange(): void
  onNewCall(cb: (call: McpAuditEntry) => void): void
  offNewCall(): void
}

export interface McpAuditEntry {
  id: number
  ts: string
  tool: string
  args: unknown
  ok: boolean
  durationMs: number
  error?: string
}

interface MarrowPreviewAPI {
  open(filePath: string, content: string): Promise<void>
  close(): Promise<void>
  onLoad(cb: (data: { filePath: string; content: string }) => void): void
  offLoad(): void
  openInMain(filePath: string): Promise<void>
}

export type UpdateState =
  | { status: 'idle'; lastChecked?: number }
  | { status: 'checking' }
  | { status: 'up-to-date'; version: string; lastChecked: number }
  | { status: 'available'; version: string; releaseNotes: string; releaseDate: string }
  | { status: 'downloading'; version: string; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { status: 'downloaded'; version: string }
  | { status: 'installing' }
  | { status: 'error'; message: string }

interface MarrowUpdaterAPI {
  check(): Promise<UpdateState>
  download(): Promise<void>
  install(): Promise<void>
  getState(): Promise<UpdateState>
  onStateChange(cb: (state: UpdateState) => void): void
  offStateChange(): void
}

interface MarrowAPI {
  window: MarrowWindowAPI
  app: MarrowAppAPI
  vault: MarrowVaultAPI
  fileOpen?: MarrowFileOpenAPI
  watcher?: MarrowWatcherAPI
  terminal?: MarrowTerminalAPI
  util?: MarrowUtilAPI
  mcp?: MarrowMcpAPI
  preview?: MarrowPreviewAPI
  updater?: MarrowUpdaterAPI
}

declare global {
  interface Window {
    marrow: MarrowAPI
  }
}

export {}
