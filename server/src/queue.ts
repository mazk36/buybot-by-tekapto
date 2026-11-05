import { audit, db, getRaw, getSettings, nowIso, setRaw, tx } from './db.js'
import { EvolutionError, evolution } from './evolution.js'
import { whatsapps } from './whatsapp.js'
import { pickSender, sentByAccount } from './senders.js'
import { inWindow, missingVars, randomBetween, renderMessage, startOfLocalDay } from './util.js'

export type CampaignStatus = 'stopped' | 'running' | 'paused'
export type CampaignReason =
  | null | 'whatsapp_disconnected' | 'outside_window' | 'daily_limit' | 'finished' | 'missing_data' | 'waiting' | 'error'

interface ProspectRow {
  id: number; dni: string; name: string; message_name: string | null; phone: string; offer_amount: number | null; rate: number | null; attempts: number; import_batch_id: number | null
}

const MAX_ATTEMPTS = 3

class Queue {
  status: CampaignStatus = 'stopped'
  reason: CampaignReason = null
  reasonText: string | null = null
  scheduledAt: string | null = null
  scheduleError: string | null = null
  nextAt = 0
  currentProspectId: number | null = null
  constructor(readonly ownerId: number) {
    if (this.read('mix_bases') === null) this.write('mix_bases', getRaw('campaign_mix_bases') ?? '0')
  }

  private key(name: string) { return `campaign_user:${this.ownerId}:${name}` }
  private read(name: string) { return getRaw(this.key(name)) }
  private write(name: string, value: string) { setRaw(this.key(name), value) }
  private busy = false
  private timer: NodeJS.Timeout | null = null

  init() {
    const saved = this.read('status')
    // Tras reiniciar el servidor nunca arranca solo: si estaba corriendo queda en pausa.
    this.status = saved === 'running' || saved === 'paused' ? 'paused' : 'stopped'
    this.write('status', this.status)
    const savedSchedule = this.read('scheduled_at')
    this.scheduledAt = savedSchedule && Number.isFinite(Date.parse(savedSchedule)) ? savedSchedule : null
    this.scheduleError = this.read('schedule_error') || null
    this.timer = setInterval(() => void this.tick(), 1000)
  }

  shutdown() { if (this.timer) clearInterval(this.timer) }

  private persist() { this.write('status', this.status) }

  setReason(reason: CampaignReason, text: string | null = null) { this.reason = reason; this.reasonText = text }

  setMix(enabled: boolean, actor: string) {
    if ((this.read('mix_bases') === '1') === enabled) return
    this.write('mix_bases', enabled ? '1' : '0')
    audit(actor, 'campaign.mix', 'campaign', null, enabled ? 'Activó mezcla de bases' : 'Desactivó mezcla de bases')
  }

  sentToday(): number {
    return (db.prepare(`SELECT COUNT(*) AS n FROM messages WHERE status = 'sent' AND sent_at >= ?`).get(startOfLocalDay()) as { n: number }).n
  }

  /** Prospectos pendientes que no pueden enviarse por faltar monto/tasa que la plantilla exige. */
  countBlocked(): number {
    const { messageTemplate } = getSettings()
    const rows = db.prepare(`SELECT name, offer_amount, rate FROM prospects WHERE status = 'pending'`).all() as { name: string; offer_amount: number | null; rate: number | null }[]
    return rows.filter((r) => missingVars(messageTemplate, r).length).length
  }

  private startError(): string | null {
    const pending = (db.prepare(`SELECT COUNT(*) AS n FROM prospects WHERE status = 'pending' AND whatsapp_opt_in = 1`).get() as { n: number }).n
    if (!pending) return 'No hay prospectos pendientes con autorización de WhatsApp.'
    const { messageTemplate, delayMin, delayMax } = getSettings()
    if (!messageTemplate.trim()) return 'Escribe una plantilla de mensaje en Configuración.'
    if (delayMin > delayMax) return 'La pausa mínima no puede ser mayor que la máxima.'
    return null
  }

