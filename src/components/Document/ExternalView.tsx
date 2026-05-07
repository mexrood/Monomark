import React, { useCallback, useMemo } from 'react'
import MarkdownIt from 'markdown-it'
import markdownItMark from 'markdown-it-mark'
import hljs from 'highlight.js/lib/common'
import { useVaultStore } from '../../store/useVaultStore'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return hljs.highlight(str, { language: lang, ignoreIllegals: true }).value
      } catch { /* ignore */ }
    }
    return ''
  },
})
// eslint-disable-next-line @typescript-eslint/no-explicit-any
md.use(markdownItMark as any)
md.renderer.rules.table_open = () => '<div class="prose-table-wrap"><table>'
md.renderer.rules.table_close = () => '</table></div>'

export const ExternalView: React.FC<{ content: string; filePath?: string }> = ({ content, filePath }) => {
  const openDocument = useVaultStore(s => s.openDocument)
  const vaultPath = useVaultStore(s => s.vaultPath)

  const html = useMemo(() => md.render(content), [content])

  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = (e.target as HTMLElement).closest('a')
    if (!target) return
    const href = target.getAttribute('href') ?? ''
    if (href.startsWith('http://') || href.startsWith('https://')) return
    if (href.endsWith('.md') && filePath && vaultPath) {
      e.preventDefault()
      const base = filePath.replace(/[\\/][^\\/]+$/, '')
      openDocument(base + '/' + href)
    }
  }, [filePath, vaultPath, openDocument])

  return (
    <div onClick={handleClick}>
      <div
        className="prose"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}
