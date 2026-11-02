import { DatabaseSync } from 'node:sqlite'
import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { randomBytes } from 'node:crypto'
import { config } from './config.js'

export const db = new DatabaseSync(join(config.dataDir, 'buybot.db'))
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')

const migrations: string[] = [
  `
  CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    name TEXT NOT NULL DEFAULT '',
    password_hash TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE TABLE prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dni TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    offer_amount REAL,
    rate REAL,
    notes TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending'
      CHECK (status IN ('pending','sending','sent','failed','no_whatsapp','opted_out','on_hold')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    sent_at TEXT,
    replied_at TEXT,
    reply_text TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );
  CREATE INDEX idx_prospects_status ON prospects(status);
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prospect_id INTEGER REFERENCES prospects(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    phone TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('sending','sent','failed','unknown','superseded')),
    error TEXT,
    remote_id TEXT,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    sent_at TEXT
  );
  -- Garantía a nivel de base de datos: nunca dos mensajes activos/enviados para el mismo prospecto.
  CREATE UNIQUE INDEX uq_messages_active ON messages(prospect_id) WHERE status IN ('sending','sent');
  CREATE INDEX idx_messages_sent_at ON messages(sent_at);
  CREATE TABLE audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    entity TEXT NOT NULL,
    entity_id TEXT,
    label TEXT NOT NULL DEFAULT '',
    detail TEXT NOT NULL DEFAULT ''
  );
  CREATE INDEX idx_audit_ts ON audit_log(ts DESC);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `,
]

function migrate() {
  const current = (db.prepare('PRAGMA user_version').get() as { user_version: number }).user_version
  for (let v = current; v < migrations.length; v++) {
    db.exec('BEGIN')
    try {
      db.exec(migrations[v])
      db.exec(`PRAGMA user_version = ${v + 1}`)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}
migrate()

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export const nowIso = () => new Date().toISOString()

// ---- Settings ----
export interface Settings {
  messageTemplate: string
  dailyLimit: number
  delayMin: number
  delayMax: number
  windowStart: string
  windowEnd: string
}

export const DEFAULT_TEMPLATE =
  '{Hola|Buen día} [nombre] 👋\n\nTenemos disponible para ti una opción de compra de deuda por hasta [monto], con una tasa referencial de [tasa].\n\nSi deseas conocer más detalles, puedo ayudarte por este medio.\n\nSi no deseas recibir más mensajes, responde BAJA.'

const defaults: Record<string, string> = {
  messageTemplate: DEFAULT_TEMPLATE,
  dailyLimit: '100',
  delayMin: '25',
  delayMax: '70',
  windowStart: '08:00',
  windowEnd: '20:00',
}

export function getRaw(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}
export function setRaw(key: string, value: string) {
  db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)
}

export function getSettings(): Settings {
  const read = (key: string) => getRaw(key) ?? defaults[key]
  return {
    messageTemplate: read('messageTemplate'),
    dailyLimit: Number(read('dailyLimit')),
    delayMin: Number(read('delayMin')),
    delayMax: Number(read('delayMax')),
    windowStart: read('windowStart'),
    windowEnd: read('windowEnd'),
  }
}

export function webhookSecret(): string {
  let secret = getRaw('webhookSecret')
  if (!secret) {
    secret = randomBytes(24).toString('hex')
    setRaw('webhookSecret', secret)
  }
  return secret
}

// ---- Audit ----
export function audit(actor: string, action: string, entity: string, entityId: string | number | null, label: string, detail: unknown = '') {
  db.prepare('INSERT INTO audit_log(actor,action,entity,entity_id,label,detail) VALUES(?,?,?,?,?,?)').run(
    actor, action, entity, entityId === null ? null : String(entityId), label, typeof detail === 'string' ? detail : JSON.stringify(detail),
  )
}

// ---- Backups ----
export function backupTo(file: string) {
  if (existsSync(file)) rmSync(file)
  db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`)
}

export function autoBackup() {
  const dir = join(config.dataDir, 'backups')
  mkdirSync(dir, { recursive: true })
  const day = new Date().toISOString().slice(0, 10)
  const target = join(dir, `buybot-${day}.db`)
  if (!existsSync(target)) backupTo(target)
  const files = readdirSync(dir).filter((f) => f.startsWith('buybot-') && f.endsWith('.db')).sort()
  for (const old of files.slice(0, Math.max(0, files.length - 14))) rmSync(join(dir, old))
}

export function copyForDownload(): string {
  const tmp = join(config.dataDir, `export-${Date.now()}.db`)
  backupTo(tmp)
  return tmp
}