  schedule(actor: string, value: unknown): { ok: true } | { ok: false; error: string } {
    if (this.status === 'running') return { ok: false, error: 'Pausa o detén el envío antes de programar otro inicio.' }
    const time = typeof value === 'string' ? Date.parse(value) : NaN
    if (!Number.isFinite(time) || time <= Date.now() + 1000) return { ok: false, error: 'Elige una fecha y hora futuras.' }
    const error = this.startError()
    if (error) return { ok: false, error }
    const scheduledAt = new Date(time).toISOString()
    tx(() => {
      this.write('scheduled_at', scheduledAt)
      this.write('schedule_error', '')
      audit(actor, 'campaign.schedule', 'campaign', null, 'Programó el inicio del envío', scheduledAt)
    })
    this.scheduledAt = scheduledAt
    this.scheduleError = null
    return { ok: true }
  }

  cancelSchedule(actor: string) {
    if (!this.scheduledAt && !this.scheduleError) return
    const scheduledAt = this.scheduledAt
    tx(() => {
      this.write('scheduled_at', '')
      this.write('schedule_error', '')
      audit(actor, 'campaign.schedule_cancel', 'campaign', null, 'Canceló el inicio programado', scheduledAt ?? '')
    })
    this.scheduledAt = null
    this.scheduleError = null
  }

