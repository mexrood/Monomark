import crypto from 'crypto'
import { Request, Response, NextFunction } from 'express'
import { store } from '../store'

export function generateToken(): string {
  const token = crypto.randomBytes(32).toString('base64url') // 43 chars, URL-safe
  store.set('mcpToken', token)
  return token
}

export function getOrCreateToken(): string {
  const existing = store.get('mcpToken') as string | undefined
  if (existing) return existing
  return generateToken()
}

/** Express middleware: validates Host header + Bearer token */
export function authMiddleware(port: number) {
  return (req: Request, res: Response, next: NextFunction) => {
    const clientIp = req.ip ?? req.socket.remoteAddress ?? 'unknown'

    // ── DNS rebinding protection ──────────────────────────────────────────
    const host = req.headers.host ?? ''
    const allowed = [`127.0.0.1:${port}`, `localhost:${port}`]
    if (!allowed.includes(host)) {
      console.warn(`[mcp] rejected request from ${clientIp}: invalid_host="${host}"`)
      res.status(403).json({ error: 'invalid_host' })
      return
    }

    // ── Bearer token ──────────────────────────────────────────────────────
    const authHeader = req.headers.authorization ?? ''
    if (!authHeader.startsWith('Bearer ')) {
      console.warn(`[mcp] rejected request from ${clientIp}: missing_token`)
      res.status(401).json({ error: 'missing_token' })
      return
    }

    const provided = authHeader.slice(7)
    const expected = store.get('mcpToken') as string | undefined

    if (!expected || !timingSafeCompare(provided, expected)) {
      const prefix = provided.slice(0, 6)
      console.warn(`[mcp] rejected request from ${clientIp}: invalid_token prefix="${prefix}…"`)
      res.status(401).json({ error: 'invalid_token' })
      return
    }

    const prefix = provided.slice(0, 6)
    console.log(`[mcp] request from ${clientIp} auth="${prefix}…" ${req.method} ${req.path}`)
    next()
  }
}

/** Timing-safe string comparison (pads to equal length with random byte to avoid length leak) */
function timingSafeCompare(a: string, b: string): boolean {
  // Use the longer length so both buffers are the same size
  const len = Math.max(a.length, b.length)
  const bufA = Buffer.alloc(len)
  const bufB = Buffer.alloc(len)
  bufA.write(a)
  bufB.write(b)
  return crypto.timingSafeEqual(bufA, bufB)
}
