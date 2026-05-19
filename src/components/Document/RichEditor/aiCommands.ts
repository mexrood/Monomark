import type { Editor, Range } from '@tiptap/core'
import { useToastStore } from '../../../store/useToastStore'

// Phase E — inline editor commands (/expand, /summarize, /connect).
//
// All three are non-destructive: they insert their result as a new block
// after the current one. Generation runs in the background with a persistent
// toast; the result drops in when ready. (Token streaming is a follow-up.)

/** Text of the block the cursor currently sits in. */
function blockText(editor: Editor): string {
  return editor.state.selection.$from.parent.textContent.trim()
}

/** Document position directly after the cursor's block. */
function posAfterBlock(editor: Editor): number {
  const { $from } = editor.state.selection
  return $from.after($from.depth)
}

function baseName(file: string): string {
  return (file.split('/').pop() ?? file).replace(/\.md$/i, '')
}

async function generate(
  editor: Editor,
  label: string,
  prompt: string,
  wrap: 'paragraph' | 'blockquote',
): Promise<void> {
  const toast = useToastStore.getState()
  const ai = window.marrow?.ai
  if (!ai) {
    toast.error('Local AI is not available')
    return
  }
  const toastId = toast.push({ kind: 'info', message: `✦ ${label}…`, duration: 0 })
  try {
    const out = (await ai.prompt(prompt)).trim()
    toast.dismiss(toastId)
    if (!out) {
      toast.error('The model returned nothing')
      return
    }
    const paragraph = { type: 'paragraph', content: [{ type: 'text', text: out }] }
    const node = wrap === 'blockquote' ? { type: 'blockquote', content: [paragraph] } : paragraph
    editor.chain().focus().insertContentAt(posAfterBlock(editor), node).run()
  } catch (err) {
    toast.dismiss(toastId)
    toast.error(`Couldn't complete — ${(err as Error).message}`)
  }
}

/** `/expand` — local LLM develops the current block into a fuller paragraph. */
export function aiExpand(editor: Editor, range: Range): void {
  editor.chain().focus().deleteRange(range).run()
  const text = blockText(editor)
  if (!text) {
    useToastStore.getState().error('Write something in this block first, then /expand')
    return
  }
  void generate(
    editor,
    'Expanding',
    'Expand the following note into a fuller, well-developed paragraph while ' +
      'keeping its original meaning. Output only the expanded text.\n\n---\n' +
      text,
    'paragraph',
  )
}

/** `/summarize` — local LLM condenses the current block. */
export function aiSummarize(editor: Editor, range: Range): void {
  editor.chain().focus().deleteRange(range).run()
  const text = blockText(editor)
  if (!text) {
    useToastStore.getState().error('Write something in this block first, then /summarize')
    return
  }
  void generate(
    editor,
    'Summarizing',
    'Summarize the following text in one or two concise sentences. ' +
      'Output only the summary.\n\n---\n' +
      text,
    'blockquote',
  )
}

/** `/connect` — semantic search finds related notes and inserts links to them. */
export async function aiConnect(editor: Editor, range: Range): Promise<void> {
  editor.chain().focus().deleteRange(range).run()
  const toast = useToastStore.getState()
  const text = blockText(editor)
  if (!text) {
    toast.error('Write something in this block first, then /connect')
    return
  }
  const search = window.marrow?.search
  if (!search) {
    toast.error('Vault search is not available')
    return
  }
  const toastId = toast.push({ kind: 'info', message: '✦ Finding related notes…', duration: 0 })
  try {
    const results = await search.searchBlocks(text, { limit: 8 })
    toast.dismiss(toastId)

    const seen = new Set<string>()
    const links: { file: string }[] = []
    for (const result of results) {
      if (seen.has(result.file)) continue
      seen.add(result.file)
      links.push(result)
      if (links.length >= 5) break
    }
    if (links.length === 0) {
      toast.info('No related notes found')
      return
    }

    const list = {
      type: 'bulletList',
      content: links.map(link => ({
        type: 'listItem',
        content: [{
          type: 'paragraph',
          content: [{
            type: 'text',
            text: baseName(link.file),
            marks: [{ type: 'link', attrs: { href: link.file } }],
          }],
        }],
      })),
    }
    editor.chain().focus().insertContentAt(posAfterBlock(editor), [
      { type: 'paragraph', content: [{ type: 'text', text: 'Related notes:' }] },
      list,
    ]).run()
  } catch (err) {
    toast.dismiss(toastId)
    toast.error(`Couldn't find related notes — ${(err as Error).message}`)
  }
}