  start(actor: string, scheduled = false): { ok: true } | { ok: false; error: string } {
    if (this.status === 'running') return { ok: true }
    const error = this.startError()
    if (error) return { ok: false, error }
    const wasPaused = this.status === 'paused'
    const previousSchedule = this.scheduledAt
    tx(() => {
      this.write('status', 'running')
      this.write('scheduled_at', '')
      this.write('schedule_error', '')
      audit(actor, scheduled ? 'campaign.scheduled_start' : wasPaused ? 'campaign.resume' : 'campaign.start', 'campaign', null,
        scheduled ? 'Inició el envío programado' : wasPaused ? 'Reanudó el envío' : 'Inició el envío', previousSchedule ?? '')
    })
    this.scheduledAt = null
    this.scheduleError = null
    this.status = 'running'
    this.setReason(null)
    this.nextAt = Date.now() + 1500
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
    if (this.scheduledAt || this.scheduleError) this.cancelSchedule(actor)
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
      mixBases: this.read('mix_bases') === '1',
      scheduledAt: this.scheduledAt,
      scheduleError: this.scheduleError,
    }
  }

  private pickNext(): { prospect: ProspectRow | null; blocked: number } {
    const { messageTemplate } = getSettings()
    const rows = db.prepare(
      `SELECT id, dni, name, message_name, phone, offer_amount, rate, attempts, import_batch_id FROM prospects WHERE status = 'pending' AND whatsapp_opt_in = 1 ORDER BY id`,
    ).all() as unknown as ProspectRow[]
    let blocked = 0
    const mix = this.read('mix_bases') === '1'
    const firstByBase = new Map<number, ProspectRow>()
    for (const row of rows) {
      if (missingVars(messageTemplate, row).length) { blocked++; continue }
      if (!mix) return { prospect: row, blocked }
      const batchId = row.import_batch_id ?? 0
      if (!firstByBase.has(batchId)) firstByBase.set(batchId, row)
    }
    if (!firstByBase.size) return { prospect: null, blocked }
    const bases = [...firstByBase.keys()].sort((a, b) => a - b)
    const lastBase = Number(this.read('last_base') ?? '-1')
    const nextBase = bases.find((id) => id > lastBase) ?? bases[0]
    return { prospect: firstByBase.get(nextBase)!, blocked }
  }

  async tick() {
    if (this.busy) return
    if (this.scheduledAt && Date.now() >= Date.parse(this.scheduledAt)) {
      const at = this.scheduledAt
      try {
        const result = this.start('sistema', true)
        if (!result.ok) {
          tx(() => {
            this.write('scheduled_at', '')
            this.write('schedule_error', result.error)
            audit('sistema', 'campaign.schedule_failed', 'campaign', null, 'No se pudo iniciar el envío programado', { at, error: result.error })
          })
          this.scheduledAt = null
          this.scheduleError = result.error
        }
      } catch {
        // Si falla la escritura, conservamos la programación para reintentar en el próximo ciclo.
        return
      }
    }
    if (this.status !== 'running' || Date.now() < this.nextAt) return
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

    if (!inWindow(settings.windowStart, settings.windowEnd)) {
      this.setReason('outside_window', `Fuera del horario de envío (${settings.windowStart}–${settings.windowEnd}).`)
      this.nextAt = Date.now() + 30_000
      return
    }
    const selection = await pickSender(this.ownerId)
    const sender = selection.sender
    if (!sender) {
      const limited = selection.reason === 'limit'
      this.setReason(limited ? 'daily_limit' : 'whatsapp_disconnected', limited
        ? `Los números conectados alcanzaron el límite diario de ${settings.dailyLimit} intentos por número. Continuará mañana.`
        : selection.reason === 'unidentified' ? 'No se pudo identificar el número conectado. Revisa la conexión de WhatsApp.'
          : 'Ningún WhatsApp está conectado. El envío continuará cuando se conecte uno.')
      this.nextAt = Date.now() + (limited ? 60_000 : 5_000)
      return
    }

    const { prospect, blocked } = this.pickNext()
    if (!prospect) {
      // Another user's worker may still be verifying a contact that can return to pending.
      const active = db.prepare("SELECT 1 FROM prospects WHERE status = 'sending' LIMIT 1").get()
      if (active) {
        this.setReason('waiting', 'Esperando que terminen los contactos en proceso.')
        this.nextAt = Date.now() + 2_000
        return
      }
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
        const claimed = db.prepare(`UPDATE prospects SET status = 'sending', updated_at = ? WHERE id = ? AND status = 'pending' AND whatsapp_opt_in = 1`).run(nowIso(), prospect.id)
        if (!claimed.changes) throw new Error('claimed')
        if (this.read('mix_bases') === '1') this.write('last_base', String(prospect.import_batch_id ?? 0))
        const res = db.prepare(`INSERT INTO messages(prospect_id,name,phone,body,status,sender_instance,sender_phone) VALUES(?,?,?,?, 'sending',?,?)`).run(prospect.id, prospect.name, prospect.phone, body, sender.id, sender.status.phone)
        return Number(res.lastInsertRowid)
      })
    } catch {
      return // otro proceso/edición lo tomó; seguimos con el siguiente en el próximo ciclo
    }

    const fail = (status: 'pending' | 'failed' | 'no_whatsapp', messageStatus: 'failed' | 'unknown', error: string, countAttempt: boolean) => {
      tx(() => {
        db.prepare(`UPDATE messages SET status = ?, error = ? WHERE id = ?`).run(messageStatus, error, messageId)
        db.prepare(`UPDATE prospects SET status = ?, last_error = ?, attempts = attempts + ?, updated_at = ? WHERE id = ? AND status = 'sending'`)
          .run(status, error, countAttempt ? 1 : 0, nowIso(), prospect.id)
      })
    }

    // 1) ¿El número tiene WhatsApp?
    try {
      const exists = await evolution.checkNumber(sender.id, prospect.phone)
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
      void whatsapps.get(sender.id)?.refresh(true)
      return
    }

    // 2) Enviar el mensaje; el intervalo configurado se aplica después del envío.
    const reserved = tx(() => {
      const current = db.prepare('SELECT status, whatsapp_opt_in FROM prospects WHERE id = ?').get(prospect.id) as { status: string; whatsapp_opt_in: number } | undefined
      const live = whatsapps.get(sender.id)?.snapshot
      if (this.status !== 'running' || live?.state !== 'connected' || live.phone !== sender.status.phone || !current || current.status !== 'sending' || current.whatsapp_opt_in !== 1 || sentByAccount(sender.id, sender.status.phone) >= settings.dailyLimit) {
        db.prepare(`UPDATE messages SET status = 'failed', error = 'Envío cancelado antes de comenzar.' WHERE id = ?`).run(messageId)
        db.prepare(`UPDATE prospects SET status = CASE WHEN whatsapp_opt_in = 1 THEN 'pending' ELSE 'on_hold' END, updated_at = ? WHERE id = ? AND status = 'sending'`).run(nowIso(), prospect.id)
        return false
      }
      db.prepare('UPDATE messages SET send_started_at = ? WHERE id = ?').run(nowIso(), messageId)
      setRaw('last_whatsapp_sender', sender.id)
      return true
    })
    if (!reserved) { this.nextAt = Date.now() + 2_000; return }
    try {
      const remoteId = await evolution.sendText(sender.id, prospect.phone, body, 0)
      const at = nowIso()
      tx(() => {
        db.prepare(`UPDATE messages SET status = 'sent', sent_at = ?, remote_id = ? WHERE id = ?`).run(at, remoteId, messageId)
        db.prepare(`UPDATE prospects SET status = CASE WHEN status = 'opted_out' THEN status ELSE 'sent' END, sent_at = ?, last_error = NULL, updated_at = ? WHERE id = ?`).run(at, at, prospect.id)
      })
      audit('sistema', 'message.sent', 'prospect', prospect.id, prospect.name, prospect.phone)
    } catch (error) {
      const text = error instanceof Error ? error.message : 'Error al enviar'
      if (error instanceof EvolutionError && error.kind === 'http' && error.status < 500) {
        // Evolution rechazó el envío: sabemos que NO salió. Se reintenta hasta MAX_ATTEMPTS.
        const attempts = prospect.attempts + 1
        fail(attempts >= MAX_ATTEMPTS ? 'failed' : 'pending', 'failed', text, true)
        audit('sistema', attempts >= MAX_ATTEMPTS ? 'message.failed' : 'message.retry', 'prospect', prospect.id, prospect.name, text)
        this.setReason('waiting', `Falló un envío (${attempts}/${MAX_ATTEMPTS}): ${text}`)
        this.nextAt = Date.now() + 20_000
        void whatsapps.get(sender.id)?.refresh(true)
      } else {
        // Sin respuesta: el mensaje pudo haber salido. NO se reintenta para no duplicar.
        fail('failed', 'unknown', `${text}. Verifica en WhatsApp si el mensaje salió antes de reenviar.`, true)
        audit('sistema', 'message.unknown', 'prospect', prospect.id, prospect.name, text)
        this.setReason('waiting', 'Un envío quedó sin confirmación; revísalo en "Por revisar".')
        this.nextAt = Date.now() + 20_000
        void whatsapps.get(sender.id)?.refresh(true)
      }
      return
    }

    const { delayMin, delayMax } = settings
    this.nextAt = Date.now() + randomBetween(delayMin, delayMax) * 1000
  }
}

