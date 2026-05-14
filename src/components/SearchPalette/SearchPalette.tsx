import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Search, FileText, Clock } from 'lucide-react'
import styles from './SearchPalette.module.css'
import { useUIStore } from '../../store/useUIStore'
import { useSearchStore } from '../../store/useSearchStore'
import { useVaultStore, flattenTree } from '../../store/useVaultStore'

type PaletteItem = {
  path: string
  title: string
  snippet?: string
  /** When set, render this prefix range bold (for query match highlighting). */
  highlight?: { start: number; end: number }
}

const RECENT_LIMIT = 15

export const SearchPalette: React.FC = () => {
  const close = useUIStore(s => s.closeSearchPalette)
  const { query, results, setQuery } = useSearchStore()
  const vaultPath = useVaultStore(s => s.vaultPath)
  const tree = useVaultStore(s => s.tree)
  const openDocument = useVaultStore(s => s.openDocument)

  const [selected, setSelected] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const recent: PaletteItem[] = useMemo(() => {
    const files = flattenTree(tree)
    return [...files]
      .sort((a, b) => b.mtime - a.mtime)
      .slice(0, RECENT_LIMIT)
      .map(f => ({
        path: f.path,
        title: stripMdExt(f.name),
      }))
  }, [tree])

  const trimmedQuery = query.trim()
  const showRecent = trimmedQuery === ''

  const items: PaletteItem[] = useMemo(() => {
    if (showRecent) return recent
    return results.map(hit => ({
      path: hit.path,
      title: hit.title,
      snippet: hit.snippet,
      highlight: findMatch(hit.title, trimmedQuery),
    }))
  }, [showRecent, recent, results, trimmedQuery])

  useEffect(() => {
    setSelected(0)
  }, [items])

  const handleOpen = useCallback((path: string) => {
    openDocument(path)
    setQuery('')
    close()
  }, [openDocument, setQuery, close])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelected(s => Math.min(s + 1, items.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelected(s => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const hit = items[selected]
      if (hit) handleOpen(hit.path)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      close()
    }
  }, [items, selected, handleOpen, setQuery, close])

  const relPath = (abs: string) => {
    if (!vaultPath) return abs
    const base = vaultPath.replace(/\\/g, '/').replace(/\/?$/, '/')
    return abs.replace(/\\/g, '/').replace(base, '')
  }

  const sectionLabel = showRecent ? 'Recent' : 'Results'

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

        {items.length > 0 && (
          <div className={styles.results}>
            <div className={styles.sectionLabel}>{sectionLabel}</div>
            {items.map((item, i) => {
              const Icon = showRecent ? Clock : FileText
              return (
                <button
                  key={item.path}
                  className={`${styles.result} ${i === selected ? styles.resultSelected : ''}`}
                  onClick={() => handleOpen(item.path)}
                  onMouseEnter={() => setSelected(i)}
                >
                  <Icon size={14} strokeWidth={1.5} className={styles.resultIcon} />
                  <div className={styles.resultMeta}>
                    <span className={styles.resultTitle}>
                      {renderHighlighted(item.title, item.highlight)}
                    </span>
                    <span className={styles.resultPath}>{relPath(item.path)}</span>
                    {item.snippet && (
                      <span className={styles.resultSnippet}>{item.snippet}</span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}

        {!showRecent && items.length === 0 && (
          <div className={styles.empty}>No results for "{query}"</div>
        )}
        {showRecent && items.length === 0 && (
          <div className={styles.empty}>No notes yet — start typing to search the vault.</div>
        )}
      </div>
    </div>
  )
}

function stripMdExt(name: string): string {
  return name.replace(/\.md$/i, '')
}

function findMatch(text: string, query: string): { start: number; end: number } | undefined {
  if (!query) return undefined
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return undefined
  return { start: idx, end: idx + query.length }
}

function renderHighlighted(text: string, range: { start: number; end: number } | undefined): React.ReactNode {
  if (!range) return text
  return (
    <>
      {text.slice(0, range.start)}
      <strong className={styles.match}>{text.slice(range.start, range.end)}</strong>
      {text.slice(range.end)}
    </>
  )
}
