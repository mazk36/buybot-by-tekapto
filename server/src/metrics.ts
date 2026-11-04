import type { DatabaseSync } from 'node:sqlite'

export function contactMetrics(db: DatabaseSync, since: string) {
  const today = db.prepare(`SELECT COUNT(*) AS totalMessagesToday,
    COUNT(DISTINCT prospect_id) AS sentToday,
    COALESCE(SUM(prospect_id IS NULL),0) AS manualMessagesToday
    FROM messages WHERE sent_at >= ? AND status IN ('sent','superseded')`).get(since) as { totalMessagesToday: number; sentToday: number; manualMessagesToday: number }
  const contactedTotal = (db.prepare(`SELECT COUNT(*) AS n FROM prospects p WHERE p.sent_at IS NOT NULL OR EXISTS
    (SELECT 1 FROM messages m WHERE m.prospect_id=p.id AND m.sent_at IS NOT NULL AND m.status IN ('sent','superseded'))`).get() as { n: number }).n
  return { ...today, contactedTotal }
}
