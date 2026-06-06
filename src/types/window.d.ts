import type { VaultNode } from './vault'
import type { IndexStatus } from '../store/useIndexStore'

interface MarrowWindowAPI {
  minimize(): Promise<void>
  maximize(): Promise<void>
  close(): Promise<void>
  isMaximized(): Promise<boolean>
  zoomIn(): Promise<void>
  zoomOut(): Promise<void>
  zoomReset(): Promise<void>
}

interface MarrowAppAPI {
  getVersion(): Promise<string>
  getAutostartEnabled(): Promise<boolean>
  setAutostartEnabled(enabled: boolean): Promise<void>
  quit(): Promise<void>
  showWindow(): Promise<void>
  setTheme(theme: string): Promise<void>
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
  importFile(
    srcAbsPath: string,
    targetFolder: string,
    conflict?: 'fail' | 'replace' | 'keep-both'
  ): Promise<
    | { ok: true; path: string; renamedFrom?: string }
    | { ok: false; reason: 'conflict' | 'outside-vault' | 'no-vault' | 'error'; message?: string; existing?: string }
  >
  getRelationsForBlock(blockId: string): Promise<Relation[]>
}

export interface Relation {
  fromId: string
  toId: string
  label: string
  similarity: number
  toFile: string
  toLine: number
  toText: string
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
  getStatsToday(): Promise<McpStats>
  getStatsLifetime(): Promise<McpStats>
  getStreak(): Promise<number>
  onActivity(cb: (event: McpActivityEvent) => void): void
  offActivity(): void
  // Claude integration (Tauri Rust commands)
  installToClaudeDesktop(): Promise<{ ok: boolean; error?: string }>
  getInstallStatus(): Promise<{ status: string }>
  getClaudeCodeCommand(): Promise<string>
}

export interface McpActivityEvent {
  type: 'reading' | 'distilling' | 'done'
  toolName: string
  filePath?: string
  tokensSaved: number
  timestamp: number
}

export interface McpStats {
  tokensSaved: number
  filesRead: number
  callCount: number
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

export interface AICatalogModel {
  id: string
  name: string
  params: string
  sizeBytes: number
  ram: string
  speed: string
  useCase: string
  license: string
  url: string
}

export type AIEngineState = 'idle' | 'loading' | 'ready' | 'error'

export interface AIState {
  enabled: boolean
  activeModelId: string | null
  engineState: AIEngineState
  engineError: string | null
}

export interface AISnapshot extends AIState {
  catalog: AICatalogModel[]
  recommendedId: string
  downloadedIds: string[]
  partialIds: string[]
}

export interface AIDownloadProgress {
  modelId: string
  status: 'downloading' | 'done' | 'error'
  percent: number
  transferred: number
  total: number
  error?: string
}

export interface AIProviderInfo {
  id: string
  name: string
  ready: boolean
  hasKey: boolean
}

interface MarrowAiAPI {
  getSnapshot(): Promise<AISnapshot>
  setEnabled(value: boolean): Promise<void>
  download(modelId: string): Promise<void>
  cancelDownload(modelId: string): Promise<void>
  deleteModel(modelId: string): Promise<void>
  activate(modelId: string): Promise<void>
  unload(): Promise<void>
  prompt(text: string): Promise<string>
  onState(cb: (state: AIState) => void): void
  offState(): void
  onDownloadProgress(cb: (progress: AIDownloadProgress) => void): void
  offDownloadProgress(): void
  // LLM provider abstraction
  listProviders(): Promise<AIProviderInfo[]>
  getActiveProvider(): Promise<string>
  setActiveProvider(id: string): Promise<{ ok: boolean }>
  saveApiKey(providerId: string, key: string): Promise<{ ok: boolean }>
  deleteApiKey(providerId: string): Promise<{ ok: boolean }>
  testProvider(providerId: string): Promise<{ ok: boolean; error?: string; response?: string }>
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

interface MarrowIndexAPI {
  getStatus(): Promise<IndexStatus>
  onStatus(cb: (status: IndexStatus) => void): void
  offStatus(): void
}

export interface SearchResult {
  id: string
  file: string
  line: number
  block_type: string
  text: string
  similarity: number
  updated_at: number
}

export interface SearchOptions {
  threshold?: number
  limit?: number
  sameFile?: boolean
}

interface MarrowSearchAPI {
  findRelatedToBlock(blockId: string, options?: SearchOptions): Promise<SearchResult[]>
  searchBlocks(query: string, options?: SearchOptions): Promise<SearchResult[]>
  countRelatedForBlocks(blockIds: string[], threshold?: number): Promise<Record<string, number>>
}

interface MarrowSummaryAPI {
  /** Map of absolute file path → one-line summary. */
  getAll(): Promise<Record<string, string>>
  onUpdated(cb: (payload: { file: string; summary: string }) => void): void
  offUpdated(): void
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
  ai?: MarrowAiAPI
  preview?: MarrowPreviewAPI
  updater?: MarrowUpdaterAPI
  index?: MarrowIndexAPI
  search?: MarrowSearchAPI
  summary?: MarrowSummaryAPI
}

declare global {
  interface Window {
    marrow: MarrowAPI
  }
}

export {}
