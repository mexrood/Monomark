import { contextBridge, ipcRenderer, webUtils } from 'electron'

contextBridge.exposeInMainWorld('marrow', {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  },
  app: {
    getVersion: (): Promise<string> => ipcRenderer.invoke('app:getVersion'),
    getAutostartEnabled: (): Promise<boolean> => ipcRenderer.invoke('app:getAutostartEnabled'),
    setAutostartEnabled: (enabled: boolean): Promise<void> => ipcRenderer.invoke('app:setAutostartEnabled', enabled),
    quit: (): Promise<void> => ipcRenderer.invoke('app:quit'),
    showWindow: (): Promise<void> => ipcRenderer.invoke('app:showWindow'),
    setTheme: (theme: string): Promise<void> => ipcRenderer.invoke('app:setTheme', theme),
  },
  fileOpen: {
    onOpenFile: (cb: (path: string) => void) =>
      ipcRenderer.on('file:open', (_event, path: string) => cb(path)),
    offOpenFile: () => ipcRenderer.removeAllListeners('file:open'),
  },
  watcher: {
    onTreeChange: (cb: () => void) => ipcRenderer.on('watcher:tree-change', cb),
    offTreeChange: (cb: () => void) => ipcRenderer.off('watcher:tree-change', cb),
    onFileContentChange: (cb: (path: string) => void) =>
      ipcRenderer.on('watcher:file-content-change', (_event, path: string) => cb(path)),
    offFileContentChange: (cb: (...args: unknown[]) => void) =>
      ipcRenderer.off('watcher:file-content-change', cb),
  },
  terminal: {
    openInTerminal: (folderPath: string) => ipcRenderer.invoke('terminal:open', folderPath),
  },
  util: {
    showInFolder: (p: string) => ipcRenderer.invoke('util:showInFolder', p),
    copyToClipboard: (text: string) => ipcRenderer.invoke('util:copyToClipboard', text),
    showMessageBox: (opts: unknown) => ipcRenderer.invoke('util:showMessageBox', opts),
    getPathForFile: (file: File) => webUtils.getPathForFile(file),
  },
  mcp: {
    getStatus: () => ipcRenderer.invoke('mcp:getStatus'),
    start: () => ipcRenderer.invoke('mcp:start'),
    stop: () => ipcRenderer.invoke('mcp:stop'),
    getAuditLog: (limit?: number) => ipcRenderer.invoke('mcp:getAuditLog', limit),
    regenerateToken: () => ipcRenderer.invoke('mcp:regenerateToken'),
    onStatusChange: (cb: (s: { running: boolean; port: number | null; state: string; error: string | null }) => void) =>
      ipcRenderer.on('mcp:status-change', (_event, s) => cb(s)),
    offStatusChange: () => ipcRenderer.removeAllListeners('mcp:status-change'),
    onNewCall: (cb: (call: unknown) => void) =>
      ipcRenderer.on('mcp:new-call', (_event, call) => cb(call)),
    offNewCall: () => ipcRenderer.removeAllListeners('mcp:new-call'),
    getInstallStatus: () => ipcRenderer.invoke('mcp:getInstallStatus'),
    installToClaudeDesktop: () => ipcRenderer.invoke('mcp:installToClaudeDesktop'),
    getClaudeCodeCommand: () => ipcRenderer.invoke('mcp:getClaudeCodeCommand'),
  },
  ai: {
    getSnapshot: () => ipcRenderer.invoke('ai:getSnapshot'),
    setEnabled: (value: boolean) => ipcRenderer.invoke('ai:setEnabled', value),
    download: (modelId: string) => ipcRenderer.invoke('ai:download', modelId),
    cancelDownload: (modelId: string) => ipcRenderer.invoke('ai:cancelDownload', modelId),
    deleteModel: (modelId: string) => ipcRenderer.invoke('ai:deleteModel', modelId),
    activate: (modelId: string) => ipcRenderer.invoke('ai:activate', modelId),
    unload: () => ipcRenderer.invoke('ai:unload'),
    prompt: (text: string) => ipcRenderer.invoke('ai:prompt', text),
    onState: (cb: (state: unknown) => void) =>
      ipcRenderer.on('ai:state', (_event, state) => cb(state)),
    offState: () => ipcRenderer.removeAllListeners('ai:state'),
    onDownloadProgress: (cb: (progress: unknown) => void) =>
      ipcRenderer.on('ai:download-progress', (_event, progress) => cb(progress)),
    offDownloadProgress: () => ipcRenderer.removeAllListeners('ai:download-progress'),
    // LLM provider abstraction (local + cloud)
    listProviders: () => ipcRenderer.invoke('ai:listProviders'),
    getActiveProvider: () => ipcRenderer.invoke('ai:getActiveProvider'),
    setActiveProvider: (id: string) => ipcRenderer.invoke('ai:setActiveProvider', id),
    saveApiKey: (providerId: string, key: string) =>
      ipcRenderer.invoke('ai:saveApiKey', providerId, key),
    deleteApiKey: (providerId: string) => ipcRenderer.invoke('ai:deleteApiKey', providerId),
    testProvider: (providerId: string) => ipcRenderer.invoke('ai:testProvider', providerId),
  },
  preview: {
    open: (filePath: string, content: string) =>
      ipcRenderer.invoke('preview:open', { filePath, content }),
    close: () => ipcRenderer.invoke('preview:close'),
    onLoad: (cb: (data: { filePath: string; content: string }) => void) =>
      ipcRenderer.on('preview:load', (_event, data) => cb(data)),
    offLoad: () => ipcRenderer.removeAllListeners('preview:load'),
    openInMain: (filePath: string) => ipcRenderer.invoke('preview:openInMain', filePath),
  },
  index: {
    getStatus: () => ipcRenderer.invoke('index:getStatus'),
    onStatus: (cb: (status: unknown) => void) =>
      ipcRenderer.on('indexer:status', (_event, status) => cb(status)),
    offStatus: () => ipcRenderer.removeAllListeners('indexer:status'),
  },
  search: {
    findRelatedToBlock: (blockId: string, options?: unknown) =>
      ipcRenderer.invoke('search:findRelatedToBlock', blockId, options),
    searchBlocks: (query: string, options?: unknown) =>
      ipcRenderer.invoke('search:searchBlocks', query, options),
    countRelatedForBlocks: (blockIds: string[], threshold?: number) =>
      ipcRenderer.invoke('search:countRelatedForBlocks', blockIds, threshold),
  },
  summary: {
    getAll: () => ipcRenderer.invoke('summary:getAll'),
    onUpdated: (cb: (payload: { file: string; summary: string }) => void) =>
      ipcRenderer.on('summary:updated', (_event, payload) => cb(payload)),
    offUpdated: () => ipcRenderer.removeAllListeners('summary:updated'),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    getState: () => ipcRenderer.invoke('updater:getState'),
    onStateChange: (cb: (state: unknown) => void) =>
      ipcRenderer.on('updater:state', (_event, state) => cb(state)),
    offStateChange: () => ipcRenderer.removeAllListeners('updater:state'),
  },
  vault: {
    pickVaultFolder: () => ipcRenderer.invoke('vault:pickVaultFolder'),
    pickFile: () => ipcRenderer.invoke('vault:pickFile'),
    getVaultPath: () => ipcRenderer.invoke('vault:getVaultPath'),
    setVaultPath: (p: string) => ipcRenderer.invoke('vault:setVaultPath', p),
    listTree: () => ipcRenderer.invoke('vault:listTree'),
    readFile: (p: string) => ipcRenderer.invoke('vault:readFile', p),
    writeFile: (p: string, content: string) => ipcRenderer.invoke('vault:writeFile', p, content),
    createFile: (parentDir: string, name: string) => ipcRenderer.invoke('vault:createFile', parentDir, name),
    createFolder: (parentDir: string, name: string) => ipcRenderer.invoke('vault:createFolder', parentDir, name),
    rename: (oldPath: string, newName: string) => ipcRenderer.invoke('vault:rename', oldPath, newName),
    delete: (p: string) => ipcRenderer.invoke('vault:delete', p),
    exists: (p: string) => ipcRenderer.invoke('vault:exists', p),
    isInsideVault: (p: string) => ipcRenderer.invoke('vault:isInsideVault', p),
    move: (oldPath: string, newParentDir: string) => ipcRenderer.invoke('vault:move', oldPath, newParentDir),
    setFolderOrder: (folderPath: string, order: string[]) => ipcRenderer.invoke('vault:setFolderOrder', folderPath, order),
    getFolderOrder: (folderPath: string) => ipcRenderer.invoke('vault:getFolderOrder', folderPath),
    fileExists: (relPath: string) => ipcRenderer.invoke('vault:fileExists', relPath),
    writeBinary: (relPath: string, base64: string) => ipcRenderer.invoke('vault:writeBinary', relPath, base64),
    importFile: (srcAbsPath: string, targetFolder: string, conflict: 'fail' | 'replace' | 'keep-both' = 'keep-both') =>
      ipcRenderer.invoke('vault:importFile', srcAbsPath, targetFolder, conflict),
    getRelationsForBlock: (blockId: string) =>
      ipcRenderer.invoke('vault:getRelationsForBlock', blockId),
  },
})
