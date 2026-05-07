import React, { useEffect, useState } from 'react'
import { Copy, RefreshCw, Eye, EyeOff, CheckCircle, XCircle, Loader } from 'lucide-react'
import styles from './McpPanel.module.css'
import { useAppStore } from '../../store/useAppStore'
import { useDialogStore } from '../../store/useDialogStore'
import { Switch } from '../ui/Switch'

export const McpPanel: React.FC = () => {
  const mcpStatus = useAppStore(s => s.mcpStatus)
  const setMcpStatus = useAppStore(s => s.setMcpStatus)
  const toggleMcp = useAppStore(s => s.toggleMcp)

  const [busy, setBusy] = useState(false)
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([])

  const [installStatus, setInstallStatus] = useState<{ status: string; message?: string } | null>(null)
  const [installBusy, setInstallBusy] = useState(false)
  const [installMsg, setInstallMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [copiedCode, setCopiedCode] = useState(false)

  const [tokenVisible, setTokenVisible] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.marrow.mcp?.getStatus().then(s => { if (s) setMcpStatus(s) })
    window.marrow.mcp?.getAuditLog(20).then(entries => setAuditLog(entries as unknown as AuditEntry[]))
    window.marrow.mcp?.onNewCall?.((call) => {
      setAuditLog(prev => [call as unknown as AuditEntry, ...prev].slice(0, 20))
    })
    return () => {
      window.marrow.mcp?.offNewCall?.()
    }
  }, [])

  useEffect(() => {
    if (mcpStatus.running) {
      ;(window.marrow.mcp as any)?.getInstallStatus?.()
        .then((s: any) => { if (s) setInstallStatus(s) })
    }
  }, [mcpStatus.running, mcpStatus.token, mcpStatus.port])

  const handleToggle = async () => {
    if (busy) return
    setBusy(true)
    try {
      await toggleMcp()
    } finally {
      setBusy(false)
    }
  }

  const handleInstall = async () => {
    if (installBusy) return
    setInstallBusy(true)
    setInstallMsg(null)
    try {
      const result = await (window.marrow.mcp as any)?.installToClaudeDesktop?.()
      if (result?.ok) {
        setInstallMsg({ ok: true, text: 'Added to Claude Desktop config. Restart Claude Desktop to apply.' })
        const s = await (window.marrow.mcp as any)?.getInstallStatus?.()
        if (s) setInstallStatus(s)
      } else {
        setInstallMsg({ ok: false, text: result?.error || 'Installation failed.' })
      }
    } finally {
      setInstallBusy(false)
    }
  }

  const handleCopyCode = async () => {
    const cmd = await (window.marrow.mcp as any)?.getClaudeCodeCommand?.()
    if (cmd) {
      await window.marrow.util?.copyToClipboard(cmd)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 1500)
    }
  }

  const handleRegenerate = async () => {
    const confirmed = await useDialogStore.getState().confirm({
      title: 'Regenerate token?',
      message: 'This will disconnect Claude Desktop and Claude Code. You\'ll need to update their configs with the new token.',
      confirmLabel: 'Regenerate',
      cancelLabel: 'Cancel',
      danger: false,
    })
    if (!confirmed) return
    const token = await window.marrow.mcp?.regenerateToken()
    if (token) setMcpStatus({ ...mcpStatus, token })
  }

  const handleCopySnippet = async () => {
    if (!mcpStatus.token || !mcpStatus.port) return
    const snippet = buildSnippet(mcpStatus.port, mcpStatus.token)
    await window.marrow.util?.copyToClipboard(snippet)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const maskedToken = mcpStatus.token
    ? tokenVisible
      ? mcpStatus.token
      : `${mcpStatus.token.slice(0, 6)}…${mcpStatus.token.slice(-4)}`
    : null

  const installLabel =
    installStatus?.status === 'outdated' ? 'Update Claude Desktop config' : 'Install for Claude Desktop'

  return (
    <div className={styles.root}>
      {/* ── Enable toggle ── */}
      <div className={styles.toggleRow}>
        <div className={styles.toggleLabel}>
          <StatusDot state={mcpStatus.state} />
          <span>Enable MCP server for Claude</span>
        </div>
        {busy
          ? <Loader size={14} className={styles.spin} />
          : <Switch checked={mcpStatus.running} onChange={() => handleToggle()} />
        }
      </div>

      {/* Running badge */}
      {mcpStatus.running && mcpStatus.port && (
        <div className={styles.runningBadge}>
          <CheckCircle size={13} />
          <span>Running on http://127.0.0.1:{mcpStatus.port}</span>
        </div>
      )}

      {/* Error state */}
      {mcpStatus.state === 'error' && mcpStatus.error && (
        <div className={styles.errorBox}>
          <XCircle size={14} />
          <span>{mcpStatus.error}</span>
        </div>
      )}

      {/* Disabled description */}
      {!mcpStatus.running && mcpStatus.state !== 'error' && (
        <p className={styles.description}>
          When enabled, Monomark exposes a local server that lets Claude Desktop
          and Claude Code CLI read and write your vault. Nothing leaves your machine.
        </p>
      )}

      {/* ── Action buttons (only when running) ── */}
      {mcpStatus.running && mcpStatus.port && mcpStatus.token && (
        <>
          <div className={styles.divider} />

          {/* Install for Claude Desktop */}
          <div className={styles.actionGroup}>
            <button
              className={`${styles.actionPrimaryBtn} ${installStatus?.status === 'outdated' ? styles.btnWarning : ''}`}
              onClick={handleInstall}
              disabled={installBusy}
            >
              {installBusy && <Loader size={13} className={styles.spin} />}
              <span>{installLabel}</span>
              {installStatus && (
                <span className={`${styles.badge} ${
                  installStatus.status === 'configured' ? styles.badgeGreen :
                  installStatus.status === 'outdated' ? styles.badgeAmber :
                  styles.badgeNeutral
                }`}>
                  {installStatus.status === 'configured' ? 'Configured ✓' :
                   installStatus.status === 'outdated' ? 'Update available' :
                   'Not configured'}
                </span>
              )}
            </button>

            {installMsg && (
              <div className={`${styles.installMsg} ${installMsg.ok ? styles.installMsgOk : styles.installMsgErr}`}>
                {installMsg.ok ? <CheckCircle size={13} /> : <XCircle size={13} />}
                <span>{installMsg.text}</span>
              </div>
            )}

            <button className={styles.actionSecondaryBtn} onClick={handleCopyCode}>
              {copiedCode
                ? <><CheckCircle size={13} /><span>Copied ✓</span></>
                : <><Copy size={13} /><span>Copy command for Claude Code</span></>
              }
            </button>
          </div>

          <div className={styles.divider} />

          {/* ── Advanced / Manual setup ── */}
          <details className={styles.advanced}>
            <summary className={styles.advancedSummary}>Advanced / Manual setup</summary>
            <div className={styles.advancedContent}>
              <div className={styles.snippetBox}>
                <div className={styles.snippetHeader}>
                  <span className={styles.snippetTitle}>Configuration snippet</span>
                  <span className={styles.snippetSub}>
                    Paste this into your Claude config file under <code>mcpServers</code>:
                  </span>
                </div>
                <pre className={styles.snippet}>
                  {buildSnippet(mcpStatus.port, maskedToken ?? mcpStatus.token)}
                </pre>
                <div className={styles.snippetActions}>
                  <button className={styles.actionBtn} onClick={handleCopySnippet} tabIndex={-1}>
                    {copied
                      ? <><CheckCircle size={12} /><span>Copied!</span></>
                      : <><Copy size={12} /><span>Copy</span></>
                    }
                  </button>
                  <button
                    className={styles.actionBtn}
                    onClick={() => setTokenVisible(v => !v)}
                    tabIndex={-1}
                  >
                    {tokenVisible
                      ? <><EyeOff size={12} /><span>Hide token</span></>
                      : <><Eye size={12} /><span>Show full token</span></>
                    }
                  </button>
                </div>
              </div>

              <div className={styles.helpText}>
                <strong>Requires Node.js</strong> — <a
                  href="https://nodejs.org"
                  target="_blank"
                  rel="noreferrer"
                  className={styles.link}
                >nodejs.org</a> (LTS). Both Claude Desktop and Claude Code use{' '}
                <code>npx mcp-remote</code> to connect.
                <br /><br />

                <strong>Claude Desktop</strong>
                <br />
                Open <em>Settings → Developer → Edit Config</em> and paste the snippet into{' '}
                <code>mcpServers</code>. Fully quit and restart Claude Desktop.
                In a new chat the tools button should show <strong>monomark</strong> with 5 tools.
                <br />
                Config file:{' '}
                <code>%APPDATA%\Claude\claude_desktop_config.json</code> (Windows) /{' '}
                <code>~/Library/Application Support/Claude/claude_desktop_config.json</code> (macOS)
                <br /><br />

                <strong>Claude Code CLI</strong>
                <br />
                Copy the snippet, then in your project root create (or edit){' '}
                <code>.mcp.json</code> and paste it there. Run <code>claude</code> from that folder.
                To skip the confirmation prompt on first run, add{' '}
                <code>"enabledMcpjsonServers": ["monomark"]</code> to{' '}
                <code>.claude/settings.local.json</code>.
                <br /><br />

                <strong>Troubleshooting:</strong> check logs at{' '}
                <code>%APPDATA%\Claude\logs\mcp-server-monomark.log</code> (Windows) or{' '}
                <code>~/Library/Logs/Claude/mcp-server-monomark.log</code> (macOS).
              </div>

              <button className={styles.regenBtn} onClick={handleRegenerate} tabIndex={-1}>
                <RefreshCw size={12} />
                <span>Regenerate Token</span>
              </button>
            </div>
          </details>

          <div className={styles.divider} />
        </>
      )}

      {/* ── Audit log ── */}
      <div className={styles.auditSection}>
        <div className={styles.auditTitle}>Recent activity</div>
        {auditLog.length === 0 ? (
          <p className={styles.auditEmpty}>No calls yet.</p>
        ) : (
          <div className={styles.auditList}>
            {auditLog.map(entry => (
              <AuditRow key={entry.id} entry={entry} />
            ))}
          </div>
        )}
        <p className={styles.auditHint}>Showing last 20 calls. Cleared on app restart.</p>
      </div>
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface AuditEntry {
  id: string
  timestamp: number
  tool: string
  args: Record<string, unknown>
  result: 'ok' | 'error'
  errorCode?: string
  durationMs: number
}

const AuditRow: React.FC<{ entry: AuditEntry }> = ({ entry }) => {
  const time = new Date(entry.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const argSummary = Object.entries(entry.args)
    .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
    .join(' ')
    .slice(0, 40)

  return (
    <div className={`${styles.auditRow} ${entry.result === 'error' ? styles.auditError : ''}`}>
      <span className={styles.auditTime}>{time}</span>
      <span className={styles.auditTool}>{entry.tool}</span>
      <span className={styles.auditArgs}>{argSummary}</span>
      <span className={styles.auditResult}>{entry.result === 'ok' ? '✓' : '✕'}</span>
    </div>
  )
}

const StatusDot: React.FC<{ state: string }> = ({ state }) => (
  <span
    className={`${styles.dot} ${
      state === 'running' ? styles.dotGreen
      : state === 'error' ? styles.dotRed
      : state === 'starting' ? styles.dotYellow
      : styles.dotGray
    }`}
  />
)

function buildSnippet(port: number, token: string | null): string {
  return JSON.stringify(
    {
      mcpServers: {
        monomark: {
          command: 'npx',
          args: [
            '-y',
            'mcp-remote@latest',
            `http://127.0.0.1:${port}/mcp`,
            '--allow-http',
            '--header',
            `Authorization: Bearer ${token ?? '(token)'}`,
          ],
        },
      },
    },
    null,
    2
  )
}
