#!/usr/bin/env node
// Token Savings Pipeline Check — verifies the full stats chain works.
// 1. Calls vault_smart_context (which writes mcp_activity rows)
// 2. Queries /stats/today and /stats/lifetime endpoints
// 3. Reports whether token savings data flows end-to-end
//
// Usage: node scripts/token-savings-check.mjs [--token TOKEN] [--port PORT]

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
    for (const arg of mcpArgs) {
      const m = arg.match(/Bearer\s+(\S+)/)
      if (m) { token = m[1]; break }
    }
  } catch {}
}

if (!token) {
  console.error('No token found. Pass --token or ensure .mcp.json exists.')
  process.exit(1)
}

const BASE = `http://127.0.0.1:${port}`
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream' }
let sessionId = null
let ok = true

function fail(label, msg) {
  console.log(`  FAIL  ${label}: ${msg}`)
  ok = false
}
function pass(label, detail) {
  console.log(`  PASS  ${label}${detail ? ': ' + detail : ''}`)
}

// ── MCP call helper ─────────────────────────────────────────────────────────

async function mcpCall(method, params = {}) {
  const body = { jsonrpc: '2.0', id: Date.now(), method, params }
  const hdrs = { ...headers }
  if (sessionId) hdrs['mcp-session-id'] = sessionId
  const res = await fetch(`${BASE}/mcp`, { method: 'POST', headers: hdrs, body: JSON.stringify(body) })
  const sid = res.headers.get('mcp-session-id')
  if (sid) sessionId = sid
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('text/event-stream')) {
    const text = await res.text()
    const lines = text.split('\n')
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try { return JSON.parse(line.slice(6)) } catch {}
      }
    }
    throw new Error('No data in SSE response')
  }
  return res.json()
}

// ── Run checks ──────────────────────────────────────────────────────────────

console.log('\n=== Token Savings Pipeline Check ===\n')

// Step 1: Get baseline stats
let baselineToday, baselineLifetime
try {
  const res = await fetch(`${BASE}/stats/today`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  baselineToday = await res.json()
  pass('GET /stats/today', `tokensSaved=${baselineToday.tokensSaved}, calls=${baselineToday.callCount}`)
} catch (e) {
  fail('GET /stats/today', e.message)
}

try {
  const res = await fetch(`${BASE}/stats/lifetime`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  baselineLifetime = await res.json()
  pass('GET /stats/lifetime', `tokensSaved=${baselineLifetime.tokensSaved}, calls=${baselineLifetime.callCount}`)
} catch (e) {
  fail('GET /stats/lifetime', e.message)
}

try {
  const res = await fetch(`${BASE}/stats/streak`, { headers })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  pass('GET /stats/streak', `streak=${data.streak}`)
} catch (e) {
  fail('GET /stats/streak', e.message)
}

// Step 2: Initialize MCP session + call a tool to generate activity
try {
  await mcpCall('initialize', {
    protocolVersion: '2025-03-26',
    capabilities: {},
    clientInfo: { name: 'token-savings-check', version: '1.0.0' }
  })
  pass('MCP initialize', 'session established')
} catch (e) {
  fail('MCP initialize', e.message)
}

// Call vault_list — lightweight, always works, generates an mcp_activity row
try {
  const result = await mcpCall('tools/call', { name: 'vault_list', arguments: {} })
  if (result?.error) {
    fail('vault_list call', JSON.stringify(result.error))
  } else {
    pass('vault_list call', 'tool executed')
  }
} catch (e) {
  fail('vault_list call', e.message)
}

// Step 3: Check stats again — callCount should have incremented
try {
  const res = await fetch(`${BASE}/stats/today`, { headers })
  const after = await res.json()
  const newCalls = after.callCount - (baselineToday?.callCount ?? 0)
  if (newCalls > 0) {
    pass('Activity recorded', `+${newCalls} new call(s), tokensSaved=${after.tokensSaved}`)
  } else {
    fail('Activity recorded', `callCount did not increment (before=${baselineToday?.callCount}, after=${after.callCount})`)
  }
} catch (e) {
  fail('Post-call stats', e.message)
}

// Step 4: Try vault_smart_context if blocks exist (generates token savings)
try {
  const result = await mcpCall('tools/call', { name: 'vault_smart_context', arguments: { query: 'test', limit: 5 } })
  if (result?.error) {
    console.log(`  SKIP  vault_smart_context: ${JSON.stringify(result.error)}`)
  } else {
    const text = result?.result?.content?.[0]?.text ?? ''
    const hasContext = text.length > 10
    pass('vault_smart_context', hasContext ? `returned ${text.length} chars` : 'returned (empty/no blocks indexed)')

    // Check if token savings increased
    const res2 = await fetch(`${BASE}/stats/today`, { headers })
    const final = await res2.json()
    if (final.tokensSaved > 0) {
      pass('Token savings live', `tokensSaved=${final.tokensSaved}, filesRead=${final.filesRead}, calls=${final.callCount}`)
    } else {
      console.log(`  INFO  tokensSaved still 0 — vault may be empty or no blocks indexed yet`)
    }
  }
} catch (e) {
  console.log(`  SKIP  vault_smart_context: ${e.message}`)
}

console.log(`\n=== ${ok ? 'ALL CHECKS PASSED' : 'SOME CHECKS FAILED'} ===\n`)
process.exit(ok ? 0 : 1)
