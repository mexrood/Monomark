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

  CREATE TABLE IF NOT EXISTS file_summaries (
    file TEXT PRIMARY KEY,
    summary TEXT NOT NULL,
    hash TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS relations (
    block_id_from TEXT NOT NULL,
    block_id_to   TEXT NOT NULL,
    hash_from     TEXT NOT NULL,
    hash_to       TEXT NOT NULL,
    similarity    REAL NOT NULL,
    useful        INTEGER NOT NULL,
    label         TEXT,
    created_at    INTEGER NOT NULL,
    PRIMARY KEY (block_id_from, block_id_to)
  );
  CREATE INDEX IF NOT EXISTS idx_relations_from
    ON relations(block_id_from)
    WHERE useful = 1;

  CREATE TABLE IF NOT EXISTS mcp_activity (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tool_name       TEXT NOT NULL,
    file_path       TEXT,
    tokens_read     INTEGER NOT NULL,
    tokens_returned INTEGER NOT NULL,
    tokens_saved    INTEGER NOT NULL,
    distilled       INTEGER NOT NULL,
    created_at      INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_mcp_activity_created ON mcp_activity(created_at);
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

// ── file_summaries (Phase D) ─────────────────────────────────────────────────

/** The stored summary for a file, or undefined if none / DB not ready. */
export function getFileSummary(file: string): { summary: string; hash: string } | undefined {
  if (!rawDb) return undefined
  return getDb()
    .prepare('SELECT summary, hash FROM file_summaries WHERE file = ?')
    .get(file) as { summary: string; hash: string } | undefined
}

/** Insert or replace a file's one-line summary. */
export function upsertFileSummary(file: string, summary: string, hash: string): void {
  if (!rawDb) return
  getDb()
    .prepare(
      `INSERT INTO file_summaries (file, summary, hash, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(file) DO UPDATE SET
         summary = excluded.summary, hash = excluded.hash, updated_at = excluded.updated_at`,
    )
    .run(file, summary, hash, Date.now())
  schedulePersist()
}

// ── mcp_activity (Token economy) ────────────────────────────────────────────

export interface McpActivityRow {
  tool_name: string
  file_path: string | null
  tokens_read: number
  tokens_returned: number
  tokens_saved: number
  distilled: number
  created_at: number
}

export function insertMcpActivity(row: McpActivityRow): void {
  if (!rawDb) return
  getDb()
    .prepare(
      `INSERT INTO mcp_activity (tool_name, file_path, tokens_read, tokens_returned, tokens_saved, distilled, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      row.tool_name,
      row.file_path,
      row.tokens_read,
      row.tokens_returned,
      row.tokens_saved,
      row.distilled,
      row.created_at
    )
  schedulePersist()
}

export interface McpStats {
  tokensSaved: number
  filesRead: number
  callCount: number
}

export function getMcpStatsSince(sinceMs: number): McpStats {
  if (!rawDb) return { tokensSaved: 0, filesRead: 0, callCount: 0 }
  const row = getDb()
    .prepare(
      `SELECT COALESCE(SUM(tokens_saved), 0) AS saved,
              COUNT(DISTINCT file_path) AS files,
              COUNT(*) AS calls
       FROM mcp_activity WHERE created_at >= ?`
    )
    .get(sinceMs) as { saved: number; files: number; calls: number } | undefined
  return {
    tokensSaved: row?.saved ?? 0,
    filesRead: row?.files ?? 0,
    callCount: row?.calls ?? 0,
  }
}

export function getMcpStatsLifetime(): McpStats {
  return getMcpStatsSince(0)
}

export function getMcpStreak(): number {
  if (!rawDb) return 0
  const rows = getDb()
    .prepare(
      `SELECT DISTINCT CAST(created_at / 86400000 AS INTEGER) AS day
       FROM mcp_activity ORDER BY day DESC`
    )
    .all() as { day: number }[]
  if (rows.length === 0) return 0
  const today = Math.floor(Date.now() / 86400000)
  if (rows[0].day !== today && rows[0].day !== today - 1) return 0
  let streak = 1
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].day - rows[i].day === 1) streak++
    else break
  }
  return streak
}

export function deleteFileSummary(file: string): void {
  if (!rawDb) return
  getDb().prepare('DELETE FROM file_summaries WHERE file = ?').run(file)
  schedulePersist()
}

/** All summaries, as a vault-relative-path → summary map. */
export function getAllFileSummaries(): Record<string, string> {
  if (!rawDb) return {}
  const rows = getDb()
    .prepare('SELECT file, summary FROM file_summaries')
    .all() as { file: string; summary: string }[]
  const out: Record<string, string> = {}
  for (const row of rows) out[row.file] = row.summary
  return out
}
