/* eslint-disable @typescript-eslint/no-explicit-any */
import { Extension } from '@tiptap/core'
import type { Editor, Range } from '@tiptap/core'
import Suggestion from '@tiptap/suggestion'
import { ReactRenderer } from '@tiptap/react'
import { SlashMenu, SLASH_COMMANDS } from './SlashMenu'
import type { SlashMenuRef, SlashCommand } from './SlashMenu'

export const SlashExtension = Extension.create({
  name: 'slashCommand',

  addOptions() {
    return {
      suggestion: {
        char: '/',
        startOfLine: false,

        items({ query }: { query: string }): SlashCommand[] {
          const q = query.toLowerCase()
          if (!q) return SLASH_COMMANDS
          return SLASH_COMMANDS.filter(
            cmd =>
              cmd.label.toLowerCase().includes(q) ||
              cmd.keywords.some(k => k.includes(q)),
          )
        },

        command({ editor, range, props }: { editor: Editor; range: Range; props: SlashCommand }) {
          props.action(editor, range)
        },

        render() {
          let renderer: ReactRenderer<SlashMenuRef>
          let container: HTMLDivElement

          return {
            onStart(props: any) {
              container = document.createElement('div')
              container.style.position = 'fixed'
              container.style.zIndex = '1000'
              document.body.appendChild(container)

              renderer = new ReactRenderer(SlashMenu, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              })
              container.appendChild(renderer.element)
              reposition(container, props.clientRect)
            },

            onUpdate(props: any) {
              renderer?.updateProps({ items: props.items, command: props.command })
              reposition(container, props.clientRect)
            },

            onKeyDown({ event }: { event: KeyboardEvent }): boolean {
              if (event.key === 'Escape') { cleanup(); return true }
              return renderer?.ref?.onKeyDown({ event }) ?? false
            },

            onExit() {
              cleanup()
            },
          }

          function cleanup() {
            renderer?.destroy()
            container?.remove()
          }

          function reposition(el: HTMLDivElement, clientRect: (() => DOMRect | null) | null) {
            const rect = clientRect?.()
            if (!rect) return
            // Measure the rendered menu so we can flip up / clamp at the edges
            // instead of letting it overflow off-screen near the bottom.
            const menu = el.firstElementChild as HTMLElement | null
            const mh = menu?.offsetHeight ?? 0
            const mw = menu?.offsetWidth ?? 0
            const vw = window.innerWidth
            const vh = window.innerHeight

            let top = rect.bottom + 4
            if (top + mh > vh - 8) {
              // Not enough room below — place above the caret.
              top = Math.max(8, rect.top - mh - 4)
            }
            let left = rect.left
            if (left + mw > vw - 8) left = Math.max(8, vw - mw - 8)

            el.style.left = `${left}px`
            el.style.top  = `${top}px`
          }
        },
      },
    }
  },

  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
      } as any),
    ]
  },
})
