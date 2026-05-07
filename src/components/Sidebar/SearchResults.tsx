import React, { useCallback } from 'react'
import { useSearchStore } from '../../store/useSearchStore'
import { useVaultStore } from '../../store/useVaultStore'
import styles from './SearchResults.module.css'

export const SearchResults: React.FC = () => {
  const results = useSearchStore(s => s.results)
  const query = useSearchStore(s => s.query)
  const indexing = useSearchStore(s => s.indexing)
  const openDocument = useVaultStore(s => s.openDocument)

  const handleClick = useCallback(async (path: string) => {
    await openDocument(path)
  }, [openDocument])

  if (indexing) {
    return <div className={styles.hint}>Indexing…</div>
  }

  if (!query.trim()) return null

  if (results.length === 0) {
    return <div className={styles.hint}>No results for "{query}"</div>
  }

  return (
    <div className={styles.list}>
      {results.map(hit => (
        <button
          key={hit.path}
          className={styles.item}
          onClick={() => handleClick(hit.path)}
        >
          <div className={styles.title}>{hit.title}</div>
          <div className={styles.path}>
            {hit.path.replace(/\\/g, '/').split('/').slice(-3, -1).join(' / ')}
          </div>
          <div className={styles.snippet}>
            {highlightSnippet(hit.snippet, query)}
          </div>
        </button>
      ))}
    </div>
  )
}

function highlightSnippet(snippet: string, query: string): React.ReactNode[] {
  const terms = query.trim().split(/\s+/).filter(Boolean)
  if (!terms.length) return [snippet]

  const regex = new RegExp(`(${terms.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = snippet.split(regex)

  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className={styles.mark}>{part}</mark>
      : part
  )
}
