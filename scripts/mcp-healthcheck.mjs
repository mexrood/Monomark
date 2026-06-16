#!/usr/bin/env node
// MCP Healthcheck — probe every link in the MCP chain and report status.
// Usage: node scripts/mcp-healthcheck.mjs [--token TOKEN] [--port PORT]
//
// If no --token is provided, reads from the .mcp.json Bearer header.

import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

// ── Parse args ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
let port = 7456
let token = ''

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) port = parseInt(args[i + 1], 10)
  if (args[i] === '--token' && args[i + 1]) token = args[i + 1]
}

if (!token) {
  try {
    const mcpJson = JSON.parse(readFileSync(resolve(projectRoot, '.mcp.json'), 'utf-8'))
    const mcpArgs = mcpJson?.mcpServers?.monomark?.args ?? []
    const bearerIdx = mcpArgs.indexOf('Bearer')
    if (bearerIdx === -1) {
      const headerIdx = mcpArgs.indexOf('--header')
      if (headerIdx !== -1) {
        const headerVal = mcpArgs[headerIdx + 1] ?? ''
        const match = headerVal.match(/Bearer\s+(\S+)/)
        if (match) token = match[1]
        if (!token) {
          // "Authorization: Bearer TOKEN" split across two args
          token = mcpArgs[headerIdx + 2] ?? ''
        }
      }
    }
    // Fallback: find any hex-looking arg
    if (!token) {
      for (const a of mcpArgs) {
        if (/^[0-9a-f]{64}$/.test(a)) { token = a; break }
      }
    }
  } catch {}
}

const BASE = `http://127.0.0.1:${port}`
const HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json, text/event-stream',
  'Authorization': `Bearer ${token}`,
}

// ── Helpers ─────────────────────────────────────────────────────────────────

const OK = '\x1b[32m✅\x1b[0m'
const FAIL = '\x1b[31m❌\x1b[0m'
const WARN = '\x1b[33m⚠️\x1b[0m'

let sessionId = null
let allPassed = true

async function probe(name, fn) {
  try {
    const result = await fn()
    console.log(`${OK}  ${name}: ${result}`)
    return true
  } catch (err) {
    console.log(`${FAIL}  ${name}: ${err.message}`)
    allPassed = false
    return false
  }
}

async function mcpCall(method, params = {}, id = Math.floor(Math.random() * 10000)) {
  const headers = { ...HEADERS }
  if (sessionId) headers['mcp-session-id'] = sessionId

  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  })

  // Capture session ID from response
  const sid = res.headers.get('mcp-session-id')
  if (sid) sessionId = sid

  const text = await res.text()
  // SSE format: "event: message\ndata: {...}"
  const dataMatch = text.match(/^data:\s*(.+)$/m)
  const json = JSON.parse(dataMatch ? dataMatch[1] : text)

  if (json.error) throw new Error(`${json.error.code}: ${json.error.message}`)
  return json.result
}

// ── Probes ──────────────────────────────────────────────────────────────────

console.log(`\n🔍 MCP Healthcheck — ${BASE}\n`)
console.log(`Token: ${token ? token.slice(0, 8) + '...' : '(none)'}\n`)

// 1. Port reachable
await probe('Port reachable', async () => {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return 'listening'
})

// 2. Health endpoint
let vaultPath = ''
await probe('Health endpoint', async () => {
  const res = await fetch(`${BASE}/health`)
  const data = await res.json()
  vaultPath = data.vault || '(unknown)'
  return `status=${data.status}, vault=${vaultPath}`
})

// 3. Auth works
await probe('Auth (Bearer token)', async () => {
  const res = await fetch(`${BASE}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
  })
  const data = await res.json()
  if (data.error?.message?.includes('invalid_token') || res.status === 401) {
    // Good — auth is enforced
    return 'enforced (401 without token)'
  }
  throw new Error('Auth not enforced — request without token succeeded')
})

// 4. MCP initialize
await probe('MCP initialize', async () => {
  const result = await mcpCall('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'healthcheck', version: '1.0' },
  })
  return `server=${result.serverInfo?.name}@${result.serverInfo?.version}, session=${sessionId?.slice(0, 20)}...`
})

// 5. Tools list
let toolNames = []
await probe('Tools list', async () => {
  const result = await mcpCall('tools/list')
  toolNames = (result.tools || []).map(t => t.name)
  return `${toolNames.length} tools: ${toolNames.join(', ')}`
})

// 6. vault_list
await probe('vault_list', async () => {
  const result = await mcpCall('tools/call', { name: 'vault_list', arguments: { recursive: false } })
  const text = result.content?.[0]?.text
  if (!text) throw new Error('Empty response')
  const parsed = JSON.parse(text)
  return `${parsed.items?.length ?? 0} items in vault root`
})

// 7. vault_read
await probe('vault_read', async () => {
  // First find a file to read
  const listResult = await mcpCall('tools/call', { name: 'vault_list', arguments: { path: 'Tasks', recursive: false } })
  const listText = listResult.content?.[0]?.text
  const list = JSON.parse(listText)
  const file = list.items?.find(i => i.kind === 'file')
  if (!file) throw new Error('No files found in Tasks/')
  const readResult = await mcpCall('tools/call', { name: 'vault_read', arguments: { path: file.path } })
  const readText = readResult.content?.[0]?.text
  const parsed = JSON.parse(readText)
  return `${file.path} → ${parsed.size} bytes`
})

// 8. vault_search
await probe('vault_search', async () => {
  const result = await mcpCall('tools/call', { name: 'vault_search', arguments: { query: 'test', limit: 3 } })
  const text = result.content?.[0]?.text
  const parsed = JSON.parse(text)
  const count = parsed.results?.length ?? parsed.length ?? 0
  return `${count} results for "test"`
})

// 9. vault_search_blocks (semantic)
await probe('vault_search_blocks (semantic)', async () => {
  const result = await mcpCall('tools/call', { name: 'vault_search_blocks', arguments: { query: 'project planning', limit: 3 } })
  const text = result.content?.[0]?.text
  if (text?.includes('not ready')) throw new Error('Memory index not ready — initDb() not called in sidecar')
  const parsed = JSON.parse(text)
  const count = parsed.results?.length ?? parsed.length ?? 0
  return `${count} semantic results`
})

// 10. vault_smart_context
await probe('vault_smart_context', async () => {
  const result = await mcpCall('tools/call', { name: 'vault_smart_context', arguments: { query: 'what projects exist', limit: 5 } })
  const text = result.content?.[0]?.text
  if (text?.includes('not ready') || text?.includes('index_unavailable')) {
    throw new Error('Index unavailable — initDb() not called')
  }
  const parsed = JSON.parse(text)
  return `distilled=${parsed.distilled}, blocks=${parsed.block_count}, sources=${parsed.sources?.length ?? 0}`
})

// ── Summary ─────────────────────────────────────────────────────────────────

console.log('\n' + '─'.repeat(60))
if (allPassed) {
  console.log(`${OK}  All checks passed`)
} else {
  console.log(`${FAIL}  Some checks failed — see above`)
}
console.log()

process.exit(allPassed ? 0 : 1)
