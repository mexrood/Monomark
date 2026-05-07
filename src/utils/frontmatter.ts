/** Split raw markdown into YAML front-matter block and body text.
 *  The front-matter block (including its `---` delimiters) is returned
 *  as-is so it can be re-prepended verbatim on every save. */
export function splitFrontmatter(raw: string): { frontmatter: string; body: string } {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
  if (!match) return { frontmatter: '', body: raw }
  return { frontmatter: match[0], body: raw.slice(match[0].length) }
}

/** Rejoin front-matter block and body into a single markdown string. */
export function joinFrontmatter(frontmatter: string, body: string): string {
  if (!frontmatter) return body
  // Ensure exactly one newline between the closing `---` and the body
  return frontmatter.endsWith('\n') ? frontmatter + body : frontmatter + '\n' + body
}
