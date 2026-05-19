import type { Editor } from '@tiptap/react'

/**
 * Holds the currently-mounted vault editor instance so non-React code
 * (block navigation, related-hints) can reach it without prop drilling.
 */
let _editor: Editor | null = null

export const editorRegistry = {
  set(editor: Editor | null) {
    _editor = editor
  },
  get(): Editor | null {
    return _editor
  },
}
