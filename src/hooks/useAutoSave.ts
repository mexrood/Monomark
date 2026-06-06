import { useCallback, useEffect, useRef } from 'react'
import { useVaultStore } from '../store/useVaultStore'
import { autoSavingPaths } from '../utils/autoSaveGuard'

/**
 * Debounced auto-save for the open vault document.
 *
 * In addition to the 500ms debounce, the pending write is **flushed
 * immediately** when the window loses focus, is hidden, or unloads — otherwise
 * edits made in the last <500ms before minimizing-to-tray or quitting would be
 * lost (the debounce timer never fires once the window is gone).
 */
export function useAutoSave() {
  const document = useVaultStore(s => s.document)

  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingRef = useRef<{ path: string; content: string } | null>(null)

  const write = useCallback(async (path: string, content: string) => {
    // Mark as in-progress so useFileWatcher ignores the watcher event our
    // own write will trigger.
    autoSavingPaths.add(path)
    try {
      await window.marrow.vault.writeFile(path, content)
      useVaultStore.setState(s => ({
        document:
          s.document.kind === 'vault' && s.document.path === path
            ? { ...s.document, dirty: false }
            : s.document,
      }))
    } finally {
      // Keep the guard alive a bit longer to absorb delayed watcher events.
      setTimeout(() => autoSavingPaths.delete(path), 1500)
    }
  }, [])

  const flush = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    const pending = pendingRef.current
    if (pending) {
      pendingRef.current = null
      void write(pending.path, pending.content)
    }
  }, [write])

  // Schedule a debounced save whenever the dirty document changes.
  useEffect(() => {
    if (document.kind === 'vault' && document.dirty) {
      pendingRef.current = { path: document.path, content: document.content }
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(flush, 500)
    }
  }, [document, flush])

  // Flush on focus loss / hide / unload so the last edits always land on disk.
  useEffect(() => {
    const onVisibility = () => {
      if (window.document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('blur', flush)
    window.addEventListener('beforeunload', flush)
    window.document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('blur', flush)
      window.removeEventListener('beforeunload', flush)
      window.document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [flush])
}
