import { create } from 'zustand'
import type { McpAuditEntry } from '../types/window'

interface McpStatus {
  running: boolean
  port: number | null
  token: string | null
  state: string         // 'disabled' | 'starting' | 'running' | 'error'
  error: string | null
}

interface AppStore {
  // App
  version: string
  autostartEnabled: boolean

  // MCP
  mcpStatus: McpStatus
  mcpAuditLog: McpAuditEntry[]

  // Actions
  setVersion(v: string): void
  setAutostartEnabled(v: boolean): void
  setMcpStatus(s: McpStatus): void
  setMcpAuditLog(log: McpAuditEntry[]): void

  /** Load version + autostart state from main process */
  init(): Promise<void>
  /** Toggle autostart and persist to OS */
  toggleAutostart(): Promise<void>
  /** Toggle MCP server on/off */
  toggleMcp(): Promise<void>
}

export const useAppStore = create<AppStore>((set, get) => ({
  version: '',
  autostartEnabled: false,
  mcpStatus: { running: false, port: null, token: null, state: 'disabled', error: null },
  mcpAuditLog: [],

  setVersion: (version) => set({ version }),
  setAutostartEnabled: (autostartEnabled) => set({ autostartEnabled }),
  setMcpStatus: (mcpStatus) => set({ mcpStatus }),
  setMcpAuditLog: (mcpAuditLog) => set({ mcpAuditLog }),

  async init() {
    if (!window.marrow?.app) return

    const [version, autostartEnabled] = await Promise.all([
      window.marrow.app.getVersion(),
      window.marrow.app.getAutostartEnabled(),
    ])
    set({ version, autostartEnabled })

    // Hydrate MCP status (including token) on startup
    if (window.marrow.mcp) {
      const mcpFull = await window.marrow.mcp.getStatus()
      set({
        mcpStatus: {
          running: mcpFull.running,
          port: mcpFull.port,
          token: mcpFull.token,
          state: (mcpFull as McpStatus).state ?? (mcpFull.running ? 'running' : 'disabled'),
          error: (mcpFull as McpStatus).error ?? null,
        },
      })

      // Subscribe to live status changes — single global listener, never removed
      window.marrow.mcp.onStatusChange((status) => {
        set(s => ({
          mcpStatus: {
            ...s.mcpStatus,
            running: status.running,
            port: status.port,
            // token doesn't change on status-change events; preserve existing
            state: (status as McpStatus).state ?? (status.running ? 'running' : 'disabled'),
            error: (status as McpStatus).error ?? null,
          },
        }))
      })
    }
  },

  async toggleAutostart() {
    if (!window.marrow?.app) return
    const next = !get().autostartEnabled
    await window.marrow.app.setAutostartEnabled(next)
    set({ autostartEnabled: next })
  },

  async toggleMcp() {
    if (!window.marrow?.mcp) return
    const { running } = get().mcpStatus
    if (running) {
      await window.marrow.mcp.stop()
    } else {
      const result = await window.marrow.mcp.start()
      set(s => ({ mcpStatus: { ...s.mcpStatus, port: result.port, token: result.token, state: 'running' } }))
    }
  },
}))
