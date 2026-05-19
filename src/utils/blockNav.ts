import { useVaultStore } from '../store/useVaultStore'
import { editorRegistry } from './editorRegistry'

/** Scroll the editor to the block carrying the given block ID and place the cursor there. */
export function scrollToBlockId(bid: string): void {
  const editor = editorRegistry.get()
  if (!editor) return

  let pos: number | null = null
  editor.state.doc.descendants((node, p) => {
    if (pos !== null) return false
    if (node.type.name === 'blockId' && node.attrs.bid === bid) {
      pos = p
      return false
    }
    return true
  })
  if (pos === null) return

  // The block content sits just before its (invisible) BlockId node.
  const target = Math.max(0, pos - 1)
  editor.chain().setTextSelection(target).scrollIntoView().run()
  editor.commands.focus()
}

/**
 * Open the vault file containing a block and scroll to it.
 * `relFile` is the vault-relative path stored in the index DB.
 */
export async function navigateToBlock(relFile: string, bid: string): Promise<void> {
  const vaultPath = useVaultStore.getState().vaultPath
  if (!vaultPath) return

  const sep = vaultPath.includes('\\') ? '\\' : '/'
  const abs = vaultPath + sep + relFile.replace(/[\\/]/g, sep)

  const doc = useVaultStore.getState().document
  const alreadyOpen = doc.kind === 'vault' && doc.path === abs

  if (!alreadyOpen) {
    await useVaultStore.getState().openDocument(abs)
  }
  // Give the editor a tick to mount/parse the freshly opened document.
  setTimeout(() => scrollToBlockId(bid), alreadyOpen ? 0 : 200)
}
