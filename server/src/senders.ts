import { config } from './config.js'
import { db, getRaw, getSettings } from './db.js'
import { startOfLocalDay } from './util.js'
import { whatsapps } from './whatsapp.js'
import type { WaStatus } from './whatsapp.js'

export interface Sender { id: string; label: string; status: WaStatus }

/** Cuenta intentos iniciados, incluidos los que quedaron sin confirmación. */
export function sentByAccount(id: string, phone: string | null): number {
  const aliases = whatsapps.list().filter((account) =>
    account.id === id || (phone && getRaw(`wa_phone:${account.id}`) === phone)).map((account) => account.id)
  const placeholders = aliases.map(() => '?').join(',')
  const legacyPrimary = aliases.includes(config.instanceName) ? 1 : 0
  return (db.prepare(`SELECT COUNT(*) AS n FROM messages
    WHERE COALESCE(send_started_at, CASE WHEN sender_instance IS NULL AND (status IN ('sending', 'sent', 'unknown') OR sent_at IS NOT NULL) THEN COALESCE(sent_at, created_at) END) >= ? AND (
      (sender_phone IS NOT NULL AND sender_phone = ?) OR
      (sender_phone IS NULL AND (sender_instance IN (${placeholders}) OR (sender_instance IS NULL AND ? = 1)))
    )`).get(startOfLocalDay(), phone ?? '', ...aliases, legacyPrimary) as { n: number }).n
}

export async function accountViews(userId: number, force = false) {
  const accounts = await whatsapps.refreshAll(force, userId)
  const dailyLimit = getSettings().dailyLimit
  return accounts.map((account) => ({ ...account, sentToday: sentByAccount(account.id, account.status.phone ?? getRaw(`wa_phone:${account.id}`)), dailyLimit }))
}

/** Alterna números conectados, sin contar dos sesiones del mismo teléfono como números distintos. */
export async function pickSender(userId: number | null): Promise<{ sender: Sender | null; reason: 'disconnected' | 'unidentified' | 'limit' | null }> {
  const accounts = userId ? await whatsapps.refreshAll(false, userId) : []
  const connected = accounts.filter((account) => account.status.state === 'connected')
  if (!connected.length) return { sender: null, reason: 'disconnected' }
  const seen = new Set<string>()
  const identified = connected.filter((account) => {
    const phone = account.status.phone
    if (!phone || seen.has(phone)) return false
    seen.add(phone)
    return true
  })
  if (!identified.length) return { sender: null, reason: 'unidentified' }
  const previous = getRaw('last_whatsapp_sender')
  const start = (identified.findIndex((account) => account.id === previous) + 1) % identified.length
  const dailyLimit = getSettings().dailyLimit
  for (let i = 0; i < identified.length; i++) {
    const candidate = identified[(start + i) % identified.length]
    if (sentByAccount(candidate.id, candidate.status.phone) < dailyLimit) return { sender: candidate, reason: null }
  }
  return { sender: null, reason: 'limit' }
}
