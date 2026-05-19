import { promises as fs } from 'fs'
import { safeResolveInVault, VaultError } from '../paths'
import { store } from '../../store'
import { aiManager } from '../../ai/manager'

// Cap on the text fed to the local model — small GGUF models have a short
// context window. Long files are truncated and the result flags it.
const MAX_INPUT_CHARS = 8000

/**
 * `vault_summarize_file` — distil a vault file with the local LLM so Claude
 * gets a short summary instead of the full text. This is the token-economy
 * win from the Local AI plan's Phase C that does not need embeddings.
 */
export async function toolSummarizeFile(args: { path: string }) {
  const vaultPath = store.get('vaultPath') as string | undefined
  if (!vaultPath) throw new Error('No vault configured')

  const absPath = await safeResolveInVault(vaultPath, args.path)

  let stat: import('fs').Stats
  try {
    stat = await fs.stat(absPath)
  } catch {
    throw new VaultError('not_found', `File not found: ${args.path}`)
  }
  if (stat.isDirectory()) {
    throw new VaultError('not_a_file', `Path is a folder: ${args.path}`)
  }

  const raw = await fs.readFile(absPath, 'utf-8')
  const truncated = raw.length > MAX_INPUT_CHARS
  const text = truncated ? raw.slice(0, MAX_INPUT_CHARS) : raw

  const prompt =
    'Summarize the following markdown note in 3-5 sentences. ' +
    'Be concise and factual. Output only the summary, no preamble.\n\n---\n' +
    text

  let summary: string
  try {
    summary = await aiManager.prompt(prompt)
  } catch (err) {
    throw new VaultError(
      'ai_unavailable',
      `Local AI is not ready: ${(err as Error).message}. ` +
        'The user must enable AI and activate a model in ' +
        'Monomark → Settings → AI Model.'
    )
  }

  return {
    path: args.path,
    summary: summary.trim(),
    truncated,
    original_size: stat.size,
  }
}
