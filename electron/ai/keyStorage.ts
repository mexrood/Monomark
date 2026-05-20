import { safeStorage } from 'electron'
import ElectronStore from 'electron-store'

// Encrypted API-key storage for cloud LLM providers.
//
// Keys go through the OS keychain (Keychain / Credential Vault / libsecret) via
// Electron's safeStorage and are never written in plain text. Where the OS has
// no secure backend (some Linux setups) we fall back to base64 — clearly marked
// `enc: false` — so the feature still works, just without OS encryption.

interface StoredKey {
  enc: boolean
  data: string
}

const store = new ElectronStore<Record<string, StoredKey>>({ name: 'ai-keys' })

export function saveApiKey(providerId: string, key: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key)
    store.set(providerId, { enc: true, data: encrypted.toString('base64') })
  } else {
    console.warn('[keyStorage] OS encryption unavailable — storing key base64-encoded only')
    store.set(providerId, { enc: false, data: Buffer.from(key, 'utf-8').toString('base64') })
  }
}

export function getApiKey(providerId: string): string | null {
  const stored = store.get(providerId) as StoredKey | undefined
  if (!stored) return null
  try {
    const buffer = Buffer.from(stored.data, 'base64')
    return stored.enc ? safeStorage.decryptString(buffer) : buffer.toString('utf-8')
  } catch {
    return null
  }
}

export function deleteApiKey(providerId: string): void {
  store.delete(providerId)
}

export function hasApiKey(providerId: string): boolean {
  return store.has(providerId)
}
