import { audit, db, getRaw, getSettings, nowIso, setRaw, tx } from './db.js'
import { EvolutionError, evolution } from './evolution.js'
import { config } from './config.js'
import { whatsapp } from './whatsapp.js'
import { inWindow, missingVars, randomBetween, renderMessage, startOfLocalDay } from './util.js'

export type CampaignStatus = 'stopped' | 'running' | 'paused'
export type CampaignReason =
  | null | 'whatsapp_disconnected' | 'outside_window' | 'daily_limit' | 'finished' | 'missing_data' | 'waiting' | 'error'

interface ProspectRow {
  id: number; dni: string; name: string; phone: string; offer_amount: number | null; rate: number | null; attempts: number
}

const MAX_ATTEMPTS = 3

class Queue {
  status: CampaignStatus = 'stopped'
  reason: CampaignReason = null
  reasonText: string | null = null
  nextAt = 0
  currentProspectId: number | null = null
  private busy = false
  private timer: NodeJS.Timeout | null = null

  init() {
    // Recuperación tras un cierre inesperado: lo que quedó "enviando" NO se reenvía solo
    // (podría haberse entregado). Se marca para revisión manual.
    const stuck = db.prepare(`SELECT id, prospect_id, name FROM messages WHERE status = 'sending'`).all() as { id: number; prospect_id: number | null; name: string }[]
    for (const m of stuck) {
      db.prepare(`UPDATE messages SET status = 'unknown', error = 'Envío interrumpido; verifica en WhatsApp si salió.' WHERE id = ?`).run(m.id)
      if (m.prospect_id) {
        db.prepare(`UPDATE prospects SET status = 'failed', last_error = 'Envío interrumpido: verifica en WhatsApp antes de reenviar.', updated_at = ? WHERE id = ?`).run(nowIso(), m.prospect_id)
      }
      audit('sistema', 'message.interrupted', 'prospect', m.prospect_id, m.name, 'El servidor se detuvo durante el envío')
    }
    db.prepare(`UPDATE prospects SET status = 'pending' WHERE status = 'sending'`).run()
    const saved = getRaw('campaign_status')
    // Tras reiniciar el servidor nunca arranca solo: si estaba corriendo queda en pausa.
    this.status = saved === 'running' || saved === 'paused' ? 'paused' : 'stopped'
    setRaw('campaign_status', this.status)
    this.timer = setInterval(() => void this.tick(), 1000)
  }

  shutdown() { if (this.timer) clearInterval(this.timer) }

  private persist() { setRaw('campaign_status', this.status) }

  setReason(reason: CampaignReason, text: string | null = null) { this.reason = reason; this.reasonText = text }

