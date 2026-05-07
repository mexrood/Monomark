import { useEffect, useState } from 'react'
import { useVaultStore } from '../store/useVaultStore'

type InitState = 'loading' | 'welcome' | 'ready'

export function useVaultInit(): InitState {
  const [state, setState] = useState<InitState>('loading')

  useEffect(() => {
    async function init() {
      // In browser preview (no Electron), skip vault check
      if (!window.marrow?.vault) {
        setState('ready')
        return
      }

      const vaultPath = await window.marrow.vault.getVaultPath()
      if (!vaultPath) {
        setState('welcome')
        return
      }

      useVaultStore.setState({ vaultPath })
      await useVaultStore.getState().refreshTree()
      setState('ready')
    }

    init()
  }, [])

  return state
}
