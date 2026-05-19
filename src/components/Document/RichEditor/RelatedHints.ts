import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { useRelatedStore } from '../../../store/useRelatedStore'
import './RelatedHints.css'

/**
 * Phase 3 editor integration:
 *  - Cmd+Shift+F → open the "Related thoughts" panel for the block at the cursor.
 *  - Inline "↗ Related: N mentions" hints under blocks with strong matches.
 *
 * The Phase 3 spec assumes CodeMirror; this is the Tiptap/ProseMirror equivalent.
 */

// Strong-match threshold. e5-small embeddings are tightly clustered, so this
// sits high (0.90) to keep inline hints to genuinely confident matches.
const STRONG_THRESHOLD = 0.90
const HINT_CAP = 9 // display "9+" beyond this — keeps the hint compact
const CACHE_TTL = 60_000

// blockId → related count. Module-level so it survives editor recreation
// (switching files) — that's the cross-file cache the spec asks for.
const countCache = new Map<string, { count: number; at: number }>()

// ── Current block detection ──────────────────────────────────────────────────

/** The block ID of the block the cursor sits in, or null. */
export function blockIdAtCursor(state: EditorState): string | null {
  const blockIdType = state.schema.nodes.blockId
  if (!blockIdType) return null
  const { $from } = state.selection

  // Inside a list/task item → the BlockId is the item's last child.
  for (let d = $from.depth; d >= 1; d--) {
    const node = $from.node(d)
    if (node.type.name === 'listItem' || node.type.name === 'taskItem') {
      const last = node.lastChild
      return last && last.type === blockIdType ? (last.attrs.bid as string) : null
    }
  }

  // Top-level block → the BlockId is its next sibling.
  const topIndex = $from.index(0)
  const next = topIndex + 1 < state.doc.childCount ? state.doc.child(topIndex + 1) : null
  return next && next.type === blockIdType ? (next.attrs.bid as string) : null
}

// ── Hover preview popup ──────────────────────────────────────────────────────

let previewEl: HTMLElement | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function fileLabel(relPath: string): string {
  return relPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? relPath
}

function removePreview(): void {
  previewEl?.remove()
  previewEl = null
}

function scheduleHidePreview(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(removePreview, 200)
}

function showHintPreview(bid: string, anchor: HTMLElement): void {
  if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
  if (!window.marrow?.search) return

  window.marrow.search
    .findRelatedToBlock(bid, { threshold: STRONG_THRESHOLD, limit: 3 })
    .then(results => {
      if (results.length === 0) return
      removePreview()

      const el = document.createElement('div')
      el.className = 'mm-hint-preview'
      for (const r of results) {
        const item = document.createElement('div')
        item.className = 'mm-hint-preview-item'
        const file = document.createElement('div')
        file.className = 'mm-hint-preview-file'
        file.textContent = `${fileLabel(r.file)} · ${Math.round(r.similarity * 100)}%`
        const text = document.createElement('div')
        text.className = 'mm-hint-preview-text'
        text.textContent = r.text
        item.append(file, text)
        el.append(item)
      }
      el.addEventListener('mouseenter', () => {
        if (hideTimer) { clearTimeout(hideTimer); hideTimer = null }
      })
      el.addEventListener('mouseleave', scheduleHidePreview)

      document.body.appendChild(el)
      const a = anchor.getBoundingClientRect()
      el.style.left = `${a.left}px`
      el.style.top = `${a.bottom + 6}px`
      const p = el.getBoundingClientRect()
      if (p.right > window.innerWidth - 8) {
        el.style.left = `${Math.max(8, window.innerWidth - p.width - 8)}px`
      }
      if (p.bottom > window.innerHeight - 8) {
        el.style.top = `${Math.max(8, a.top - p.height - 6)}px`
      }
      previewEl = el
    })
    .catch(() => {})
}

// ── Inline hint widget ───────────────────────────────────────────────────────

function makeHintDOM(bid: string, count: number): HTMLElement {
  const div = document.createElement('div')
  div.className = 'mm-related-hint'
  const shown = count > HINT_CAP ? `${HINT_CAP}+` : String(count)
  div.textContent = `↗ Related: ${shown} ${count === 1 ? 'mention' : 'mentions'}`
  div.contentEditable = 'false'
  div.addEventListener('mousedown', e => e.preventDefault())
  div.addEventListener('click', () => useRelatedStore.getState().openPanel(bid))
  div.addEventListener('mouseenter', () => showHintPreview(bid, div))
  div.addEventListener('mouseleave', scheduleHidePreview)
  return div
}

function buildHintDecorations(state: EditorState): DecorationSet {
  const decos: Decoration[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'blockId') return true
    const bid = node.attrs.bid as string | null
    if (!bid) return true
    const entry = countCache.get(bid)
    if (entry && entry.count > 0) {
      decos.push(
        Decoration.widget(pos, () => makeHintDOM(bid, entry.count), {
          side: -1,
          key: `hint:${bid}:${entry.count}`,
        }),
      )
    }
    return true
  })
  return DecorationSet.create(state.doc, decos)
}

// ── Async count fetching ─────────────────────────────────────────────────────

const relatedHintsKey = new PluginKey('relatedHints')

async function fetchMissingCounts(view: EditorView): Promise<void> {
  if (!window.marrow?.search) return
  const now = Date.now()
  const ids: string[] = []
  view.state.doc.descendants(node => {
    if (node.type.name === 'blockId' && node.attrs.bid) {
      const cached = countCache.get(node.attrs.bid)
      if (!cached || now - cached.at > CACHE_TTL) ids.push(node.attrs.bid)
    }
    return true
  })
  if (ids.length === 0) return

  try {
    const counts = await window.marrow.search.countRelatedForBlocks(ids, STRONG_THRESHOLD)
    const at = Date.now()
    for (const id of ids) countCache.set(id, { count: counts[id] ?? 0, at })
    if (!view.isDestroyed) {
      view.dispatch(view.state.tr.setMeta(relatedHintsKey, 'refresh'))
    }
  } catch {
    /* indexing not ready yet — try again on the next edit */
  }
}

// ── Extension ────────────────────────────────────────────────────────────────

export const RelatedHints = Extension.create({
  name: 'relatedHints',

  // Cmd/Ctrl+Shift+F is handled by the global keyboard handler
  // (useKeyboardShortcuts) so it works even when the editor isn't focused.

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: relatedHintsKey,
        props: {
          decorations: state => buildHintDecorations(state),
        },
        view: editorView => {
          let timer: ReturnType<typeof setTimeout> | null = null
          const schedule = () => {
            if (timer) clearTimeout(timer)
            timer = setTimeout(() => { timer = null; void fetchMissingCounts(editorView) }, 400)
          }
          schedule()
          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) schedule()
            },
            destroy() {
              if (timer) clearTimeout(timer)
              removePreview()
            },
          }
        },
      }),
    ]
  },
})
