import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { FileText, X } from 'lucide-react'
import { ExternalView } from './components/Document/ExternalView'
import { useUIStore } from './store/useUIStore'
import styles from './PreviewApp.module.css'

interface TocHeading {
  level: number
  text: string
  id: string
}

function extractHeadings(content: string): TocHeading[] {
  const headings: TocHeading[] = []
  const regex = /^(#{1,6})\s+(.+)$/gm
  let match
  let idx = 0
  while ((match = regex.exec(content)) !== null) {
    headings.push({
      level: match[1].length,
      text: match[2].replace(/[*_`\[\]]/g, ''),
      id: `preview-h-${idx++}`,
    })
  }
  return headings
}

const PreviewToc: React.FC<{ headings: TocHeading[]; scrollContainer: HTMLElement | null }> = ({ headings, scrollContainer }) => {
  const [activeId, setActiveId] = useState<string | null>(null)

  useEffect(() => {
    if (!scrollContainer || headings.length === 0) return
    const compute = () => {
      const els = headings.map(h => ({
        id: h.id,
        el: scrollContainer.querySelector(`[data-toc-id="${h.id}"]`) as HTMLElement | null,
      })).filter(e => e.el)
      const containerTop = scrollContainer.getBoundingClientRect().top
      let best = els[0]?.id ?? null
      for (const { id, el } of els) {
        if (!el) continue
        if (el.getBoundingClientRect().top <= containerTop + 100) best = id
        else break
      }
      setActiveId(best)
    }
    compute()
    let raf = 0
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; compute() }) }
    scrollContainer.addEventListener('scroll', onScroll, { passive: true })
    return () => { scrollContainer.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [scrollContainer, headings])

  if (headings.length < 3) return null

  const scrollTo = (id: string) => {
    if (!scrollContainer) return
    const el = scrollContainer.querySelector(`[data-toc-id="${id}"]`) as HTMLElement | null
    if (!el) return
    const containerRect = scrollContainer.getBoundingClientRect()
    const top = scrollContainer.scrollTop + (el.getBoundingClientRect().top - containerRect.top) - 60
    scrollContainer.scrollTo({ top, behavior: 'smooth' })
  }

  return (
    <nav className={styles.toc}>
      {headings.map(h => (
        <a
          key={h.id}
          className={`${styles.tocItem} ${h.id === activeId ? styles.tocItemActive : ''}`}
          style={{ paddingLeft: 12 + (h.level - 1) * 12 }}
          onClick={(e) => { e.preventDefault(); scrollTo(h.id) }}
          href={`#${h.id}`}
          title={h.text}
        >
          {h.text}
        </a>
      ))}
    </nav>
  )
}

interface PreviewData {
  filePath: string
  content: string
}

const Corners: React.FC = () => (
  <div className={styles.corners}>
    <div className={`${styles.corner} ${styles.cornerTL}`} />
    <div className={`${styles.corner} ${styles.cornerTR}`} />
    <div className={`${styles.corner} ${styles.cornerBL}`} />
    <div className={`${styles.corner} ${styles.cornerBR}`} />
  </div>
)

export const PreviewApp: React.FC = () => {
  const [data, setData] = useState<PreviewData | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const theme = useUIStore(s => s.theme)
  const contentRef = useRef<HTMLDivElement>(null)
  const headings = useMemo(() => data ? extractHeadings(data.content) : [], [data])

  useEffect(() => {
    if (!contentRef.current || headings.length === 0) return
    const els = contentRef.current.querySelectorAll('h1, h2, h3, h4, h5, h6')
    let idx = 0
    els.forEach(el => {
      if (idx < headings.length) {
        el.setAttribute('data-toc-id', headings[idx].id)
        idx++
      }
    })
  }, [data, headings])

  // The preview window inherits whatever theme the main app last saved.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  // Receive file data from the main process
  useEffect(() => {
    window.marrow.preview?.onLoad((incoming) => {
      setData(incoming)
      setSaved(false)
    })
    return () => { window.marrow.preview?.offLoad() }
  }, [])

  const handleClose = useCallback(() => {
    window.marrow.window.close()
  }, [])

  const handleSave = useCallback(async () => {
    if (!data || saving) return
    setSaving(true)
    try {
      const vaultPath = await window.marrow.vault.getVaultPath()
      if (!vaultPath) return

      const sep = vaultPath.includes('/') ? '/' : '\\'
      const filename = data.filePath.replace(/\\/g, '/').split('/').pop()!
      const inboxDir = `${vaultPath}${sep}inbox`
      const targetPath = `${inboxDir}${sep}${filename}`

      // Avoid overwriting an existing file
      let finalPath = targetPath
      const exists = await window.marrow.vault.exists(targetPath)
      if (exists) {
        const [name, ext] = filename.endsWith('.md')
          ? [filename.slice(0, -3), '.md']
          : [filename, '']
        for (let i = 1; i < 100; i++) {
          const candidate = `${inboxDir}${sep}${name} (${i})${ext}`
          const taken = await window.marrow.vault.exists(candidate)
          if (!taken) { finalPath = candidate; break }
        }
      }

      await window.marrow.vault.writeFile(finalPath, data.content)
      setSaved(true)
      // Show the file in the main window, then close this preview window
      setTimeout(() => window.marrow.preview?.openInMain(finalPath), 800)
    } catch (e) {
      console.error('[preview] save failed', e)
    } finally {
      setSaving(false)
    }
  }, [data, saving])

  const fileName = data?.filePath.replace(/\\/g, '/').split('/').pop() ?? ''
  const dirPath = data?.filePath
    ? (() => {
        const parts = data.filePath.replace(/\\/g, '/').split('/')
        parts.pop()
        return parts.join('/')
      })()
    : ''

  return (
    <div className={styles.app}>
      <Corners />

      {/* ── Header ── */}
      <div className={styles.header}>
        <div className={styles.dragRegion} />
        <div className={styles.headerLeft}>
          <FileText size={13} strokeWidth={1.5} className={styles.fileIcon} />
          <span className={styles.fileName}>{fileName || 'Preview'}</span>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.winControls}>
            <button
              className={`${styles.winBtn} ${styles.winClose}`}
              onClick={handleClose}
              title="Close"
              tabIndex={-1}
            >
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <path d="M1.5 1.5l7 7M8.5 1.5l-7 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className={styles.contentWrap}>
        <div className={styles.blur}>
          <div className={styles.blurLayer1} />
          <div className={styles.blurLayer2} />
          <div className={styles.blurLayer3} />
          <div className={styles.blurLayer4} />
          <div className={styles.gradientOverlay} />
        </div>
        <div className={styles.content} ref={contentRef}>
          {data ? (
            <ExternalView content={data.content} filePath={data.filePath} />
          ) : (
            <div className={styles.empty}>
              <FileText size={32} strokeWidth={1} className={styles.emptyIcon} />
              <span>Waiting for file…</span>
            </div>
          )}
        </div>
        {data && <PreviewToc headings={headings} scrollContainer={contentRef.current} />}
      </div>

      {/* ── Footer ── */}
      {data && (
        <div className={styles.footer}>
          <div className={styles.footerMeta}>
            <span className={styles.footerDir}>{dirPath}</span>
            <span className={styles.footerSep}>/</span>
            <span className={styles.footerFile}>{fileName}</span>
          </div>
          <div className={styles.footerActions}>
            <button
              className={styles.dismissBtn}
              onClick={handleClose}
              tabIndex={-1}
            >
              <X size={12} />
              Dismiss
            </button>
            <button
              className={`${styles.saveBtn} ${saved ? styles.saveBtnDone : ''}`}
              onClick={handleSave}
              disabled={saving || saved}
              tabIndex={-1}
            >
              {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save to Vault'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
