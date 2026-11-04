// Comprueba una actualización desde la estructura anterior con datos sintéticos.
import { DatabaseSync } from 'node:sqlite'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'

const dir = mkdtempSync(join(tmpdir(), 'buybot-migration-'))
try {
  const path = join(dir, 'buybot.db')
  const old = new DatabaseSync(path)
  old.exec(`
    CREATE TABLE prospects (id INTEGER PRIMARY KEY, dni TEXT, name TEXT, phone TEXT, status TEXT, whatsapp_opt_in INTEGER);
    CREATE TABLE messages (id INTEGER PRIMARY KEY, prospect_id INTEGER, name TEXT, phone TEXT, body TEXT, status TEXT, created_at TEXT, sent_at TEXT);
    CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    INSERT INTO prospects VALUES (1, '70000001', 'Cliente Prueba', '51999999111', 'sent', 1);
    INSERT INTO messages VALUES (1, 1, 'Cliente Prueba', '51999999111', 'Hola', 'sent', '2026-01-01T12:00:00.000Z', '2026-01-01T12:01:00.000Z');
    INSERT INTO settings VALUES ('campaign_status', 'paused');
    PRAGMA user_version = 2;
  `)
  old.close()
  const run = spawnSync(process.execPath, ['--import', 'tsx', 'server/src/db.ts'], { cwd: process.cwd(), env: { ...process.env, DATA_DIR: dir }, encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const migrated = new DatabaseSync(path)
  assert.equal((migrated.prepare('PRAGMA integrity_check').get() as any).integrity_check, 'ok')
  assert.equal((migrated.prepare('PRAGMA user_version').get() as any).user_version, 6)
  assert.deepEqual({ ...(migrated.prepare('SELECT id, dni, status, whatsapp_opt_in, import_batch_id, message_name FROM prospects').get() as any) },
    { id: 1, dni: '70000001', status: 'sent', whatsapp_opt_in: 1, import_batch_id: null, message_name: null })
  assert.equal((migrated.prepare('SELECT send_started_at FROM messages').get() as any).send_started_at, '2026-01-01T12:01:00.000Z')
  assert.equal((migrated.prepare("SELECT value FROM settings WHERE key = 'campaign_status'").get() as any).value, 'paused')
  migrated.close()
  console.log('OK: migración desde versión 2 conserva prospectos, envíos y campaña en pausa.')
} finally {
  rmSync(dir, { recursive: true, force: true })
}
