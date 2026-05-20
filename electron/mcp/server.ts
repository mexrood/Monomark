import { Server as McpServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { createMcpExpressApp } from '@modelcontextprotocol/sdk/server/express.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import http from 'http'
import { app } from 'electron'
import { store } from '../store'
import { getOrCreateToken, authMiddleware } from './auth'
import { tools } from './tools/index'
import { buildIndex } from './search-index'
import { EventEmitter } from 'events'

const PORT_START = 7456
const PORT_END = 7480

export type McpState = 'disabled' | 'starting' | 'running' | 'error'

interface McpStatus {
  state: McpState
  port: number | null
  error: string | null
}

class McpServerManager extends EventEmitter {
  private httpServer: http.Server | null = null
  private status: McpStatus = { state: 'disabled', port: null, error: null }

  getStatus(): McpStatus {
    return { ...this.status }
  }

  getToken(): string | null {
    return (store.get('mcpToken') as string | undefined) ?? null
  }

  private setStatus(s: Partial<McpStatus>) {
    this.status = { ...this.status, ...s }
    this.emit('status', this.getStatus())
  }

  async start(): Promise<{ port: number; token: string }> {
    if (this.status.state === 'running') {
      return { port: this.status.port!, token: this.getToken()! }
    }

    this.setStatus({ state: 'starting', error: null })

    const vaultPath = store.get('vaultPath') as string | undefined
    if (vaultPath) {
      buildIndex(vaultPath).catch(e =>
        console.error('[mcp] Failed to build search index:', e)
      )
    }

    const token = getOrCreateToken()
    const port = await this.findPort()

    if (!port) {
      const msg = `All ports between ${PORT_START} and ${PORT_END} are in use.`
      this.setStatus({ state: 'error', error: msg })
      throw new Error(msg)
    }

    // ── MCP server factory — new instance per request (stateless) ────────
    const version = app.getVersion()

    function createMcpServer() {
      const server = new McpServer(
        { name: 'marrow', version },
        {
          capabilities: { tools: {} },
          // Token-efficiency policy surfaced to every connected client. Good
          // MCP hosts (Claude Desktop, Claude Code) merge this into the
          // conversation's system context so the model picks the cheap tool
          // automatically without the user spelling it out.
          instructions:
            'When working with the Monomark vault, prioritize token efficiency:\n\n' +
            '1. To EDIT an existing markdown file → use vault_patch, not vault_write. ' +
            'Each operation costs ~30 tokens; re-emitting a full file costs thousands. ' +
            'Block IDs (the `<!-- bid: ... -->` markers Monomark embeds) are stable ' +
            'anchors — find them with vault_search_blocks or vault_get_block.\n\n' +
            '2. To QUERY information spanning many files → use vault_smart_context. ' +
            'It returns ~250 distilled tokens instead of raw files (often 50K+).\n\n' +
            '3. To READ a specific known file in full → use vault_read (only when you ' +
            'need the exact content, e.g. for executing a precise spec).\n\n' +
            '4. To CREATE a brand-new file or fully replace >70% of an existing file → ' +
            'use vault_write. Never use it to edit an existing file when a vault_patch ' +
            'could express the change.\n\n' +
            '5. vault_summarize_file returns a one-paragraph summary — for "what is this ' +
            'document about" rather than its raw content.\n\n' +
            'Default to the cheapest tool that solves the task. Ask the user only when ' +
            'their intent is genuinely ambiguous.',
        },
      )

      server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: tools.map(t => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      }))

      server.setRequestHandler(CallToolRequestSchema, async (req) => {
        const tool = tools.find(t => t.name === req.params.name)
        if (!tool) {
          return {
            isError: true,
            content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }],
          }
        }
        const args = (req.params.arguments ?? {}) as Record<string, unknown>
        const result = await tool.handler(args)
        if (result && typeof result === 'object' && (result as { isError?: boolean }).isError) {
          return result as object
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        }
      })

      return server
    }

    // ── Express app ───────────────────────────────────────────────────────
    const expressApp = createMcpExpressApp({ host: '127.0.0.1' })

    // CORS — needed for Claude Desktop's webview renderer
    expressApp.use((_req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*')
      res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type')
      res.header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
      if (_req.method === 'OPTIONS') return res.sendStatus(204)
      next()
    })

    // Health endpoint (no auth)
    expressApp.get('/health', (_req, res) => {
      res.json({ status: 'ok', version, uptime: process.uptime() })
    })

    // Bearer token auth for all MCP routes
    expressApp.use('/mcp', authMiddleware(port))

    // Fresh server + transport per request (stateless)
    expressApp.post('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      const server = createMcpServer()
      await server.connect(transport)
      await transport.handleRequest(req, res, req.body)
    })

    expressApp.get('/mcp', async (req, res) => {
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
      })
      const server = createMcpServer()
      await server.connect(transport)
      await transport.handleRequest(req, res)
    })

    expressApp.delete('/mcp', async (_req, res) => {
      res.status(405).json({ error: 'method_not_allowed' })
    })

    // ── Start HTTP server ─────────────────────────────────────────────────
    await new Promise<void>((resolve, reject) => {
      this.httpServer = http.createServer(expressApp)
      this.httpServer.listen(port, '127.0.0.1', () => resolve())
      this.httpServer.on('error', reject)
    })

    store.set('mcpPort', port)
    this.setStatus({ state: 'running', port })
    console.log(`[mcp] Server running on http://127.0.0.1:${port}`)

    return { port, token }
  }

  async stop(): Promise<void> {
    if (!this.httpServer) return
    await new Promise<void>((resolve) => {
      this.httpServer!.close(() => resolve())
    })
    this.httpServer = null
    this.setStatus({ state: 'disabled', port: null, error: null })
    console.log('[mcp] Server stopped')
  }

  async regenerateToken(): Promise<string> {
    const { generateToken } = await import('./auth')
    return generateToken()
  }

  private async findPort(): Promise<number | null> {
    for (let port = PORT_START; port <= PORT_END; port++) {
      const available = await this.isPortFree(port)
      if (available) return port
    }
    return null
  }

  private isPortFree(port: number): Promise<boolean> {
    return new Promise(resolve => {
      const server = http.createServer()
      server.listen(port, '127.0.0.1', () => {
        server.close(() => resolve(true))
      })
      server.on('error', () => resolve(false))
    })
  }
}

export const mcpServerManager = new McpServerManager()
