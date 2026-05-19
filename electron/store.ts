import ElectronStore from 'electron-store'

interface StoreSchema {
  vaultPath: string
  theme: 'dark' | 'light'
  sidebarOpen: boolean
  lastOpenedPath: string
  mcpEnabled: boolean
  mcpToken: string
  mcpPort: number
  aiEnabled: boolean
  aiActiveModel: string
}

export const store = new ElectronStore<StoreSchema>({
  defaults: {
    vaultPath: '',
    theme: 'dark',
    sidebarOpen: true,
    lastOpenedPath: '',
    mcpEnabled: false,
    mcpToken: '',
    mcpPort: 7456,
    aiEnabled: false,
    aiActiveModel: '',
  },
})
