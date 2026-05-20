import { Extension } from '@tiptap/core'
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'
import { navigateToBlock } from '../../../utils/blockNav'
import type { Relation } from '../../../types/window'
import './RelationArrow.css'

// Inline ↗ widget at the end of each block that has LLM-judged "useful"
// relations (see electron/blocks/relationJudge.ts). Hover → tooltip with the
// top relations; click → navigate to the target block.

// Module-level cache survives editor recreation (file switches). Fetches are
// debounced and scheduled from the plugin's `view.update` hook.
const relationsCache = new Map<string, Relation[]>()
const CACHE_TTL = 60_000
const cacheAt = new Map<string, number>()
const TOP_N = 3

// ── Tooltip (singleton) ──────────────────────────────────────────────────────

let tooltipEl: HTMLElement | null = null
let showTimer: ReturnType<typeof setTimeout> | null = null
let hideTimer: ReturnType<typeof setTimeout> | null = null

function fileLabel(relPath: string): string {
  return relPath.replace(/[\\/]+$/, '').split(/[\\/]/).pop()?.replace(/\.md$/i, '') ?? relPath
}

function removeTooltip(): void {
  tooltipEl?.remove()
  tooltipEl = null
}

function scheduleHideTooltip(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = setTimeout(removeTooltip, 300)
}

