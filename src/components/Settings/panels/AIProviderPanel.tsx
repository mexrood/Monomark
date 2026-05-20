import React, { useEffect, useState } from 'react'
import { SettingsPage, Section } from '../SettingsPage'
import { Button } from '../../ui/Button'
import styles from './AIProviderPanel.module.css'
import { useAIProviderStore } from '../../../store/useAIProviderStore'

// Cloud LLM provider settings — pick which backend powers smart_context /
// summarize_file, and store API keys for the cloud providers.

const PROVIDER_INFO: Record<string, React.ReactNode> = {
  gemini: (
    <>
      Free API key:{' '}
      <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">
        aistudio.google.com/apikey
      </a>
      <br />
      Free tier: 1500 requests/day, 15 RPM.
    </>
  ),
  groq: (
    <>
      Free API key:{' '}
      <a href="https://console.groq.com/keys" target="_blank" rel="noreferrer">
        console.groq.com/keys
      </a>
      <br />
      Free tier: 30 RPM, very fast (500+ tok/s).
    </>
  ),
}

export const AIProviderPanel: React.FC = () => {
  const { providers, activeId, loadProviders, setActive, saveKey, deleteKey, testProvider } =
    useAIProviderStore()

  const [keys, setKeys] = useState<Record<string, string>>({})
  const [testing, setTesting] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; msg: string }>>({})

  useEffect(() => {
    loadProviders()
  }, [loadProviders])

  const handleSaveKey = async (providerId: string) => {
    const key = keys[providerId]?.trim()
    if (!key) return
    await saveKey(providerId, key)
    setKeys(prev => ({ ...prev, [providerId]: '' }))
  }

  const handleTest = async (providerId: string) => {
    setTesting(providerId)
    try {
      const result = await testProvider(providerId)
      setTestResults(prev => ({
        ...prev,
        [providerId]: {
          ok: result.ok,
          msg: result.ok ? `Working — "${result.response}"` : (result.error ?? 'Failed'),
        },
      }))
    } finally {
      setTesting(null)
    }
  }

  const cloudProviders = providers.filter(p => p.id !== 'local')

  return (
    <SettingsPage
      title="AI Provider"
      description="Choose which LLM powers Monomark's AI features. Cloud providers are far faster than the local model."
    >
      <Section title="Active provider">
        <select
          className={styles.select}
          value={activeId}
          onChange={e => setActive(e.target.value)}
        >
          {providers.map(p => (
            <option key={p.id} value={p.id} disabled={!p.ready}>
              {p.name}
              {!p.ready ? ' (not configured)' : ''}
            </option>
          ))}
        </select>
      </Section>

      <Section title="Cloud providers">
        {cloudProviders.length === 0 && (
          <p className={styles.providerInfo}>Loading…</p>
        )}
        {cloudProviders.map(p => {
          const result = testResults[p.id]
          return (
            <div key={p.id} className={styles.providerCard}>
              <div className={styles.providerHeader}>
                <div>
                  <div className={styles.providerName}>{p.name}</div>
                  <div className={styles.providerStatus}>
                    {p.hasKey ? '✓ API key configured' : 'No API key'}
                  </div>
                </div>
                {p.hasKey && (
                  <Button variant="secondary" onClick={() => deleteKey(p.id)}>
                    Remove key
                  </Button>
                )}
              </div>

              <div className={styles.keyInput}>
                <input
                  type="password"
                  className={styles.input}
                  placeholder={p.hasKey ? 'Replace API key…' : 'Paste API key here'}
                  value={keys[p.id] ?? ''}
                  onChange={e => setKeys(prev => ({ ...prev, [p.id]: e.target.value }))}
                />
                <Button
                  variant="primary"
                  onClick={() => handleSaveKey(p.id)}
                  disabled={!keys[p.id]?.trim()}
                >
                  Save
                </Button>
              </div>

              {p.hasKey && (
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    onClick={() => handleTest(p.id)}
                    disabled={testing === p.id}
                  >
                    {testing === p.id ? 'Testing…' : 'Test connection'}
                  </Button>
                  {result && (
                    <span className={result.ok ? styles.testOk : styles.testErr}>
                      {result.msg}
                    </span>
                  )}
                </div>
              )}

              <div className={styles.providerInfo}>{PROVIDER_INFO[p.id]}</div>
            </div>
          )
        })}
      </Section>
    </SettingsPage>
  )
}
