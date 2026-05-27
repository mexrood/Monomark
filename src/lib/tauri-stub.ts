// Tauri runtime bridge: provides window.marrow API backed by Tauri invoke().
// When running under Electron, window.marrow is set by the preload script — this
// module is a no-op. In Tauri, it provides the full API via Rust commands.
// In a plain browser (Vite dev without Tauri/Electron), it provides noop stubs.

export function installTauriStub() {
  if (window.marrow) return

  const isTauri = '__TAURI__' in window
  const invoke = isTauri
    ? window.__TAURI__!.core.invoke
    : (async () => undefined) as <T = void>(_cmd: string, _args?: Record<string, unknown>) => Promise<T>

  const listen = isTauri
    ? window.__TAURI__!.event.listen
    : (async () => () => {}) as <T>(_event: string, _cb: (e: { payload: T }) => void) => Promise<() => void>

  const noop = async () => {}
  const noopBool = async () => false

  // Watcher event unsubscribers
  const unlisteners: Array<() => void> = []

  window.marrow = {
    window: {
      minimize: () => invoke('minimize_window'),
      maximize: () => invoke('toggle_maximize'),
      close: () => invoke('close_window'),
      isMaximized: () => invoke<boolean>('is_maximized'),
      zoomIn: noop,
      zoomOut: noop,
      zoomReset: noop,
    },
    app: {
      getVersion: async () => '0.1.0-tauri',
      getAutostartEnabled: noopBool,
      setAutostartEnabled: noop,
      quit: noop,
      showWindow: noop,
      setTheme: async (theme: string) => {
        await invoke('set_setting', { key: 'theme', value: theme })
      },
    },
    vault: {
      pickVaultFolder: () => invoke<string | null>('pick_vault_folder'),
      pickFile: () => invoke<string | null>('pick_file'),
      getVaultPath: () => invoke<string | null>('vault_get_path'),
      setVaultPath: async (path: string) => {
        await invoke('vault_set_path', { path })
        await invoke('start_watcher', { vaultPath: path })
      },
      listTree: () => invoke<any[]>('list_tree'),
      readFile: (absPath: string) => invoke<string>('read_file', { path: absPath }),
      writeFile: (absPath: string, content: string) => invoke('write_file', { path: absPath, content }),
      createFile: (parentDir: string, name: string) => invoke<string>('create_file', { dir: parentDir, name }),
      createFolder: (parentDir: string, name: string) => invoke<string>('create_folder', { dir: parentDir, name }),
      rename: (oldPath: string, newName: string) => invoke<string>('rename_file', { oldPath, newName }),
      delete: (absPath: string) => invoke('delete_file', { path: absPath }),
      exists: (absPath: string) => invoke<boolean>('file_exists', { path: absPath }),
      isInsideVault: (absPath: string) => invoke<boolean>('is_inside_vault', { path: absPath }),
      move: (oldPath: string, newParentDir: string) =>
        invoke<{ conflict: boolean; newPath: string }>('move_file', { oldPath, newParentDir }),
      setFolderOrder: (folderPath: string, order: string[]) =>
        invoke('set_folder_order', { folderPath, order }),
      getFolderOrder: (folderPath: string) =>
        invoke<string[] | null>('get_folder_order', { folderPath }),
      fileExists: (relPath: string) => invoke<boolean>('vault_file_exists', { relPath }),
      writeBinary: (relPath: string, base64: string) =>
        invoke<{ ok: boolean; relPath: string }>('write_binary', { relPath, base64 }),
      importFile: async () => ({ ok: false as const, reason: 'no-vault' as const }),
      getRelationsForBlock: async () => [],
    },
    watcher: {
      onTreeChange: (cb: () => void) => {
        listen('vault:tree-changed', () => cb()).then(unlisten => unlisteners.push(unlisten))
      },
      offTreeChange: () => {},
      onFileContentChange: (cb: (path: string) => void) => {
        listen<string>('vault:file-changed', (e) => cb(e.payload)).then(unlisten => unlisteners.push(unlisten))
      },
      offFileContentChange: () => {},
    },
  }
}

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T = void>(cmd: string, args?: Record<string, unknown>) => Promise<T>
      }
      event: {
        listen: <T>(event: string, cb: (e: { payload: T }) => void) => Promise<() => void>
      }
    }
  }
}
