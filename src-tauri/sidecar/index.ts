// Monomark sidecar — standalone MCP server + embeddings API.
// Spawned by Tauri as a child process. Communicates via HTTP on 127.0.0.1.

// Shims are loaded first via esbuild aliases:
//   `electron`       → ./electron-shim.ts
//   `electron-store`  → ./store-shim.ts
//   electron/store.ts → ./store-shim.ts (via plugin)

import http from 'http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { tools } from '../../electron/mcp/tools/index'

const PORT = parseInt(process.env.MONOMARK_PORT || '7456', 10)
const TOKEN = process.env.MONOMARK_MCP_TOKEN || ''
const VAULT_PATH = process.env.MONOMARK_VAULT_PATH || ''

if (!TOKEN) {
  console.error('[sidecar] MONOMARK_MCP_TOKEN is required')
  process.exit(1)
}

// ── Tool registry ───────────────────────────────────────────────────────────

const toolMap: Record<string, (typeof tools)[number]> = {}
for (const tool of tools) {
  toolMap[tool.name] = tool
}

/** Wire up MCP handlers on a fresh Server instance. */
function createMcpServer(): Server {
  const srv = new Server(
    { name: 'monomark', version: '1.0.0' },
    { capabilities: { tools: {} } }
  )

  srv.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map(t => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }))

  srv.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params
    const tool = toolMap[name]
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
      }
    }
    try {
      const result = await tool.handler(args ?? {})
      // Tool handlers return raw objects — wrap into MCP content format
      if (result && typeof result === 'object' && 'content' in (result as any) && Array.isArray((result as any).content)) {
        return result // Already in MCP format (e.g. error responses)
      }
      const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2)
      return { content: [{ type: 'text' as const, text }] }
    } catch (err: any) {
      return {
        isError: true,
        content: [{ type: 'text' as const, text: err?.message ?? String(err) }],
      }
    }
  })

  return srv
}

// ── HTTP Server with auth ───────────────────────────────────────────────────

// Each MCP session gets its own Server + Transport pair
const sessions = new Map<string, { server: Server; transport: StreamableHTTPServerTransport }>()

const httpServer = http.createServer(async (req, res) => {
  // Health check — no auth required
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ status: 'ok', vault: VAULT_PATH }))
    return
  }

  // Only handle /mcp endpoint
  if (req.url !== '/mcp') {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'not_found' }))
    return
  }

  // Auth: Host header (DNS rebinding protection)
  const host = req.headers.host ?? ''
  const allowed = [`127.0.0.1:${PORT}`, `localhost:${PORT}`]
  if (!allowed.includes(host)) {
    res.writeHead(403, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'invalid_host' }))
    return
  }

  // Auth: Bearer token
  const authHeader = req.headers.authorization ?? ''
  if (!authHeader.startsWith('Bearer ') || authHeader.slice(7) !== TOKEN) {
    res.writeHead(401, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: 'invalid_token' }))
    return
  }

  // Existing session → reuse transport
  const sessionId = req.headers['mcp-session-id'] as string | undefined
  if (sessionId && sessions.has(sessionId)) {
    const { transport } = sessions.get(sessionId)!
    await transport.handleRequest(req, res)
    return
  }

  // New session (POST only)
  if (req.method === 'POST') {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => `mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    })

    const srv = createMcpServer()

    transport.onclose = () => {
      const sid = (transport as any).sessionId
      if (sid) sessions.delete(sid)
    }

    await srv.connect(transport)

    // Store AFTER connect but BEFORE handleRequest, so the session can be reused
    const sid = (transport as any).sessionId
    if (sid) sessions.set(sid, { server: srv, transport })

    await transport.handleRequest(req, res)

    // If sessionId wasn't available before handleRequest, store now
    const sidAfter = (transport as any).sessionId
    if (sidAfter && !sessions.has(sidAfter)) {
      sessions.set(sidAfter, { server: srv, transport })
    }
    return
  }

  res.writeHead(405, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ error: 'method_not_allowed' }))
})

httpServer.listen(PORT, '127.0.0.1', () => {
  console.log(`[sidecar] MCP server running on http://127.0.0.1:${PORT}/mcp`)
  console.log(`[sidecar] vault: ${VAULT_PATH}`)
})

// ── Graceful shutdown ───────────────────────────────────────────────────────

const shutdown = () => {
  console.log('[sidecar] shutting down...')
  for (const [, { transport }] of sessions) {
    transport.close?.()
  }
  httpServer.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 3000)
}
process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
