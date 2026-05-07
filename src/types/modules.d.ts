declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'
  const plugin: (md: MarkdownIt) => void
  export default plugin
}

declare module '*.css' {
  const styles: Record<string, string>
  export default styles
}
