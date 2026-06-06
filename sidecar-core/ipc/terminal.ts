import { ipcMain } from 'electron'
import { spawn } from 'child_process'

export function registerTerminalIPC() {
  ipcMain.handle('terminal:open', (_event, folderPath: string) => {
    const platform = process.platform

    if (platform === 'darwin') {
      // macOS — open Terminal.app at folderPath
      spawn('open', ['-a', 'Terminal', folderPath], { detached: true, stdio: 'ignore' }).unref()
    } else if (platform === 'win32') {
      // Windows — open cmd at folderPath
      spawn('cmd', ['/c', 'start', 'cmd', '/K', `cd /d "${folderPath}"`], {
        detached: true,
        stdio: 'ignore',
        shell: true,
      }).unref()
    } else {
      // Linux — try x-terminal-emulator
      spawn('x-terminal-emulator', [`--working-directory=${folderPath}`], {
        detached: true,
        stdio: 'ignore',
      }).unref()
    }
  })
}
