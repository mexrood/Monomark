import { ipcMain, BrowserWindow } from 'electron'
import { store } from '../store'
import { mcpServerManager } from '../mcp/server'
import { auditLog } from '../mcp/audit'
import {
  getClaudeDesktopInstallStatus,
  installToClaudeDesktop,
  buildClaudeCodeCommand,
} from '../mcp/clientConfig'

export function registerMcpIPC() {
  ipcMain.handle('mcp:getStatus', () => {
    const status = mcpServerManager.getStatus()
    return {
      running: status.state === 'running',
      port: status.port,
      token: mcpServerManager.getToken(),
      state: status.state,
      error: status.error,
    }
  })

  ipcMain.handle('mcp:start', async () => {
    const result = await mcpServerManager.start()
    store.set('mcpEnabled', true)
    return result
  })

  ipcMain.handle('mcp:stop', async () => {
    await mcpServerManager.stop()
    store.set('mcpEnabled', false)
  })

  ipcMain.handle('mcp:getAuditLog', (_event, limit?: number) => {
    return auditLog.getRecent(limit ?? 50)
  })

  ipcMain.handle('mcp:regenerateToken', async () => {
    const token = await mcpServerManager.regenerateToken()
    return token
  })

  ipcMain.handle('mcp:getInstallStatus', async () => {
    const status = mcpServerManager.getStatus()
    if (status.state !== 'running') return { status: 'not_configured' }
    const port = status.port
    const token = mcpServerManager.getToken()
    const url = `http://127.0.0.1:${port}/mcp`
    return getClaudeDesktopInstallStatus(url, token ?? '')
  })

  ipcMain.handle('mcp:installToClaudeDesktop', async () => {
    const status = mcpServerManager.getStatus()
    const port = status.port
    const token = mcpServerManager.getToken()
    const url = `http://127.0.0.1:${port}/mcp`
    return installToClaudeDesktop(url, token ?? '')
  })

  ipcMain.handle('mcp:getClaudeCodeCommand', () => {
    const status = mcpServerManager.getStatus()
    const port = status.port
    const token = mcpServerManager.getToken()
    const url = `http://127.0.0.1:${port}/mcp`
    return buildClaudeCodeCommand(url, token ?? '')
  })

  // Forward status changes to renderer
  mcpServerManager.on('status', (status) => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('mcp:status-change', {
        running: status.state === 'running',
        port: status.port,
        state: status.state,
        error: status.error,
      })
    })
  })

  // Forward new audit calls to renderer
  auditLog.on('call', (call) => {
    BrowserWindow.getAllWindows().forEach(win => {
      win.webContents.send('mcp:new-call', call)
    })
  })
}