function cancelHide(): void {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function showTooltip(anchor: HTMLElement, relations: Relation[]): void {
  if (relations.length === 0) return
  removeTooltip()

  const el = document.createElement('div')
  el.className = 'mm-relation-tooltip'

  const top = relations.slice(0, TOP_N)
  for (const rel of top) {
    const item = document.createElement('div')
    item.className = 'mm-relation-item'

    const label = document.createElement('div')
    label.className = 'mm-relation-label'
    label.textContent = rel.label

    const file = document.createElement('div')
    file.className = 'mm-relation-file'
    file.textContent = fileLabel(rel.toFile)

    item.append(label, file)
    item.addEventListener('mousedown', e => e.preventDefault())
    item.addEventListener('click', () => {
      removeTooltip()
      void navigateToBlock(rel.toFile, rel.toId)
    })
    el.appendChild(item)
  }

  if (relations.length > TOP_N) {
    const more = document.createElement('div')
    more.className = 'mm-relation-more'
    more.textContent = `+${relations.length - TOP_N} more`
    el.appendChild(more)
  }

  el.addEventListener('mouseenter', cancelHide)
  el.addEventListener('mouseleave', scheduleHideTooltip)

  document.body.appendChild(el)

  // Position: below the arrow, right-aligned to it.
  const a = anchor.getBoundingClientRect()
  const t = el.getBoundingClientRect()
  let left = a.right - t.width
  let top_ = a.bottom + 6
  if (left < 8) left = 8
  if (left + t.width > window.innerWidth - 8) left = window.innerWidth - t.width - 8
  if (top_ + t.height > window.innerHeight - 8) {
    top_ = Math.max(8, a.top - t.height - 6)
  }
  el.style.left = `${left}px`
  el.style.top = `${top_}px`
  tooltipEl = el
}

// ── Arrow widget ─────────────────────────────────────────────────────────────

const ARROW_SVG =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" ' +
  'stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ' +
  'stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M7 7h10v10"/><path d="M7 17 17 7"/></svg>'

function makeArrowDOM(bid: string): HTMLElement {
  const span = document.createElement('span')
  span.className = 'mm-relation-arrow'
  span.contentEditable = 'false'
  span.innerHTML = ARROW_SVG
  span.addEventListener('mousedown', e => e.preventDefault())
  span.addEventListener('mouseenter', () => {
    cancelHide()
    if (showTimer) clearTimeout(showTimer)
    showTimer = setTimeout(() => {
      showTimer = null
      const relations = relationsCache.get(bid)
      if (relations && relations.length > 0) showTooltip(span, relations)
    }, 200)
  })
  span.addEventListener('mouseleave', () => {
    if (showTimer) {
      clearTimeout(showTimer)
      showTimer = null
    }
    scheduleHideTooltip()
  })
  return span
}

function buildDecorations(state: EditorState): DecorationSet {
  const decos: Decoration[] = []
  state.doc.descendants((node, pos) => {
    if (node.type.name !== 'blockId') return true
    const bid = node.attrs.bid as string | null
    if (!bid) return true
    const relations = relationsCache.get(bid)
    if (relations && relations.length > 0) {
      // Place the widget INSIDE the preceding content block at its very end
      // (position `pos - 1`, side +1) so the arrow renders inline with the
      // block's text rather than between blocks on its own line.
      const insertPos = Math.max(0, pos - 1)
      decos.push(
        Decoration.widget(insertPos, () => makeArrowDOM(bid), {
          side: 1,
          key: `arrow:${bid}:${relations.length}`,
        }),
      )
    }
    return true
  })
  return DecorationSet.create(state.doc, decos)
}

// ── Async fetch ──────────────────────────────────────────────────────────────

const relationArrowKey = new PluginKey('relationArrow')

async function fetchMissing(view: EditorView): Promise<void> {
  const api = window.marrow?.vault
  if (!api?.getRelationsForBlock) return

  const now = Date.now()
  const ids: string[] = []
  view.state.doc.descendants(node => {
    if (node.type.name === 'blockId' && node.attrs.bid) {
      const at = cacheAt.get(node.attrs.bid)
      if (!at || now - at > CACHE_TTL) ids.push(node.attrs.bid)
    }
    return true
  })
  if (ids.length === 0) return

  try {
    // Per-block fetches in parallel — fine for typical docs (<100 blocks).
    // If perf becomes an issue on huge docs, add a batch IPC.
    const results = await Promise.all(
      ids.map(async (id): Promise<[string, Relation[]]> => {
        try {
          return [id, await api.getRelationsForBlock!(id)]
        } catch {
          return [id, []]
        }
      }),
    )
    const at = Date.now()
    for (const [id, rels] of results) {
      relationsCache.set(id, rels)
      cacheAt.set(id, at)
    }
    if (!view.isDestroyed) {
      view.dispatch(view.state.tr.setMeta(relationArrowKey, 'refresh'))
    }
  } catch {
    /* index not ready yet — try again on the next edit */
  }
}

// ── Extension ────────────────────────────────────────────────────────────────

export const RelationArrow = Extension.create({
  name: 'relationArrow',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: relationArrowKey,
        props: {
          decorations: state => buildDecorations(state),
        },
        view: editorView => {
          let timer: ReturnType<typeof setTimeout> | null = null
          const schedule = () => {
            if (timer) clearTimeout(timer)
            // Fetch slightly later than the indexer's autosave loop, so the
            // backend has a chance to re-judge after the user stops typing.
            timer = setTimeout(() => { timer = null; void fetchMissing(editorView) }, 1500)
          }
          schedule()
          return {
            update(view, prevState) {
              if (!view.state.doc.eq(prevState.doc)) {
                // Doc changed → blocks the user edited will have stale relations
                // in the DB until the indexer re-judges; clear our local cache
                // for the changed blocks so we refetch fresh data after the
                // backend pipeline catches up.
                const seenNow = new Set<string>()
                view.state.doc.descendants(node => {
                  if (node.type.name === 'blockId' && node.attrs.bid) {
                    seenNow.add(node.attrs.bid)
                  }
                  return true
                })
                const seenBefore = new Set<string>()
                prevState.doc.descendants(node => {
                  if (node.type.name === 'blockId' && node.attrs.bid) {
                    seenBefore.add(node.attrs.bid)
                  }
                  return true
                })
                // Drop cache for blocks present in both — content may have moved.
                for (const id of seenNow) {
                  if (seenBefore.has(id)) cacheAt.delete(id)
                }
                schedule()
              }
            },
            destroy() {
              if (timer) clearTimeout(timer)
              removeTooltip()
            },
          }
        },
      }),
    ]
  },
})
