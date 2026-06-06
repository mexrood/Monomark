import { app } from 'electron'
import * as fs from 'fs/promises'
import * as path from 'path'

function getClaudeDesktopConfigPath(): string {
  const platform = process.platform
  if (platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json')
  } else if (platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'Claude', 'claude_desktop_config.json')
  } else {
    return path.join(app.getPath('home'), '.config', 'Claude', 'claude_desktop_config.json')
  }
}

export interface McpInstallStatus {
  status: 'not_configured' | 'configured' | 'outdated' | 'error'
  message?: string
}

export async function getClaudeDesktopInstallStatus(
  expectedUrl: string,
  expectedToken: string
): Promise<McpInstallStatus> {
  const configPath = getClaudeDesktopConfigPath()
  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    const cfg = JSON.parse(raw)
    const marrow = cfg?.mcpServers?.monomark
    if (!marrow) return { status: 'not_configured' }

    const args = marrow.args || []
    const hasUrl = args.some((a: string) => a.includes(expectedUrl))
    const hasToken = args.some((a: string) => a.includes(expectedToken))
    if (hasUrl && hasToken) return { status: 'configured' }
    return { status: 'outdated' }
  } catch (e: any) {
    if (e.code === 'ENOENT') return { status: 'not_configured' }
    return { status: 'error', message: e.message }
  }
}

export async function installToClaudeDesktop(
  url: string,
  token: string
): Promise<{ ok: boolean; error?: string }> {
  const configPath = getClaudeDesktopConfigPath()
  let cfg: any = {}

  try {
    const raw = await fs.readFile(configPath, 'utf-8')
    cfg = JSON.parse(raw)
  } catch (e: any) {
    if (e.code !== 'ENOENT') return { ok: false, error: e.message }
    try {
      await fs.mkdir(path.dirname(configPath), { recursive: true })
    } catch {}
  }

  if (!cfg.mcpServers) cfg.mcpServers = {}

  // On Windows, Claude Desktop spawns the command without a shell, which breaks
  // when `npx` resolves to `C:\Program Files\nodejs\npx.cmd` (the space in the
  // path corrupts the argv parsing — cmd.exe sees `C:\Program` as the command).
  // Workaround: use `cmd /c` as a wrapper so PATH-based resolution happens
  // inside cmd, not via direct CreateProcess.
  const isWindows = process.platform === 'win32'
  cfg.mcpServers.monomark = isWindows
    ? {
        command: 'cmd',
        args: [
          '/c',
          'npx',
          '-y',
          'mcp-remote@latest',
          url,
          '--allow-http',
          '--header',
          `Authorization: Bearer ${token}`,
        ],
      }
    : {
        command: 'npx',
        args: [
          '-y',
          'mcp-remote@latest',
          url,
          '--allow-http',
          '--header',
          `Authorization: Bearer ${token}`,
        ],
      }

  try {
    await fs.writeFile(configPath, JSON.stringify(cfg, null, 2), 'utf-8')
    return { ok: true }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

export function buildClaudeCodeCommand(url: string, token: string): string {
  // Use `cmd /c` wrapper on Windows for the same reason as installToClaudeDesktop:
  // direct `npx` invocation breaks when Node is in a path with spaces.
  if (process.platform === 'win32') {
    return `claude mcp add monomark cmd -- /c npx -y mcp-remote@latest ${url} --allow-http --header "Authorization: Bearer ${token}"`
  }
  return `claude mcp add monomark npx -- -y mcp-remote@latest ${url} --allow-http --header "Authorization: Bearer ${token}"`
}
