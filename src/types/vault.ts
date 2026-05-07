export type VaultFile = {
  kind: 'file'
  path: string
  name: string
  mtime: number
}

export type VaultFolder = {
  kind: 'folder'
  path: string
  name: string
  children: VaultNode[]
}

export type VaultNode = VaultFile | VaultFolder

export type DocumentState =
  | { kind: 'empty' }
  | { kind: 'vault'; path: string; content: string; dirty: boolean }
  | { kind: 'external'; path: string; content: string }
