// Minimal stub so the React app can render inside Tauri without crashing.
// Phase 2 will replace these stubs with real Tauri invoke() calls.

export function installTauriStub() {
  if (window.marrow) return

  const noop = async () => {}
  const noopBool = async () => false
  const noopStr = async () => ''
  const noopNull = async () => null

  window.marrow = {
    window: {
      minimize: noop,
      maximize: noop,
      close: noop,
      isMaximized: noopBool,
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
      setTheme: noop,
    },
    vault: {
      pickVaultFolder: noopNull,
      pickFile: noopNull,
      getVaultPath: noopNull,
      setVaultPath: noop,
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
