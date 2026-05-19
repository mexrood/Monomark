import { createHash } from 'crypto'
import { createRequire } from 'node:module'
import * as path from 'path'
import * as fs from 'fs'

// ── SQLite via sql.js (WebAssembly) ──────────────────────────────────────────
// We use the WASM build of SQLite rather than a native addon (better-sqlite3):
// no node-gyp, no electron-rebuild, no per-ABI prebuilds — it runs identically
// on any machine and packages trivially. sql.js is in-memory; the database is
// loaded from / persisted to vault/.monomark/index.db as a file.

/** A query row (loosely typed, like better-sqlite3's own row return). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = any

interface PreparedStatement {
  all(...params: unknown[]): Row[]
  get(...params: unknown[]): Row
  run(...params: unknown[]): { changes: number }
}

/** The better-sqlite3-style subset the indexer relies on. */
export interface IndexDb {
  prepare(sql: string): PreparedStatement
  exec(sql: string): void
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// sql.js runtime objects — typed loosely; the IndexDb adapter is the typed boundary.
let SQL: any = null
let rawDb: any = null
/* eslint-enable @typescript-eslint/no-explicit-any */

let dbFilePath: string | null = null
let persistTimer: ReturnType<typeof setTimeout> | null = null

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    file TEXT NOT NULL,
    line INTEGER NOT NULL,
    block_type TEXT NOT NULL,
    text TEXT NOT NULL,
    embedding BLOB NOT NULL,
    hash TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_blocks_file ON blocks(file);
  CREATE INDEX IF NOT EXISTS idx_blocks_updated ON blocks(updated_at);
  CREATE INDEX IF NOT EXISTS idx_blocks_hash ON blocks(hash);
`

/**
 * Open (or create) the embeddings index DB at vault/.monomark/index.db.
 * Async because the WASM runtime loads on first use.
 */
export async function initDb(vaultPath: string): Promise<void> {
  closeDb()

  const monomarkDir = path.join(vaultPath, '.monomark')
  fs.mkdirSync(monomarkDir, { recursive: true })
  dbFilePath = path.join(monomarkDir, 'index.db')

  if (!SQL) {
    // Load sql.js via a real Node require (not the bundler's) so its emscripten
    // glue stays intact, and hand it the .wasm bytes directly. Passing
    // `wasmBinary` bypasses sql.js's fetch/streaming path entirely — that path
    // is web-only and aborts in Electron's main process.
    const nodeRequire = createRequire(__filename)
    const initSqlJs = nodeRequire('sql.js')
    const sqlJsDir = path.dirname(nodeRequire.resolve('sql.js'))
    const wasmBinary = fs.readFileSync(path.join(sqlJsDir, 'sql-wasm.wasm'))
    SQL = await initSqlJs({ wasmBinary })
  }

  try {
    rawDb = new SQL.Database(fs.readFileSync(dbFilePath))
  } catch {
    rawDb = new SQL.Database() // fresh DB — file missing or unreadable
  }
  rawDb.exec(SCHEMA)
  console.log('[db] index DB ready:', dbFilePath)
}

export function getDb(): IndexDb {
  if (!rawDb) throw new Error('Index DB not initialized')
  const db = rawDb
  return {
    prepare(sql: string): PreparedStatement {
      return {
        all(...params: unknown[]): Row[] {
          const stmt = db.prepare(sql)
          try {
            if (params.length) stmt.bind(params)
            const rows: Row[] = []
            while (stmt.step()) rows.push(stmt.getAsObject())
            return rows
          } finally {
            stmt.free()
          }
        },
        get(...params: unknown[]): Row {
          const stmt = db.prepare(sql)
          try {
            if (params.length) stmt.bind(params)
            return stmt.step() ? stmt.getAsObject() : undefined
          } finally {
            stmt.free()
          }
        },
        run(...params: unknown[]): { changes: number } {
          db.run(sql, params)
          return { changes: db.getRowsModified() }
        },
      }
    },
    exec(sql: string): void {
      db.exec(sql)
    },
  }
}

export function isDbReady(): boolean {
  return rawDb !== null
}

/** Write the in-memory DB to disk now (synchronous). */
export function persistNow(): void {
  if (!rawDb || !dbFilePath) return
  try {
    fs.writeFileSync(dbFilePath, Buffer.from(rawDb.export() as Uint8Array))
  } catch (err) {
    console.error('[db] persist failed:', err)
  }
}

/** Debounced persist — coalesces a burst of writes into one disk flush. */
export function schedulePersist(): void {
  if (persistTimer) clearTimeout(persistTimer)
  persistTimer = setTimeout(() => {
    persistTimer = null
    persistNow()
  }, 1000)
}

export function closeDb(): void {
  if (persistTimer) {
    clearTimeout(persistTimer)
    persistTimer = null
  }
  if (rawDb) {
    persistNow()
    try { rawDb.close() } catch { /* already closed */ }
    rawDb = null
  }
  dbFilePath = null
}

/** Float32Array → raw little-endian bytes for BLOB storage. */
export function serializeEmbedding(emb: Float32Array): Buffer {
  return Buffer.from(emb.buffer, emb.byteOffset, emb.byteLength)
}

/** BLOB bytes → Float32Array view. */
export function deserializeEmbedding(buf: Uint8Array): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4)
}

/** sha256 of a block's text — used to detect changed blocks cheaply. */
export function hashText(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}
