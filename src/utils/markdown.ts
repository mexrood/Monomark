import MarkdownIt from 'markdown-it'
import markdownItMark from 'markdown-it-mark'
import hljs from 'highlight.js/lib/core'
import javascript from 'highlight.js/lib/languages/javascript'
import typescript from 'highlight.js/lib/languages/typescript'
import python from 'highlight.js/lib/languages/python'
import bash from 'highlight.js/lib/languages/bash'
import json from 'highlight.js/lib/languages/json'
import yaml from 'highlight.js/lib/languages/yaml'
import markdown from 'highlight.js/lib/languages/markdown'
import css from 'highlight.js/lib/languages/css'
import xml from 'highlight.js/lib/languages/xml'
import sql from 'highlight.js/lib/languages/sql'
import rust from 'highlight.js/lib/languages/rust'
import go from 'highlight.js/lib/languages/go'
import diff from 'highlight.js/lib/languages/diff'
import shell from 'highlight.js/lib/languages/shell'

hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('js', javascript)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('ts', typescript)
hljs.registerLanguage('python', python)
hljs.registerLanguage('py', python)
hljs.registerLanguage('bash', bash)
hljs.registerLanguage('sh', bash)
hljs.registerLanguage('json', json)
hljs.registerLanguage('yaml', yaml)
hljs.registerLanguage('yml', yaml)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('md', markdown)
hljs.registerLanguage('css', css)
hljs.registerLanguage('html', xml)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('sql', sql)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('rs', rust)
hljs.registerLanguage('go', go)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('shell', shell)

export const md = new MarkdownIt({
  html: true,
  linkify: true,
  typographer: true,
  breaks: false,
  highlight(code, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs-block"><code class="hljs">' +
          hljs.highlight(code, { language: lang, ignoreIllegals: true }).value +
          '</code></pre>'
        )
      } catch { /* fall through */ }
    }
    return (
      '<pre class="hljs-block"><code class="hljs">' +
      md.utils.escapeHtml(code) +
      '</code></pre>'
    )
  },
})

md.use(markdownItMark)

// Wrap tables in a scrollable container to prevent horizontal overflow
md.renderer.rules.table_open = () => '<div class="prose-table-wrap"><table>'
md.renderer.rules.table_close = () => '</table></div>'

// Task list support: replace [ ] / [x] at start of list items with styled checkboxes
// eslint-disable-next-line @typescript-eslint/no-explicit-any
md.core.ruler.push('task_list', (state: any) => {
  for (let i = 0; i < state.tokens.length; i++) {
    const token = state.tokens[i]
    if (token.type !== 'inline' || !token.children) continue

    const children: any[] = token.children
    if (children.length === 0) continue

    const first = children[0]
    if (first.type !== 'text') continue

    const text: string = first.content
    const unchecked = text.startsWith('[ ] ')
    const checked = text.startsWith('[x] ') || text.startsWith('[X] ')
    if (!unchecked && !checked) continue

    first.content = text.slice(4)

    const checkedAttr = checked ? 'true' : 'false'
    const svg = checked
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`
      : ''
    // Inject a pseudo-token — md-it renderer duck-types children at render time
    children.unshift({
      type: 'html_inline',
      content: `<button class="prose-checkbox" data-checked="${checkedAttr}" type="button" aria-checked="${checkedAttr}" role="checkbox">${svg}</button> `,
    })
  }
})

// Open external links in new tab / Electron shell
const defaultLinkOpen =
  md.renderer.rules.link_open ||
  function (tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options)
  }

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const href = tokens[idx].attrGet('href') ?? ''
  if (href.startsWith('http://') || href.startsWith('https://')) {
    tokens[idx].attrSet('target', '_blank')
    tokens[idx].attrSet('rel', 'noopener noreferrer')
  }
  return defaultLinkOpen(tokens, idx, options, env, self)
}
