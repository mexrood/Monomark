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
