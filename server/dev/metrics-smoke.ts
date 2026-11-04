import { DatabaseSync } from 'node:sqlite'
import { strict as assert } from 'node:assert'
import { contactMetrics } from '../src/metrics.js'
const db = new DatabaseSync(':memory:')
db.exec(`CREATE TABLE prospects(id INTEGER PRIMARY KEY,status TEXT,sent_at TEXT); CREATE TABLE messages(prospect_id INTEGER,status TEXT,sent_at TEXT);
INSERT INTO prospects VALUES(1,'sent','2026-11-04T12:00:00Z'),(2,'opted_out','2026-11-04T12:00:00Z'),(3,'pending',NULL),(4,'no_whatsapp',NULL);
INSERT INTO messages VALUES(1,'superseded','2026-11-04T12:00:00Z'),(1,'sent','2026-11-04T12:01:00Z'),(2,'sent','2026-11-04T12:02:00Z'),(NULL,'sent','2026-11-04T12:03:00Z'),(3,'superseded','2026-11-03T12:00:00Z'),(4,'failed',NULL);`)
assert.deepEqual(contactMetrics(db,'2026-11-04T00:00:00Z'), {totalMessagesToday:4,sentToday:2,manualMessagesToday:1,contactedTotal:3})
assert.equal((db.prepare("SELECT COUNT(*) AS n FROM prospects WHERE status != 'no_whatsapp'").get() as any).n,3)
assert.equal((db.prepare('SELECT COUNT(*) AS n FROM prospects').get() as any).n,4)
db.exec('DELETE FROM messages; DELETE FROM prospects')
assert.deepEqual(contactMetrics(db,'2026-11-04T00:00:00Z'),{totalMessagesToday:0,sentToday:0,manualMessagesToday:0,contactedTotal:0})
db.close()
console.log('OK: pruebas manuales, envíos repetidos, bajas, periodos y exclusión sin borrar contactos.')
