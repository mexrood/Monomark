// Tauri runtime bridge: provides window.marrow API backed by Tauri invoke().
// Phase 2 will extend this with vault, watcher, and other commands.

export function installTauriStub() {
  if (window.marrow) return

  const isTauri = '__TAURI__' in window
  const invoke = isTauri
    ? window.__TAURI__!.core.invoke
    : (async () => undefined) as <T = void>(_cmd: string, _args?: Record<string, unknown>) => Promise<T>

  const noop = async () => {}
  const noopBool = async () => false
  const noopStr = async () => ''
  const noopNull = async () => null

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
      pickVaultFolder: noopNull,
      pickFile: noopNull,
      getVaultPath: async () => {
        const val = await invoke<string | null>('get_setting', { key: 'vaultPath' })
        return val
      },
      setVaultPath: async (path: string) => {
        await invoke('set_setting', { key: 'vaultPath', value: path })
      },
      listTree: async () => [],
      readFile: noopStr,
      writeFile: noop,
      createFile: noopStr,
      createFolder: noopStr,
      rename: noopStr,
      delete: noop,
      exists: noopBool,
      isInsideVault: noopBool,
      move: async () => ({ conflict: false, newPath: '' }),
      setFolderOrder: noop,
      getFolderOrder: noopNull,
      fileExists: noopBool,
      writeBinary: async () => ({ ok: false, relPath: '' }),
      importFile: async () => ({ ok: false as const, reason: 'no-vault' as const }),
      getRelationsForBlock: async () => [],
    },
  }
}

declare global {
  interface Window {
    __TAURI__?: {
      core: {
        invoke: <T = void>(cmd: string, args?: Record<string, unknown>) => Promise<T>
      }
    }
  }
}
