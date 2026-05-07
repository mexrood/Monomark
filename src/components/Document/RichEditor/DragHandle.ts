import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, NodeSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

const dragHandleKey = new PluginKey('dragHandle')

/** Custom block drag-handle extension.
 *  Renders a ⠿ glyph left of each top-level block on hover.
 *  Dragging it reorders the block using ProseMirror's built-in drop handler. */
export const DragHandleExtension = Extension.create({
  name: 'dragHandle',

  addProseMirrorPlugins() {
    return [buildDragHandlePlugin()]
  },
})

function buildDragHandlePlugin(): Plugin {
  return new Plugin({
    key: dragHandleKey,

    view(editorView: EditorView) {
      // ── Create the floating handle element ──────────────────────────────
      const handle = document.createElement('div')
      handle.className = 'drag-handle'
      handle.textContent = '⠿'
      // Always draggable — the browser reads draggable at mousedown time,
      // so it must already be true before the user starts the gesture.
      handle.draggable = true
      document.body.appendChild(handle)

      // currentNodePos: updated on mousemove, reset to -1 by hide().
      // dragNodePos: captured at mousedown, survives through dragstart.
      let currentNodePos = -1
      let dragNodePos    = -1

      // ── Position handle on editor mousemove ────────────────────────────
      const onMousemove = (e: MouseEvent) => {
        const coords = { left: e.clientX, top: e.clientY }
        const posResult = editorView.posAtCoords(coords)

        if (!posResult) { hide(); return }

        const $pos = editorView.state.doc.resolve(posResult.pos)
        // Only track depth-1 nodes (direct document children)
        if ($pos.depth < 1) { hide(); return }

        const nodePos = $pos.before(1)
        const domNode = editorView.nodeDOM(nodePos) as HTMLElement | null
        if (!domNode) { hide(); return }

        currentNodePos = nodePos
        const rect = domNode.getBoundingClientRect()
        handle.style.left = `${rect.left - 28}px`
        handle.style.top  = `${rect.top + rect.height / 2 - 10}px`
        handle.style.opacity = '1'
        handle.style.pointerEvents = 'all'
      }

      const onEditorMouseleave = (e: MouseEvent) => {
        // Don't hide if cursor moved onto the handle itself
        if (e.relatedTarget === handle) return
        hide()
      }

      const onHandleMouseleave = (e: MouseEvent) => {
        // Don't hide if cursor moved back into the editor
        if (e.relatedTarget && editorView.dom.contains(e.relatedTarget as Node)) return
        // Don't hide while a drag is in progress
        if (dragNodePos >= 0) return
        hide()
      }

      // ── Mousedown: capture the node position before any mouseleave fires ──
      const onMousedown = (e: MouseEvent) => {
        if (currentNodePos < 0) return
        e.preventDefault() // keep editor focus

        // Save the position — this survives hide() being called during drag
        dragNodePos = currentNodePos

        // Build and apply a NodeSelection immediately
        try {
          const sel = NodeSelection.create(editorView.state.doc, dragNodePos)
          editorView.dispatch(editorView.state.tr.setSelection(sel))
        } catch { /* ignore */ }
      }

      // ── Persistent dragstart — uses dragNodePos, not currentNodePos ──────
      const onDragstart = (de: DragEvent) => {
        if (dragNodePos < 0 || !de.dataTransfer) {
          de.preventDefault()
          return
        }
        try {
          const sel = NodeSelection.create(editorView.state.doc, dragNodePos)
          editorView.dispatch(editorView.state.tr.setSelection(sel))
          de.dataTransfer.effectAllowed = 'move'
          de.dataTransfer.setData('text/plain', '')
          // Tell ProseMirror what's being dragged so its drop handler
          // can re-insert the node at the drop position
          ;(editorView as unknown as Record<string, unknown>).dragging = {
            slice: sel.content(),
            move: true,
          }
        } catch {
          de.preventDefault()
        }
      }

      // ── Reset dragNodePos after drag ends ─────────────────────────────────
      const onDragend = () => {
        dragNodePos = -1
      }

      function hide() {
        handle.style.opacity = '0'
        handle.style.pointerEvents = 'none'
        currentNodePos = -1
        // Do NOT reset dragNodePos here — it must survive through dragstart
      }

      // ── Wire up events ─────────────────────────────────────────────────
      editorView.dom.addEventListener('mousemove', onMousemove)
      editorView.dom.addEventListener('mouseleave', onEditorMouseleave)
      handle.addEventListener('mouseleave', onHandleMouseleave)
      handle.addEventListener('mousedown', onMousedown)
      handle.addEventListener('dragstart', onDragstart)
      handle.addEventListener('dragend', onDragend)

      return {
        destroy() {
          editorView.dom.removeEventListener('mousemove', onMousemove)
          editorView.dom.removeEventListener('mouseleave', onEditorMouseleave)
          handle.removeEventListener('mouseleave', onHandleMouseleave)
          handle.removeEventListener('mousedown', onMousedown)
          handle.removeEventListener('dragstart', onDragstart)
          handle.removeEventListener('dragend', onDragend)
          handle.remove()
        },
      }
    },
  })
}
