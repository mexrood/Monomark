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
        { capabilities: { tools: {} } }
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
