import React from 'react'
import styles from './RichEditor.module.css'

interface Props {
  /** Raw YAML front-matter block including the `---` delimiters. */
  content: string
}

/** Read-only card rendered above the editor when a file has YAML front-matter.
 *  The front-matter passes through unchanged to disk — TipTap never sees it. */
export const FrontmatterCard: React.FC<Props> = ({ content }) => {
  // Strip the surrounding `---` fences for a cleaner display
  const inner = content
    .replace(/^---\r?\n/, '')
    .replace(/\r?\n---\s*$/, '')
    .trim()

  return (
    <div className={styles.frontmatterCard}>
      <pre className={styles.frontmatterPre}>{inner}</pre>
    </div>
  )
}
