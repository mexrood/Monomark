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
    setTheme: (theme: 'dark' | 'light'): Promise<void> => ipcRenderer.invoke('app:setTheme', theme),
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
  preview: {
    open: (filePath: string, content: string) =>
      ipcRenderer.invoke('preview:open', { filePath, content }),
    close: () => ipcRenderer.invoke('preview:close'),
    onLoad: (cb: (data: { filePath: string; content: string }) => void) =>
      ipcRenderer.on('preview:load', (_event, data) => cb(data)),
    offLoad: () => ipcRenderer.removeAllListeners('preview:load'),
    openInMain: (filePath: string) => ipcRenderer.invoke('preview:openInMain', filePath),
  },
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
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
  },
})
