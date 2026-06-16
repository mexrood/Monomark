// Minimal shim for `electron` module in sidecar context.
// Only provides what the MCP server code actually uses.

import * as path from 'path'
import * as os from 'os'

export const app = {
  getPath(name: string): string {
    switch (name) {
      case 'home':
        return os.homedir()
      case 'userData':
        return process.env.MONOMARK_DATA_DIR
          || path.join(process.env.APPDATA || path.join(os.homedir(), '.config'), 'monomark')
      case 'appData':
        return process.env.APPDATA || path.join(os.homedir(), '.config')
      default:
        return os.homedir()
    }
  },
}

export class BrowserWindow {
  static getAllWindows() {
    return []
  }
}

export const ipcMain = {
  handle(_channel: string, _handler: (...args: unknown[]) => unknown) {},
  on(_channel: string, _handler: (...args: unknown[]) => unknown) { return ipcMain },
  removeHandler(_channel: string) {},
}
