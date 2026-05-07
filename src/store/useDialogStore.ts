import { create } from 'zustand'

interface DialogOptions {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

interface DialogState {
  open: boolean
  options: DialogOptions | null
  resolve: ((confirmed: boolean) => void) | null

  /** Show a confirm dialog. Returns true if the user confirms. */
  confirm(opts: DialogOptions): Promise<boolean>
  _confirm(): void
  _cancel(): void
}

export const useDialogStore = create<DialogState>((set, get) => ({
  open: false,
  options: null,
  resolve: null,

  confirm(opts) {
    return new Promise<boolean>(resolve => {
      set({ open: true, options: opts, resolve })
    })
  },

  _confirm() {
    const { resolve } = get()
    set({ open: false, options: null, resolve: null })
    resolve?.(true)
  },

  _cancel() {
    const { resolve } = get()
    set({ open: false, options: null, resolve: null })
    resolve?.(false)
  },
}))
