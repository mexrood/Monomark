import { create } from 'zustand'

export type ToastKind = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  onClick(): void
}

export interface Toast {
  id: number
  kind: ToastKind
  message: string
  action?: ToastAction
  /** Auto-dismiss timer (ms). 0 = no auto-dismiss. */
  duration: number
}

interface ToastStore {
  toasts: Toast[]
  push(toast: Omit<Toast, 'id'>): number
  dismiss(id: number): void

  // Convenience helpers
  success(message: string, opts?: { action?: ToastAction; duration?: number }): number
  info(message: string, opts?: { action?: ToastAction; duration?: number }): number
  error(message: string, opts?: { duration?: number }): number
}

let nextId = 1
const timers = new Map<number, ReturnType<typeof setTimeout>>()

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],

  push(toast) {
    const id = nextId++
    const full: Toast = { id, ...toast }
    set(s => ({ toasts: [...s.toasts, full] }))
    if (full.duration > 0) {
      const t = setTimeout(() => get().dismiss(id), full.duration)
      timers.set(id, t)
    }
    return id
  },

  dismiss(id) {
    const t = timers.get(id)
    if (t) {
      clearTimeout(t)
      timers.delete(id)
    }
    set(s => ({ toasts: s.toasts.filter(t => t.id !== id) }))
  },

  success(message, opts) {
    return get().push({
      kind: 'success',
      message,
      action: opts?.action,
      duration: opts?.duration ?? 4000,
    })
  },

  info(message, opts) {
    return get().push({
      kind: 'info',
      message,
      action: opts?.action,
      duration: opts?.duration ?? 4000,
    })
  },

  error(message, opts) {
    return get().push({
      kind: 'error',
      message,
      duration: opts?.duration ?? 3000,
    })
  },
}))
