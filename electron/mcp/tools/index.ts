import { toolList } from './list'
import { toolRead } from './read'
import { toolWrite } from './write'
import { toolSearch } from './search'
import { toolCreateFolder } from './create-folder'
import { toolSummarizeFile } from './summarize'
import { toolSearchBlocks } from './search-blocks'
import { toolFindRelated } from './find-related'
import { toolGetBlock } from './get-block'
import { withAudit } from '../audit'
import { VaultError } from '../paths'

export interface ToolDef {
  name: string
  description: string
  inputSchema: object
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

function mcpError(code: string, message: string) {
  return {
    isError: true,
    errorCode: code,
    content: [{ type: 'text', text: message }],
  }
}

function wrapHandler(
  name: string,
  fn: (args: Record<string, unknown>) => Promise<unknown>
): (args: Record<string, unknown>) => Promise<unknown> {
  return async (args) => {
    try {
      return await withAudit(name, args, () => fn(args))
    } catch (err: unknown) {
      if (err instanceof VaultError) {
        return mcpError(err.code, err.message)
      }
      const e = err as Error
      return mcpError('internal_error', e.message ?? 'Unknown error')
    }
  }
}

export const tools: ToolDef[] = [
  {
    name: 'vault_list',
    description:
      'List files and folders in the user\'s Monomark vault. Returns a tree of markdown files organized by project. Use this to discover what projects and documents exist before reading or writing.',
    inputSchema: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'Optional relative path inside vault to list. Defaults to vault root.',
        },
        recursive: {
          type: 'boolean',
          description: 'If false, lists only direct children. Default: true.',
        },
      },
    },
    handler: wrapHandler('vault_list', (args) =>
      toolList(args as { path?: string; recursive?: boolean })
    ),
  },
  {
    name: 'vault_read',
    description:
      'Read the full text content of a markdown file from the user\'s vault. Use this to access notes, documentation, problem logs, or any other content the user has stored.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Relative path inside vault, e.g. "projects/saas-pricing/pricing.md"',
        },
      },
    },
    handler: wrapHandler('vault_read', (args) =>
      toolRead(args as { path: string })
    ),
  },
  {
    name: 'vault_write',
    description:
      'Write content to a markdown file in the user\'s vault. By default, new files go to the inbox/ folder for the user to organize later. To save to a specific project, provide the full relative path. To overwrite an existing file, set overwrite: true — otherwise the call fails to prevent accidental data loss.',
    inputSchema: {
      type: 'object',
      required: ['path', 'content'],
      properties: {
        path: {
          type: 'string',
          description:
            'Relative path. If just a filename ("notes.md"), goes to inbox/. If "projects/foo/notes.md", goes there.',
        },
        content: {
          type: 'string',
          description: 'Full file content (UTF-8 markdown)',
        },
        overwrite: {
          type: 'boolean',
          description:
            'Set to true to overwrite an existing file. Default: false (fails if file exists).',
        },
      },
    },
    handler: wrapHandler('vault_write', (args) =>
      toolWrite(args as { path: string; content: string; overwrite?: boolean })
    ),
  },
  {
    name: 'vault_search',
    description:
      'Search for text across all markdown files in the user\'s vault. Returns matching files with snippets. Use this to find existing notes on a topic before writing new ones.',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Search query',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Default: 20, max: 100.',
        },
      },
    },
    handler: wrapHandler('vault_search', (args) =>
      toolSearch(args as { query: string; limit?: number })
    ),
  },
  {
    name: 'vault_create_folder',
    description:
      'Create a new folder inside the user\'s vault, useful when starting a new project. Optionally seed it with a CLAUDE.md context file and README.md.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Relative path, e.g. "projects/new-thing"',
        },
        initialize_project: {
          type: 'boolean',
          description:
            'If true, creates CLAUDE.md and README.md inside the new folder. Default: false.',
        },
      },
    },
    handler: wrapHandler('vault_create_folder', (args) =>
      toolCreateFolder(args as { path: string; initialize_project?: boolean })
    ),
  },
  {
    name: 'vault_summarize_file',
    description:
      'Summarize a markdown file from the user\'s vault using Monomark\'s local AI model. Returns a short 3-5 sentence summary instead of the full text — use this to save tokens when you only need the gist of a long note. Requires the user to have enabled AI and activated a model in Monomark.',
    inputSchema: {
      type: 'object',
      required: ['path'],
      properties: {
        path: {
          type: 'string',
          description: 'Relative path inside vault, e.g. "projects/saas-pricing/pricing.md"',
        },
      },
    },
    handler: wrapHandler('vault_summarize_file', (args) =>
      toolSummarizeFile(args as { path: string })
    ),
  },
  {
    name: 'vault_search_blocks',
    description:
      'Semantically search individual paragraphs and blocks in the user\'s vault by meaning, not just keywords. ' +
      'Returns the most relevant paragraphs from the user\'s notes — each with its text, source file, last-edited date, ' +
      'a block_id, and a relevance score. ' +
      'USE THIS when the user asks about something they have written or thought about before, or when you want to ' +
      'cite specific paragraphs (not whole files). DO NOT use it to list files (vault_list), read whole files ' +
      '(vault_read), or do filename/keyword search (vault_search). ' +
      'Because it uses semantic embeddings, it finds relevant content even when exact words differ. ' +
      'When quoting a result to the user, format it as a blockquote followed by "— {file} (updated {date})".',
    inputSchema: {
      type: 'object',
      required: ['query'],
      properties: {
        query: {
          type: 'string',
          description: 'Natural-language description of what you are looking for.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Default: 10, max: 50.',
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity score 0-1. Default: 0.55.',
        },
      },
    },
    handler: wrapHandler('vault_search_blocks', (args) =>
      toolSearchBlocks(args as { query?: string; limit?: number; threshold?: number })
    ),
  },
  {
    name: 'vault_find_related',
    description:
      'Find blocks semantically related to a specific block in the user\'s vault. ' +
      'Given a block_id (from vault_search_blocks or vault_get_block results), returns other paragraphs the user ' +
      'has written on similar topics, ordered by similarity, excluding the original block. ' +
      'USE THIS when you found one relevant block and want to explore similar thinking elsewhere, show how the ' +
      'user\'s thinking on a topic evolved, or find contradictions/refinements of an idea. ' +
      'DO NOT use it to search by text (vault_search_blocks) or read whole files (vault_read).',
    inputSchema: {
      type: 'object',
      required: ['block_id'],
      properties: {
        block_id: {
          type: 'string',
          description: 'The 8-character block ID to find relations for.',
        },
        limit: {
          type: 'number',
          description: 'Maximum results to return. Default: 10, max: 50.',
        },
        threshold: {
          type: 'number',
          description: 'Minimum similarity score 0-1. Default: 0.70.',
        },
        include_same_file: {
          type: 'boolean',
          description: 'Include blocks from the same file as the source. Default: false.',
        },
      },
    },
    handler: wrapHandler('vault_find_related', (args) =>
      toolFindRelated(args as {
        block_id?: string
        limit?: number
        threshold?: number
        include_same_file?: boolean
      })
    ),
  },
  {
    name: 'vault_get_block',
    description:
      'Get a single block by its 8-character block_id, optionally with surrounding context. ' +
      'USE THIS when you have a block_id (from vault_search_blocks or vault_find_related) and want full details, ' +
      'or want to see the blocks immediately before/after it for context before quoting. ' +
      'Returns the block content, metadata (file, dates), whether its file still exists, and optional context.',
    inputSchema: {
      type: 'object',
      required: ['block_id'],
      properties: {
        block_id: {
          type: 'string',
          description: 'The 8-character block ID.',
        },
        context: {
          type: 'number',
          description: 'Number of surrounding blocks (before and after) to include. 0-3, default 0.',
        },
      },
    },
    handler: wrapHandler('vault_get_block', (args) =>
      toolGetBlock(args as { block_id?: string; context?: number })
    ),
  },
]
