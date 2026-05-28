// Tauri runtime bridge: provides window.marrow API backed by Tauri invoke().
// When running under Electron, window.marrow is set by the preload script — this
// module is a no-op. In Tauri, it provides the full API via Rust commands.
// In a plain browser (Vite dev without Tauri/Electron), it provides noop stubs.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'
import type { UpdateState } from '../types/window'

const isTauri = '__TAURI_INTERNALS__' in window

export function installTauriStub() {
  if (window.marrow) return

  const safeInvoke = isTauri
    ? invoke
    : (async () => undefined) as typeof invoke

  const noop = async () => {}
  const noopBool = async () => false

  // Helper: keychain-backed secret storage via Rust commands
  const storeSecret = (key: string, value: string) =>
    safeInvoke('store_secret', { key, value })
  const getSecret = (key: string) =>
    safeInvoke<string | null>('get_secret', { key })
  const deleteSecret = (key: string) =>
    safeInvoke('delete_secret', { key })

  window.marrow = {
    window: {
      minimize: () => safeInvoke('minimize_window'),
      maximize: () => safeInvoke('toggle_maximize'),
      close: () => safeInvoke('close_window'),
      isMaximized: () => safeInvoke<boolean>('is_maximized'),
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
        await safeInvoke('set_setting', { key: 'theme', value: theme })
      },
    },
    vault: {
      pickVaultFolder: () => safeInvoke<string | null>('pick_vault_folder'),
      pickFile: () => safeInvoke<string | null>('pick_file'),
      getVaultPath: () => safeInvoke<string | null>('vault_get_path'),
      setVaultPath: async (path: string) => {
        await safeInvoke('vault_set_path', { path })
        await safeInvoke('start_watcher', { vaultPath: path })
        // Auto-start MCP sidecar when vault is set
        safeInvoke('start_sidecar').catch(() => {})
      },
      listTree: () => safeInvoke<any[]>('list_tree'),
      readFile: (absPath: string) => safeInvoke<string>('read_file', { path: absPath }),
      writeFile: (absPath: string, content: string) => safeInvoke('write_file', { path: absPath, content }),
      createFile: (parentDir: string, name: string) => safeInvoke<string>('create_file', { dir: parentDir, name }),
      createFolder: (parentDir: string, name: string) => safeInvoke<string>('create_folder', { dir: parentDir, name }),
      rename: (oldPath: string, newName: string) => safeInvoke<string>('rename_file', { oldPath, newName }),
      delete: (absPath: string) => safeInvoke('delete_file', { path: absPath }),
      exists: (absPath: string) => safeInvoke<boolean>('file_exists', { path: absPath }),
      isInsideVault: (absPath: string) => safeInvoke<boolean>('is_inside_vault', { path: absPath }),
      move: (oldPath: string, newParentDir: string) =>
        safeInvoke<{ conflict: boolean; newPath: string }>('move_file', { oldPath, newParentDir }),
      setFolderOrder: (folderPath: string, order: string[]) =>
        safeInvoke('set_folder_order', { folderPath, order }),
      getFolderOrder: (folderPath: string) =>
        safeInvoke<string[] | null>('get_folder_order', { folderPath }),
      fileExists: (relPath: string) => safeInvoke<boolean>('vault_file_exists', { relPath }),
      writeBinary: (relPath: string, base64: string) =>
        safeInvoke<{ ok: boolean; relPath: string }>('write_binary', { relPath, base64 }),
      importFile: async () => ({ ok: false as const, reason: 'no-vault' as const }),
      getRelationsForBlock: async () => [],
    },
    mcp: {
      getStatus: async () => {
        const s = await safeInvoke<{ running: boolean; port: number; token: string | null }>('sidecar_status')
        return {
          running: s?.running ?? false,
          port: s?.port ?? 7456,
          token: s?.token ?? null,
          state: s?.running ? 'running' : 'stopped',
          error: null,
        }
      },
      start: async () => {
        const r = await safeInvoke<{ port: number; token: string }>('start_sidecar')
        return r ?? { port: 7456, token: '' }
      },
      stop: async () => { await safeInvoke('stop_sidecar') },
      getAuditLog: async () => [],
      regenerateToken: async () => {
        // Delete old token, restart sidecar (which generates a new one)
        await deleteSecret('mcpToken')
        const r = await safeInvoke<{ port: number; token: string }>('start_sidecar')
        return r?.token ?? ''
      },
      onStatusChange: () => {},
      offStatusChange: () => {},
      onNewCall: () => {},
      offNewCall: () => {},
      getStatsToday: async () => ({ tokensSaved: 0, filesRead: 0, callCount: 0 }),
      getStatsLifetime: async () => ({ tokensSaved: 0, filesRead: 0, callCount: 0 }),
      getStreak: async () => 0,
      onActivity: () => {},
      offActivity: () => {},
    },
    ai: {
      // Minimal AI stub — no local model support in Tauri yet,
      // but cloud providers (Gemini, Groq) work via keychain-stored API keys.
      getSnapshot: async () => ({
        enabled: false,
        activeModelId: null,
        engineState: 'idle' as const,
        engineError: null,
        catalog: [],
        recommendedId: '',
        downloadedIds: [],
        partialIds: [],
      }),
      setEnabled: noop,
      download: noop,
      cancelDownload: noop,
      deleteModel: noop,
      activate: noop,
      unload: noop,
      prompt: async () => 'AI not available in Tauri build yet',
      onState: () => {},
      offState: () => {},
      onDownloadProgress: () => {},
      offDownloadProgress: () => {},
      // LLM provider abstraction — keys stored in OS keychain
      listProviders: async () => {
        const [geminiKey, groqKey] = await Promise.all([
          getSecret('apikey:gemini'),
          getSecret('apikey:groq'),
        ])
        return [
          { id: 'local', name: 'Local (not available)', ready: false, hasKey: true },
          { id: 'gemini', name: 'Gemini 2.0 Flash', ready: !!geminiKey, hasKey: !!geminiKey },
          { id: 'groq', name: 'Groq Llama 3.1 8B', ready: !!groqKey, hasKey: !!groqKey },
        ]
      },
      getActiveProvider: async () => {
        const saved = await safeInvoke<string | null>('get_setting', { key: 'activeAiProvider' })
        return saved ?? 'local'
      },
      setActiveProvider: async (id: string) => {
        await safeInvoke('set_setting', { key: 'activeAiProvider', value: id })
        return { ok: true }
      },
      saveApiKey: async (providerId: string, key: string) => {
        await storeSecret(`apikey:${providerId}`, key)
        return { ok: true }
      },
      deleteApiKey: async (providerId: string) => {
        await deleteSecret(`apikey:${providerId}`)
        return { ok: true }
      },
      testProvider: async () => ({
        ok: false,
        error: 'Cloud provider testing not implemented in Tauri build yet',
      }),
    },
    preview: isTauri ? {
      open: (filePath: string, content: string) =>
        safeInvoke('open_preview', { filePath, content }) as Promise<void>,
      close: () => safeInvoke('close_preview') as Promise<void>,
      onLoad: (cb: (data: { filePath: string; content: string }) => void) => {
        listen<{ filePath: string; content: string }>('preview:load', (e) => cb(e.payload))
      },
      offLoad: () => {},
      openInMain: (filePath: string) =>
        safeInvoke('preview_open_in_main', { filePath }) as Promise<void>,
    } : undefined,
    watcher: isTauri ? {
      onTreeChange: (cb: () => void) => {
        listen('vault:tree-changed', () => cb())
      },
      offTreeChange: () => {},
      onFileContentChange: (cb: (path: string) => void) => {
        listen<string>('vault:file-changed', (e) => cb(e.payload))
      },
      offFileContentChange: () => {},
    } : undefined,
    updater: isTauri ? createUpdaterBridge() : undefined,
  }
}