  sentToday(): number {
    return (db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'sent' AND sent_at >= ?`).get(startOfLocalDay()) as { n: number }).n
  }

  /** Prospectos pendientes que no pueden enviarse por faltar monto/tasa que la plantilla exige. */
  countBlocked(): number {
    const { messageTemplate } = getSettings()
    const rows = db.prepare(`SELECT name, offer_amount, rate FROM prospects WHERE status = 'pending'`).all() as { name: string; offer_amount: number | null; rate: number | null }[]
    return rows.filter((r) => missingVars(messageTemplate, r).length).length
  }

  start(actor: string): { ok: true } | { ok: false; error: string } {
    if (this.status === 'running') return { ok: true }
    const pending = (db.prepare(`SELECT COUNT(*) AS n FROM prospects WHERE status = 'pending'`).get() as { n: number }).n
    if (!pending) return { ok: false, error: 'No hay prospectos pendientes para enviar.' }
    const { messageTemplate, delayMin, delayMax } = getSettings()
    if (!messageTemplate.trim()) return { ok: false, error: 'Escribe una plantilla de mensaje en Configuración.' }
    if (delayMin > delayMax) return { ok: false, error: 'La pausa mínima no puede ser mayor que la máxima.' }
    const wasPaused = this.status === 'paused'
    this.status = 'running'
    this.persist()
    this.setReason(null)
    this.nextAt = Date.now() + 1500
    audit(actor, wasPaused ? 'campaign.resume' : 'campaign.start', 'campaign', null, wasPaused ? 'Reanudó el envío' : 'Inició el envío')
    return { ok: true }
  }

  pause(actor: string) {
    if (this.status !== 'running') return
    this.status = 'paused'
    this.persist()
    this.setReason(null)
    audit(actor, 'campaign.pause', 'campaign', null, 'Pausó el envío')
  }

  stop(actor: string) {
    if (this.status === 'stopped') return
    this.status = 'stopped'
    this.persist()
    this.setReason(null)
    this.nextAt = 0
    audit(actor, 'campaign.stop', 'campaign', null, 'Detuvo el envío')
  }

  snapshot() {
    return {
      status: this.status,
      reason: this.reason,
      reasonText: this.reasonText,
      nextAt: this.nextAt && this.nextAt > Date.now() ? new Date(this.nextAt).toISOString() : null,
      currentProspectId: this.currentProspectId,
    }
  }

  private pickNext(): { prospect: ProspectRow | null; blocked: number } {
    const { messageTemplate } = getSettings()
    const rows = db.prepare(
      `SELECT id, dni, name, phone, offer_amount, rate, attempts FROM prospects WHERE status = 'pending' ORDER BY id LIMIT 500`,
    ).all() as unknown as ProspectRow[]
    let blocked = 0
    for (const row of rows) {
      if (missingVars(messageTemplate, row).length) { blocked++; continue }
      return { prospect: row, blocked }
    }
    return { prospect: null, blocked }
  }

  async tick() {
    if (this.busy || this.status !== 'running' || Date.now() < this.nextAt) return
    this.busy = true
    try {
      await this.step()
    } catch (error) {
      this.setReason('error', error instanceof Error ? error.message : 'Error inesperado')
      this.nextAt = Date.now() + 15_000
    } finally {
      this.currentProspectId = null
      this.busy = false
    }
  }

  private async step() {
    const settings = getSettings()

    const wa = await whatsapp.refresh()
    if (wa.state !== 'connected') {
      this.setReason('whatsapp_disconnected', 'WhatsApp no está conectado. El envío continuará solo cuando se reconecte.')
      this.nextAt = Date.now() + 5_000
      return
    }
    if (!inWindow(settings.windowStart, settings.windowEnd)) {
      this.setReason('outside_window', `Fuera del horario de envío (${settings.windowStart}–${settings.windowEnd}).`)
      this.nextAt = Date.now() + 30_000
      return
    }
    if (this.sentToday() >= settings.dailyLimit) {
      this.setReason('daily_limit', `Se alcanzó el límite diario de ${settings.dailyLimit} mensajes. Continuará mañana.`)
      this.nextAt = Date.now() + 60_000
      return
    }

    const { prospect, blocked } = this.pickNext()
    if (!prospect) {
      this.status = 'stopped'
      this.persist()
      this.setReason(blocked ? 'missing_data' : 'finished', blocked ? `${blocked} prospecto(s) no se enviaron porque les falta monto o tasa.` : 'Se procesó toda la base.')
      audit('sistema', 'campaign.finish', 'campaign', null, blocked ? 'Envío terminado con pendientes sin datos' : 'Envío terminado', this.reasonText ?? '')
      return
    }

    this.setReason(null)
    this.currentProspectId = prospect.id
    const body = renderMessage(settings.messageTemplate, prospect)

    // Reserva atómica: el índice único impide dos mensajes activos para el mismo prospecto.
    let messageId: number
    try {
      messageId = tx(() => {
        const claimed = db.prepare(`UPDATE prospects SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'pending'`).run(nowIso(), prospect.id)
        if (!claimed.changes) throw new Error('claimed')
        const res = db.prepare(`INSERT INTO messages(prospect_id,name,phone,body,status) VALUES(?,?,?,?, 'sending')`).run(prospect.id, prospect.name, prospect.phone, body)
        return Number(res.lastInsertRowid)
      })
    } catch {
      return // otro proceso/edición lo tomó; seguimos con el siguiente en el próximo ciclo
    }

    const fail = (status: 'pending' | 'failed' | 'no_whatsapp', messageStatus: 'failed' | 'unknown', error: string, countAttempt: boolean) => {
      tx(() => {
        db.prepare(`UPDATE messages SET status = ?, error = ? WHERE id = ?`).run(messageStatus, error, messageId)
        db.prepare(`UPDATE prospects SET status = ?, last_error = ?, attempts = attempts + ?, updated_at = ? WHERE id = ?`)
          .run(status, error, countAttempt ? 1 : 0, nowIso(), prospect.id)
      })
    }

    // 1) ¿El número tiene WhatsApp?
    try {
      const exists = await evolution.checkNumber(config.instanceName, prospect.phone)
      if (!exists) {
        fail('no_whatsapp', 'failed', 'El número no tiene WhatsApp.', false)
        audit('sistema', 'message.no_whatsapp', 'prospect', prospect.id, prospect.name, prospect.phone)
        this.nextAt = Date.now() + 2_000
        return
      }
    } catch (error) {
      // La verificación no envía nada: es seguro reintentar más tarde.
      fail('pending', 'failed', error instanceof Error ? error.message : 'No se pudo verificar el número.', false)
      this.setReason('waiting', 'No se pudo verificar el número; reintentando en unos segundos.')
      this.nextAt = Date.now() + 15_000
      void whatsapp.refresh(true)
      return
    }

    // 2) Enviar con "escribiendo…" para parecer humano.
    try {
      const typing = Math.min(8000, 1200 + body.length * 25)
      const remoteId = await evolution.sendText(config.instanceName, prospect.phone, body, typing)
      const at = nowIso()
      tx(() => {
        db.prepare(`UPDATE messages SET status = 'sent', sent_at = ?, remote_id = ? WHERE id = ?`).run(at, remoteId, messageId)
        db.prepare(`UPDATE prospects SET status = 'sent', sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?`).run(at, at, prospect.id)
      })
      audit('sistema', 'message.sent', 'prospect', prospect.id, prospect.name, prospect.phone)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Error al enviar'
      if (error instanceof EvolutionError && error.kind === 'http') {
        // Evolution rechazó el envío: sabemos que NO salió. Se reintenta hasta MAX_ATTEMPTS.
        const attempts = prospect.attempts + 1
        fail(attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', 'failed', text, true)
        audit('sistema', attempts >= MAX_ATTEMPTS ? 'message.failed' : 'message.retry', 'prospect', prospect.id, prospect.name, text)
        this.setReason('waiting', `Falló un envío (${attempts}/${MAX_ATTEMPTS}): ${text}`)
        this.nextAt = Date.now() + 20_000
        void whatsapp.refresh(true)
      } else {
        // Sin respuesta: el mensaje pudo haber salido. NO se reintenta para no duplicar.
        fail('failed', 'unknown', `${text}. Verifica en WhatsApp si el mensaje salió antes de reenviar.`, true)
        audit('sistema', 'message.unknown', 'prospect', prospect.id, prospect.name, text)
        this.setReason('waiting', 'Un envío quedó sin confirmación; revísalo en "Por revisar".')
        this.nextAt = Date.now() + 20_000
        void whatsapp.refresh(true)
      }
      return
    }

    const { delayMin, delayMax } = settings
    this.nextAt = Date.now() + randomBetween(delayMin, delayMax) * 1000
  }
}

export const queue = new Queue()
