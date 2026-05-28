// Drop-in replacement for electron-store in the sidecar.
// Reads MONOMARK_VAULT_PATH, MONOMARK_MCP_TOKEN from env vars.

import * as fs from 'fs'
import * as path from 'path'

const configPath = process.env.MONOMARK_CONFIG_FILE
  || path.join(process.env.APPDATA || process.env.HOME || '.', 'monomark', 'sidecar-config.json')

let data: Record<string, unknown> = {}

try {
  if (fs.existsSync(configPath)) {
    data = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
  }
} catch {}

if (process.env.MONOMARK_VAULT_PATH) data.vaultPath = process.env.MONOMARK_VAULT_PATH
if (process.env.MONOMARK_MCP_TOKEN) data.mcpToken = process.env.MONOMARK_MCP_TOKEN

const storeImpl = {
  get(key: string): unknown {
    return data[key]
  },
  set(key: string, value: unknown) {
    data[key] = value
    try {
      fs.mkdirSync(path.dirname(configPath), { recursive: true })
      fs.writeFileSync(configPath, JSON.stringify(data, null, 2), 'utf-8')
    } catch {}
  },
}

// Named export for `import { store } from '../store'`
export const store = storeImpl

// Default export mimics ElectronStore constructor for `import ElectronStore from 'electron-store'`
export default class StoreShim {
  private _data: Record<string, unknown>
  constructor(_opts?: unknown) {
    this._data = data
  }
  get(key: string) { return this._data[key] }
  set(key: string, value: unknown) { storeImpl.set(key, value) }
}
