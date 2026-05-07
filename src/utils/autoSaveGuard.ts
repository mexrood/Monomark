/**
 * Tracks paths currently being written by the auto-save debouncer.
 * useFileWatcher checks this set before showing the "file changed externally"
 * dialog so that our own writes don't trigger it.
 */
export const autoSavingPaths = new Set<string>()