class CampaignQueues {
  private queues = new Map<number, Queue>()
  private initialized = false

  forUser(userId: number): Queue {
    let value = this.queues.get(userId)
    if (!value) {
      value = new Queue(userId)
      this.queues.set(userId, value)
      if (this.initialized) value.init()
    }
    return value
  }

  init() {
    if (this.initialized) return
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
    db.prepare(`UPDATE prospects SET status = CASE WHEN whatsapp_opt_in = 1 THEN 'pending' ELSE 'on_hold' END WHERE status = 'sending'`).run()
    // Transfer the previous owner's saved controls once; never resume a running bot on boot.
    if (getRaw('campaign_per_user_initialized') !== '1') {
      tx(() => {
        const owner = Number(getRaw('campaign_owner_user_id'))
        if (owner && db.prepare('SELECT 1 FROM users WHERE id = ?').get(owner)) {
          for (const name of ['status', 'scheduled_at', 'schedule_error', 'mix_bases', 'last_base']) {
            const value = getRaw(`campaign_${name}`)
            if (value !== null) setRaw(`campaign_user:${owner}:${name}`, value)
          }
        }
        setRaw('campaign_status', 'paused')
        setRaw('campaign_scheduled_at', '')
        setRaw('campaign_owner_user_id', '')
        setRaw('campaign_per_user_initialized', '1')
      })
    }
    // One worker per user within this single application process.
    const users = db.prepare('SELECT id FROM users').all() as { id: number }[]
    for (const user of users) this.forUser(user.id)
    this.initialized = true
    for (const worker of this.queues.values()) worker.init()
  }

  shutdown() {
    for (const worker of this.queues.values()) worker.shutdown()
    this.initialized = false
  }
}

export const queue = new CampaignQueues()