// ── Tauri updater bridge ─────────────────────────────────────────────────────
// Translates @tauri-apps/plugin-updater into the MarrowUpdaterAPI shape
// so GeneralPanel.tsx works identically on both Electron and Tauri.

function createUpdaterBridge() {
  let state: UpdateState = { status: 'idle' }
  let listener: ((s: UpdateState) => void) | null = null
  let pendingUpdate: Awaited<ReturnType<typeof checkUpdate>> | null = null

  const emit = (next: UpdateState) => {
    state = next
    listener?.(state)
  }

  return {
    getState: async () => state,

    check: async (): Promise<UpdateState> => {
      emit({ status: 'checking' })
      try {
        const update = await checkUpdate()
        if (!update) {
          const s: UpdateState = { status: 'up-to-date', version: '', lastChecked: Date.now() }
          emit(s)
          return s
        }
        pendingUpdate = update
        const s: UpdateState = {
          status: 'available',
          version: update.version,
          releaseNotes: update.body ?? '',
          releaseDate: update.date ?? '',
        }
        emit(s)
        return s
      } catch (err) {
        const s: UpdateState = { status: 'error', message: String(err) }
        emit(s)
        return s
      }
    },

    download: async () => {
      if (!pendingUpdate) return
      const version = pendingUpdate.version
      let transferred = 0
      let total = 0
      emit({ status: 'downloading', version, percent: 0, transferred: 0, total: 0, bytesPerSecond: 0 })

      await pendingUpdate.download((event) => {
        if (event.event === 'Started') {
          total = event.data.contentLength ?? 0
        } else if (event.event === 'Progress') {
          transferred += event.data.chunkLength
          const percent = total > 0 ? Math.round((transferred / total) * 100) : 0
          emit({ status: 'downloading', version, percent, transferred, total, bytesPerSecond: 0 })
        } else if (event.event === 'Finished') {
          emit({ status: 'downloaded', version })
        }
      })
    },

    install: async () => {
      if (!pendingUpdate) return
      emit({ status: 'installing' })
      await pendingUpdate.install()
      // Tauri restarts the app automatically after install
    },

    onStateChange: (cb: (s: UpdateState) => void) => { listener = cb },
    offStateChange: () => { listener = null },
  }
}
