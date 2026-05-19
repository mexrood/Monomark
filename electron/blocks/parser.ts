import MarkdownIt from 'markdown-it'

export type BlockType =
  | 'paragraph'
  | 'heading'
  | 'list_item'
  | 'code'
  | 'blockquote'
  | 'table'
  | 'image'

export interface Block {
  /** Existing block ID, or null when the block has none yet. */
  id: string | null
  type: BlockType
  /** Raw text content (best-effort, used for embeddings in later phases). */
  text: string
  /** 1-based first line, in body space (frontmatter excluded). */
  startLine: number
  /** 1-based last line, inclusive, in body space. */
  endLine: number
}

export interface BidMarker {
  id: string
  /** 1-based line of the `<!-- bid: ... -->` comment, in body space. */
  line: number
  /** Leading whitespace of that line (used to keep list-item markers indented). */
  indent: string
}

export interface ParseResult {
  /** Verbatim frontmatter block including `---` fences, or '' when absent. */
  frontmatter: string
  /** Document body with frontmatter stripped. */
  body: string
  blocks: Block[]
  markers: BidMarker[]
}

/** Matches a line that is exactly a block-id comment (any indentation). */
const BID_LINE = /^([ \t]*)<!--\s*bid:\s*([a-f0-9]{8})\s*-->[ \t]*$/

// `html: true` so `<!-- bid -->` lines parse as `html_block` tokens rather
// than visible paragraph text — that lets us detect them as markers.
const md = new MarkdownIt({ html: true })

function splitFrontmatter(content: string): { frontmatter: string; body: string } {
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/)
  if (!match) return { frontmatter: '', body: content }
  return { frontmatter: match[0], body: content.slice(match[0].length) }
}

// Containers whose direct children must NOT receive their own ID — the
// container itself is the atomic block (blockquote), or the children are
// nested below the top level (nested lists / list-item content).
type Container = 'blockquote' | 'bullet_list' | 'ordered_list' | 'list_item'

/**
 * Parse markdown into block-level elements plus any block-id markers already
 * present. Line numbers are 1-based and relative to the body (frontmatter
 * stripped) so callers can serialize against the body verbatim.
 */
export function parseBlocks(content: string): ParseResult {
  const { frontmatter, body } = splitFrontmatter(content)
  const blocks: Block[] = []
  const markers: BidMarker[] = []

  if (body.trim() === '') return { frontmatter, body, blocks, markers }

  const lines = body.split(/\r?\n/)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tokens: any[] = md.parse(body, {})
  const stack: Container[] = []

  // A block is recordable only at the true top level, or as a direct item of
  // a single top-level list.
  const recordable = (type: BlockType): boolean => {
    if (stack.length === 0) return true
    if (
      stack.length === 1 &&
      (stack[0] === 'bullet_list' || stack[0] === 'ordered_list')
    ) {
      return type === 'list_item'
    }
    return false
  }

  const push = (type: BlockType, map: [number, number], text = '') => {
    blocks.push({
      id: null,
      type,
      text,
      startLine: map[0] + 1,
      endLine: map[1], // map[1] is exclusive 0-based → inclusive 1-based last line
    })
  }

  for (let i = 0; i < tokens.length; i++) {
    const tk = tokens[i]
    switch (tk.type) {
      case 'blockquote_open':
        if (recordable('blockquote') && tk.map) push('blockquote', tk.map)
        stack.push('blockquote')
        break
      case 'blockquote_close':
        stack.pop()
        break
      case 'bullet_list_open':
        stack.push('bullet_list')
        break
      case 'bullet_list_close':
        stack.pop()
        break
      case 'ordered_list_open':
        stack.push('ordered_list')
        break
      case 'ordered_list_close':
        stack.pop()
        break
      case 'list_item_open':
        if (recordable('list_item') && tk.map) push('list_item', tk.map)
        stack.push('list_item')
        break
      case 'list_item_close':
        stack.pop()
        break
      case 'heading_open':
        if (recordable('heading') && tk.map) {
          push('heading', tk.map, tokens[i + 1]?.content ?? '')
        }
        break
      case 'paragraph_open': {
        const inline = tokens[i + 1]
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const children: any[] = inline?.children ?? []
        const hasImage = children.some(c => c.type === 'image')
        const onlyImage =
          hasImage &&
          children.every(
            c =>
              c.type === 'image' ||
              c.type === 'softbreak' ||
              (c.type === 'text' && c.content.trim() === ''),
          )
        if (recordable(onlyImage ? 'image' : 'paragraph') && tk.map) {
          push(onlyImage ? 'image' : 'paragraph', tk.map, inline?.content ?? '')
        }
        break
      }
      case 'fence':
      case 'code_block':
        if (recordable('code') && tk.map) push('code', tk.map, tk.content ?? '')
        break
      case 'table_open':
        if (recordable('table') && tk.map) push('table', tk.map)
        break
      case 'html_block':
        // An html_block may span several lines; scan each for a bid marker.
        if (tk.map) {
          for (let ln = tk.map[0]; ln < tk.map[1]; ln++) {
            const m = lines[ln]?.match(BID_LINE)
            if (m) markers.push({ id: m[2], line: ln + 1, indent: m[1] })
          }
        }
        break
      // `hr` (thematic break) intentionally produces no block.
      default:
        break
    }
  }

  return { frontmatter, body, blocks, markers }
}
