import { EventEmitter } from 'events'
import crypto from 'crypto'

export interface McpCall {
  id: string
  timestamp: number
  tool: string
  args: Record<string, unknown>
  result: 'ok' | 'error'
  errorCode?: string
  durationMs: number
}

const MAX_CONTENT_BYTES = 200

/** Redact large content fields so we don't store full file bodies in the log */
function redactArgs(args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(args)) {
    if (typeof v === 'string' && v.length > MAX_CONTENT_BYTES) {
      out[k] = `<${v.length} bytes>`
    } else {
      out[k] = v
    }
  }
  return out
}

class AuditLog extends EventEmitter {
  private buffer: McpCall[] = []
  private readonly maxSize = 200

  record(call: McpCall) {
    this.buffer.push(call)
    if (this.buffer.length > this.maxSize) this.buffer.shift()
    this.emit('call', call)
  }

  getRecent(limit = 50): McpCall[] {
    return this.buffer.slice(-limit).reverse()
  }

  clear() {
    this.buffer = []
  }
}

export const auditLog = new AuditLog()

/** Wrap a tool handler with audit recording */
export async function withAudit<T>(
  tool: string,
  args: Record<string, unknown>,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now()
  const id = crypto.randomUUID()
  try {
    const result = await fn()
    auditLog.record({
      id,
      timestamp: start,
      tool,
      args: redactArgs(args),
      result: 'ok',
      durationMs: Date.now() - start,
    })
    return result
  } catch (err: unknown) {
    const e = err as { code?: string }
    auditLog.record({
      id,
      timestamp: start,
      tool,
      args: redactArgs(args),
      result: 'error',
      errorCode: e.code ?? 'unknown',
      durationMs: Date.now() - start,
    })
    throw err
  }
}
