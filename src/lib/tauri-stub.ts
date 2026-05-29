// Tauri runtime bridge: provides window.marrow API backed by Tauri invoke().
// When running under Electron, window.marrow is set by the preload script — this
// module is a no-op. In Tauri, it provides the full API via Rust commands.
// In a plain browser (Vite dev without Tauri/Electron), it provides noop stubs.

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { check as checkUpdate } from '@tauri-apps/plugin-updater'
import { relaunch } from '@tauri-apps/plugin-process'
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
      getVersion: async () => {
        const v = await safeInvoke<string>('get_setting', { key: '__app_version__' }).catch(() => null)
        return v || '1.0.43-tauri'
      },
      getAutostartEnabled: async () => {
        return await safeInvoke<boolean>('get_autostart_enabled').catch(() => false) ?? false
      },
      setAutostartEnabled: async (enabled: unknown) => {
        await safeInvoke('set_autostart_enabled', { enabled: !!enabled })
      },
      quit: async () => {
        await safeInvoke('stop_sidecar').catch(() => {})
        // exit(0) from Rust
        await safeInvoke('quit_app')
      },
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
      importFile: async (srcPath: string, targetDir: string, _onConflict?: 'fail' | 'replace' | 'keep-both') => {
        try {
          const fileName = srcPath.replace(/\\/g, '/').split('/').pop() || 'untitled.md'
          const content = await safeInvoke<string>('read_file', { path: srcPath })
          if (content == null) return { ok: false as const, reason: 'error' as const, message: 'Could not read source file' }
          let destPath = `${targetDir}${targetDir.includes('/') ? '/' : '\\'}${fileName}`
          const exists = await safeInvoke<boolean>('file_exists', { path: destPath })
          let renamedFrom: string | undefined
          if (exists) {
            const base = fileName.replace(/\.\w+$/, '')
            const ext = fileName.slice(base.length)
            const ts = Date.now().toString(36)
            destPath = `${targetDir}${targetDir.includes('/') ? '/' : '\\'}${base}-${ts}${ext}`
            renamedFrom = fileName
          }
          await safeInvoke('write_file', { path: destPath, content })
          return { ok: true as const, path: destPath, renamedFrom }
        } catch (err: any) {
          return { ok: false as const, reason: 'error' as const, message: err?.message || String(err) }
        }
      },
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
      // Claude integration — write to Claude Desktop config / generate CLI command
      installToClaudeDesktop: async () => {
        return await safeInvoke<{ ok: boolean; error?: string }>('install_to_claude_desktop')
          ?? { ok: false, error: 'invoke failed' }
      },
      getInstallStatus: async () => {
        return await safeInvoke<{ status: string }>('get_claude_desktop_status')
          ?? { status: 'not_installed' }
      },
      getClaudeCodeCommand: async () => {
        return await safeInvoke<string>('get_claude_code_command') ?? ''
      },
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
    util: isTauri ? {
      getPathForFile: (file: File) => {
        // WebView2 exposes file.path for drag-dropped files
        return (file as any).path as string ?? ''
      },
      showInFolder: noop,
      copyToClipboard: noop,
      showMessageBox: async () => 0,
    } : undefined,
    updater: isTauri ? createUpdaterBridge() : undefined,
  }

  // In Tauri, capture drag-drop file paths via Tauri event API
  // and store them so getPathForFile can retrieve them
  if (isTauri) {
    import('@tauri-apps/api/webviewWindow').then(({ getCurrentWebviewWindow }) => {
      const webview = getCurrentWebviewWindow()
      let lastDropPaths: string[] = []

      webview.onDragDropEvent((event) => {
        if (event.payload.type === 'drop') {
          lastDropPaths = event.payload.paths
          // Dispatch a custom event with the file paths for the drop handler
          window.dispatchEvent(new CustomEvent('tauri:file-drop', {
            detail: { paths: lastDropPaths }
          }))
        }
      })
    }).catch(() => {})
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
      console.log('[updater] check: starting')
      emit({ status: 'checking' })
      try {
        const update = await checkUpdate()
        console.log('[updater] check: result', update ? `v${update.version}` : 'up-to-date')
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
        console.error('[updater] check failed:', err)
        const msg = err instanceof Error ? err.message : String(err)
        const s: UpdateState = { status: 'error', message: msg }
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
      // Tauri doesn't auto-restart — relaunch explicitly
      await relaunch()
    },

    onStateChange: (cb: (s: UpdateState) => void) => { listener = cb },
    offStateChange: () => { listener = null },
  }
}
