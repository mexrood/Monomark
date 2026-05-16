import { create } from 'zustand'

export type Theme = 'midnight' | 'slate' | 'dim' | 'paper' | 'cream'
const THEMES: Theme[] = ['midnight', 'slate', 'dim', 'paper', 'cream']
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
  setTheme(t: Theme): void
  setRenamingPath(path: string | null): void
  setFocusedFolder(path: string | null): void
  openSettings(tab?: SettingsTab): void
  closeSettings(): void
  setSettingsTab(tab: SettingsTab): void
  openSearchPalette(): void
  closeSearchPalette(): void
}

function loadTheme(): Theme {
  const raw = localStorage.getItem('monomark-theme')
  // Migrate the old binary dark/light setting onto the new named themes.
  if (raw === 'dark') return 'midnight'
  if (raw === 'light') return 'paper'
  return THEMES.includes(raw as Theme) ? (raw as Theme) : 'midnight'
}

const savedTheme = loadTheme()
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

  setTheme(t) {
    localStorage.setItem('monomark-theme', t)
    document.documentElement.setAttribute('data-theme', t)
    set({ theme: t })
    // Persist to electron-store so main.ts can read it at next launch
    // and set the correct backgroundColor (avoids flash-of-wrong-color)
    window.marrow.app.setTheme(t).catch(() => {})
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
