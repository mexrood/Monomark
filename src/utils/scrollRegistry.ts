type Listener = (el: HTMLElement | null) => void

let _el: HTMLElement | null = null
const _listeners = new Set<Listener>()

export const scrollRegistry = {
  set(el: HTMLElement | null) {
    _el = el
    _listeners.forEach(l => l(el))
  },
  subscribe(l: Listener) {
    _listeners.add(l)
    l(_el)
    return () => { _listeners.delete(l) }
  },
}
