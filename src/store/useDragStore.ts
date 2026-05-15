import { create } from 'zustand'

interface DragStore {
  /** True while an external (OS-level) file drag is hovering over the window. */
  isDragging: boolean
  /** Absolute path of the folder currently under the cursor, or null. */
  hoveredFolder: string | null

  setDragging(v: boolean): void
  setHoveredFolder(path: string | null): void
  /** Reset both flags. */
  reset(): void
}

export const useDragStore = create<DragStore>((set) => ({
  isDragging: false,
  hoveredFolder: null,

  setDragging(v) {
    set({ isDragging: v })
    // Mirror to <body> so CSS can apply global drop-mode styles.
    if (typeof document !== 'undefined') {
      if (v) document.body.setAttribute('data-dragging', 'true')
      else {
        document.body.removeAttribute('data-dragging')
      }
    }
    if (!v) set({ hoveredFolder: null })
  },

  setHoveredFolder(path) {
    set({ hoveredFolder: path })
  },

  reset() {
    set({ isDragging: false, hoveredFolder: null })
    if (typeof document !== 'undefined') {
      document.body.removeAttribute('data-dragging')
    }
  },
}))
