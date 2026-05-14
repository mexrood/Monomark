import { create } from 'zustand'

type Theme = 'dark' | 'light'
export type AppMode = 'document' | 'settings'
export type SettingsTab = 'general' | 'launch' | 'mcp'

interface UIStore {
  sidebarOpen: boolean
  theme: Theme
  renamingPath: string | null
  /** Last folder explicitly clicked in the sidebar — used as target for New Note */
  focusedFolder: string | null

  appMode: AppMode
  settingsTab: SettingsTab
  searchPaletteOpen: boolean

  toggleSidebar(): void
  toggleTheme(): void
  setRenamingPath(path: string | null): void
  setFocusedFolder(path: string | null): void
  openSettings(tab?: SettingsTab): void
  closeSettings(): void
  setSettingsTab(tab: SettingsTab): void
  openSearchPalette(): void
  closeSearchPalette(): void
}

const savedTheme = (localStorage.getItem('monomark-theme') as Theme | null) ?? 'dark'
document.documentElement.setAttribute('data-theme', savedTheme)

export const useUIStore = create<UIStore>((set, get) => ({
  sidebarOpen: true,
  theme: savedTheme,
  renamingPath: null,
  focusedFolder: null,
  appMode: 'document',
  settingsTab: 'general',
  searchPaletteOpen: false,

  toggleSidebar() {
    set(s => ({ sidebarOpen: !s.sidebarOpen }))
  },

  toggleTheme() {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    localStorage.setItem('monomark-theme', next)
    document.documentElement.setAttribute('data-theme', next)
    set({ theme: next })
    // Persist to electron-store so main.ts can read it at next launch
    // and set the correct backgroundColor (avoids flash-of-wrong-color)
    window.marrow.app.setTheme(next).catch(() => {})
  },

  setRenamingPath(path) {
    set({ renamingPath: path })
  },

  setFocusedFolder(path) {
    set({ focusedFolder: path })
  },

  openSettings(tab = 'general') {
    set({ appMode: 'settings', settingsTab: tab })
  },

  closeSettings() {
    set({ appMode: 'document' })
  },

  setSettingsTab(tab) {
    set({ settingsTab: tab })
  },

  openSearchPalette() {
    set({ searchPaletteOpen: true })
  },

  closeSearchPalette() {
    set({ searchPaletteOpen: false })
  },
}))
