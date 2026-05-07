import { useEffect, useRef } from 'react'
import { useVaultStore } from '../store/useVaultStore'
import { debounce } from '../utils/debounce'
import { autoSavingPaths } from '../utils/autoSaveGuard'

export function useAutoSave() {
  const saveRef = useRef(
    debounce(async (path: string, content: string) => {
      // Mark as in-progress so useFileWatcher ignores the watcher event our
      // own write will trigger.
      autoSavingPaths.add(path)
      try {
        await window.marrow.vault.writeFile(path, content)
        useVaultStore.setState(s => ({
          document:
            s.document.kind === 'vault'
              ? { ...s.document, dirty: false }
              : s.document,
        }))
      } finally {
        // Keep the guard alive a bit longer to absorb delayed watcher events.
        setTimeout(() => autoSavingPaths.delete(path), 1500)
      }
    }, 500),
  )

  const document = useVaultStore(s => s.document)

  useEffect(() => {
    if (document.kind === 'vault' && document.dirty) {
      saveRef.current(document.path, document.content)
    }
  }, [document])
}
