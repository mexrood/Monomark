import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Search, FileText } from 'lucide-react'
import styles from './SearchPalette.module.css'
import { useUIStore } from '../../store/useUIStore'
import { useSearchStore } from '../../store/useSearchStore'
import { useVaultStore } from '../../store/useVaultStore'

export const SearchPalette: React.FC = () => {
  const close = useUIStore(s => s.closeSearchPalette)
  const { query, results, setQuery } = useSearchStore()
  const vaultPath = useVaultStore(s => s.vaultPath)
  const openDocument = useVaultStore(s => s.openDocument)

  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus input on open
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset selection when results change
  useEffect(() => {
    setSelected(0)
  }, [results])

  const handleOpen = useCallback((path: string) => {
    openDocument(path)
    setQuery('')
    close()
  }, [openDocument, setQuery, close])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = results[selected]
      if (hit) handleOpen(hit.path)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      close()
    }
  }, [results, selected, handleOpen, setQuery, close])

  const relPath = (abs: string) => {
    if (!vaultPath) return abs
    const base = vaultPath.replace(/\\/g, '/').replace(/\/?$/, '/')
    return abs.replace(/\\/g, '/').replace(base, '')
  }

  return (
    <div className={styles.backdrop} onClick={() => { setQuery(''); close() }}>
      <div className={styles.palette} onClick={e => e.stopPropagation()}>

        <div className={styles.inputRow}>
          <Search size={16} strokeWidth={1.5} className={styles.inputIcon} />
          <input
            ref={inputRef}
            className={styles.input}
            placeholder="Search notes…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
        </div>

        {results.length > 0 && (
          <div className={styles.results}>
            {results.map((hit, i) => (
              <button
                key={hit.path}
                className={`${styles.result} ${i === selected ? styles.resultSelected : ''}`}
                onClick={() => handleOpen(hit.path)}
                onMouseEnter={() => setSelected(i)}
              >
                <FileText size={14} strokeWidth={1.5} className={styles.resultIcon} />
                <div className={styles.resultMeta}>
                  <span className={styles.resultTitle}>{hit.title}</span>
                  <span className={styles.resultPath}>{relPath(hit.path)}</span>
                  {hit.snippet && (
                    <span className={styles.resultSnippet}>{hit.snippet}</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {query && results.length === 0 && (
          <div className={styles.empty}>No results for "{query}"</div>
        )}

      </div>
    </div>
  )
}
