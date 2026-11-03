import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { createHash, timingSafeEqual } from 'node:crypto'
import { createReadStream, rmSync } from 'node:fs'
import { COOKIE, createSession, destroyOtherSessions, destroySession, hashPassword, loginBlocked, loginFailed, loginOk, requireAuth, setSessionCookie, userCount, userFromToken, verifyPassword } from './auth.js'
import { audit, copyForDownload, db, getRaw, getSettings, nowIso, setRaw, tx, webhookSecret, DEFAULT_TEMPLATE } from './db.js'
import { config } from './config.js'
import { queue } from './queue.js'
import { whatsapp } from './whatsapp.js'
import { evolution } from './evolution.js'
import { isValidDni, normalizePhone, parseNumber, renderMessage, startOfLocalDay, titleCase } from './util.js'

const STATUSES = ['pending', 'sending', 'sent', 'failed', 'no_whatsapp', 'opted_out', 'on_hold'] as const
type Status = (typeof STATUSES)[number]
const actor = (request: FastifyRequest) => request.user?.email ?? 'sistema'

const toProspect = (r: any) => ({
  id: r.id, dni: r.dni, name: r.name, phone: r.phone, offerAmount: r.offer_amount, rate: r.rate, notes: r.notes,
  whatsappOptIn: r.whatsapp_opt_in === 1,
  status: r.status as Status, attempts: r.attempts, lastError: r.last_error, sentAt: r.sent_at,
  repliedAt: r.replied_at, replyText: r.reply_text, createdAt: r.created_at, updatedAt: r.updated_at,
})

class HttpError extends Error { constructor(readonly status: number, message: string) { super(message) } }
const bad = (message: string) => new HttpError(400, message)

function parseProspectInput(body: any, partial: boolean) {
  const out: { dni?: string; name?: string; phone?: string; offerAmount?: number | null; rate?: number | null; notes?: string; whatsappOptIn?: boolean } = {}
  if (!partial || body.dni !== undefined) {
    const dni = String(body.dni ?? '').trim()
    if (!isValidDni(dni)) throw bad('El DNI debe tener 8 dígitos.')
    out.dni = dni
  }
  if (!partial || body.name !== undefined) {
    const name = String(body.name ?? '').trim().replace(/\s+/g, ' ')
    if (name.length < 2 || name.length > 120) throw bad('Escribe el nombre del cliente.')
    out.name = titleCase(name)
  }
  if (!partial || body.phone !== undefined) {
    const phone = normalizePhone(String(body.phone ?? ''))
    if (!phone) throw bad('El WhatsApp debe ser un celular peruano de 9 dígitos (ej. 999 555 101).')
    out.phone = phone
  }
  if (body.offerAmount !== undefined) {
    const n = body.offerAmount === null || body.offerAmount === '' ? null : parseNumber(body.offerAmount)
    if (n !== null && (n <= 0 || n > 10_000_000)) throw bad('El monto no es válido.')
    out.offerAmount = n
  }
  if (body.rate !== undefined) {
    const n = body.rate === null || body.rate === '' ? null : parseNumber(body.rate)
    if (n !== null && (n <= 0 || n > 100)) throw bad('La tasa debe estar entre 0 y 100.')
    out.rate = n
  }
  if (body.notes !== undefined) out.notes = String(body.notes).slice(0, 1000)
  if (body.whatsappOptIn !== undefined) {
    if (typeof body.whatsappOptIn !== 'boolean') throw bad('La autorización de WhatsApp debe ser sí o no.')
    out.whatsappOptIn = body.whatsappOptIn
  } else if (!partial) out.whatsappOptIn = false
  return out
}

function uniqueConflict(error: unknown): string | null {
  const text = error instanceof Error ? error.message : ''
  if (!text.includes('UNIQUE')) return null
  return text.includes('prospects.dni') ? 'Ya existe un prospecto con ese DNI.' : text.includes('prospects.phone') ? 'Ya existe un prospecto con ese WhatsApp.' : 'Registro duplicado.'
}

function csvCell(value: unknown) {
  const s = value === null || value === undefined ? '' : String(value)
  return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replaceAll('"', '""')}"`
}
function sendCsv(reply: FastifyReply, filename: string, rows: unknown[][]) {
  reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${filename}"`)
  return reply.send(`﻿${rows.map((r) => r.map(csvCell).join(',')).join('\r\n')}`)
}

function canClaimInitialAccount() {
  return Boolean(config.accountClaimToken) && getRaw('accountClaimed') !== '1' && userCount() >= 1
}

function canInviteOneAccount() {
  return Boolean(config.accountInviteToken) && getRaw('accountInviteUsed') !== '1' && userCount() === 1
}

function canCreateAccount() {
  return canClaimInitialAccount() || canInviteOneAccount()
}

function matchesClaimToken(provided: string, expected: string) {
  const providedHash = createHash('sha256').update(provided).digest()
  const expectedHash = createHash('sha256').update(expected).digest()
  return timingSafeEqual(providedHash, expectedHash)
}

function prospectFilter(query: any) {
  const where: string[] = []
  const params: (string | number)[] = []
  if (query.status && query.status !== 'all') {
    if (!STATUSES.includes(query.status)) throw bad('Estado no válido.')
    where.push('status = ?'); params.push(query.status)
  }
  if (query.q) {
    const like = `%${String(query.q).trim().toLowerCase()}%`
    where.push('(lower(name) LIKE ? OR dni LIKE ? OR phone LIKE ?)'); params.push(like, like, like)
  }
  return { sql: where.length ? `WHERE ${where.join(' AND ')}` : '', params }
}

export async function registerRoutes(app: FastifyInstance) {
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof HttpError) return reply.code(error.status).send({ error: error.message })
    const e = error as { statusCode?: number; message: string }
    if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message })
    app.log.error(error)
    return reply.code(500).send({ error: 'Error interno del servidor.' })
  })

  // ---------- Salud y webhook (sin sesión) ----------
  app.get('/api/health', async () => ({ ok: true }))

  app.post('/api/webhooks/evolution', async (request, reply) => {
    const { secret } = request.query as { secret?: string }
    if (secret !== webhookSecret()) return reply.code(401).send({ error: 'No autorizado' })
    const body = request.body as any
    const event = String(body?.event ?? '').toLowerCase().replace(/_/g, '.')
    if (event === 'connection.update' || event === 'qrcode.updated') whatsapp.poke()
    if (event === 'messages.upsert') {
      const items = Array.isArray(body.data) ? body.data : [body.data]
      for (const data of items) {
        if (!data?.key || data.key.fromMe) continue
        const jid = String(data.key.remoteJid ?? '')
        if (jid.endsWith('@g.us')) continue
        const phone = jid.split('@')[0]
        const text = String(data.message?.conversation ?? data.message?.extendedTextMessage?.text ?? '').trim()
        const row = db.prepare('SELECT id, name, status FROM prospects WHERE phone = ?').get(phone) as { id: number; name: string; status: Status } | undefined
        if (!row) continue
        const optOut = /^\s*(stop|baja|no\s*gracias|no\s*deseo|no)\s*[.!]*\s*$/i.test(text)
        db.prepare(`UPDATE prospects SET replied_at = ?, reply_text = ?, status = CASE WHEN ? THEN 'opted_out' ELSE status END, whatsapp_opt_in = CASE WHEN ? THEN 0 ELSE whatsapp_opt_in END, updated_at = ? WHERE id = ?`)
          .run(nowIso(), text.slice(0, 500), optOut ? 1 : 0, optOut ? 1 : 0, nowIso(), row.id)
        audit('cliente', optOut ? 'prospect.opt_out' : 'prospect.reply', 'prospect', row.id, row.name, text.slice(0, 200))
      }
    }
    return { ok: true }
  })

  // ---------- Auth ----------
  app.get('/api/auth/me', async (request) => {
    const user = userFromToken(request.cookies[COOKIE])
    return { user, needsSetup: userCount() === 0, canCreateAccount: canCreateAccount() }
  })

  app.post('/api/auth/setup', async (request, reply) => {
    if (userCount() > 0) throw new HttpError(409, 'La cuenta ya fue creada. Inicia sesión.')
    const { email, password, name } = request.body as any
    if (!/^\S+@\S+\.\S+$/.test(String(email ?? ''))) throw bad('Escribe un correo válido.')
    if (String(password ?? '').length < 8) throw bad('La contraseña debe tener al menos 8 caracteres.')
    const hash = await hashPassword(String(password))
    const res = db.prepare('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)').run(String(email).trim(), String(name ?? '').trim(), hash)
    audit(String(email), 'user.create', 'user', Number(res.lastInsertRowid), String(email), 'Cuenta inicial')
    setSessionCookie(reply, createSession(Number(res.lastInsertRowid)))
    return { user: { id: Number(res.lastInsertRowid), email, name: String(name ?? '').trim() }, canCreateAccount: canCreateAccount() }
  })

  app.post('/api/auth/create-account', async (request, reply) => {
    if (!canCreateAccount()) throw new HttpError(409, 'La creación de cuenta ya se utilizó o no está habilitada.')
    const key = 'account-create|' + request.ip
    const wait = loginBlocked(key)
    if (wait) throw new HttpError(429, 'Demasiados intentos. Espera ' + Math.ceil(wait / 60) + ' min e inténtalo de nuevo.')
    const body = request.body as any
    const code = String(body?.code ?? '')
    const claimInitial = canClaimInitialAccount() && matchesClaimToken(code, config.accountClaimToken)
    const inviteOne = canInviteOneAccount() && matchesClaimToken(code, config.accountInviteToken)
    if (!claimInitial && !inviteOne) {
      loginFailed(key)
      throw new HttpError(401, 'El código de creación no es correcto.')
    }
    loginOk(key)

    const email = String(body?.email ?? '').trim()
    const name = String(body?.name ?? '').trim().replace(/\s+/g, ' ')
    const password = String(body?.password ?? '')
    const confirmPassword = String(body?.confirmPassword ?? '')
    if (!/^\S+@\S+\.\S+$/.test(email)) throw bad('Escribe un correo válido.')
    if (name.length < 2 || name.length > 120) throw bad('Escribe tu nombre.')
    if (password.length < 8 || password.length > 256) throw bad('La contraseña debe tener entre 8 y 256 caracteres.')
    if (password !== confirmPassword) throw bad('Las contraseñas no coinciden.')
    const passwordHash = await hashPassword(password)

    const user = tx(() => {
      if (claimInitial) {
        if (!canClaimInitialAccount()) throw new HttpError(409, 'La cuenta inicial ya fue reclamada.')
        const current = db.prepare('SELECT id FROM users ORDER BY id LIMIT 1').get() as { id: number } | undefined
        if (!current) throw new HttpError(409, 'No hay una cuenta de prueba disponible para reclamar.')
        db.prepare('UPDATE users SET email = ?, name = ?, password_hash = ? WHERE id = ?').run(email, name, passwordHash, current.id)
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(current.id)
        setRaw('accountClaimed', '1')
        audit(email, 'user.claim', 'user', current.id, email, 'Cuenta de prueba reclamada')
        return { id: current.id, email, name }
      }
      if (!inviteOne || !canInviteOneAccount()) throw new HttpError(409, 'La invitación ya fue utilizada o no está disponible.')
      const result = db.prepare('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)').run(email, name, passwordHash)
      const id = Number(result.lastInsertRowid)
      setRaw('accountInviteUsed', '1')
      audit(email, 'user.invite', 'user', id, email, 'Cuenta adicional creada con invitación')
      return { id, email, name }
    })
    setSessionCookie(reply, createSession(user.id))
    return { user, canCreateAccount: canCreateAccount() }
  })

  app.post('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body as any
    const key = `${request.ip}|${String(email ?? '').toLowerCase()}`
    const wait = loginBlocked(key)
    if (wait) throw new HttpError(429, `Demasiados intentos. Espera ${Math.ceil(wait / 60)} min e inténtalo de nuevo.`)
    const row = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(String(email ?? '').trim()) as any
    const ok = row ? await verifyPassword(String(password ?? ''), row.password_hash) : (await hashPassword('x'), false)
    if (!ok) { loginFailed(key); throw new HttpError(401, 'Correo o contraseña incorrectos.') }
    loginOk(key)
    setSessionCookie(reply, createSession(row.id))
    audit(row.email, 'auth.login', 'user', row.id, row.email)
    return { user: { id: row.id, email: row.email, name: row.name } }
  })

  app.post('/api/auth/logout', async (request, reply) => {
    const token = request.cookies[COOKIE]
    if (token) destroySession(token)
    reply.clearCookie(COOKIE, { path: '/' })
    return { ok: true }
  })

  // ---------- Todo lo demás requiere sesión ----------
  await app.register(async (api) => {
    api.addHook('preHandler', requireAuth)

    api.post('/api/auth/password', async (request) => {
      const { current, next } = request.body as any
      if (String(next ?? '').length < 8) throw bad('La nueva contraseña debe tener al menos 8 caracteres.')
      const row = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(request.user!.id) as any
      if (!(await verifyPassword(String(current ?? ''), row.password_hash))) throw bad('La contraseña actual no es correcta.')
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(String(next)), request.user!.id)
      destroyOtherSessions(request.user!.id, request.cookies[COOKIE]!)
      audit(actor(request), 'user.password', 'user', request.user!.id, request.user!.email)
      return { ok: true }
    })

    api.patch('/api/auth/profile', async (request) => {
      const { name } = request.body as any
      const clean = String(name ?? '').trim().slice(0, 80)
      db.prepare('UPDATE users SET name = ? WHERE id = ?').run(clean, request.user!.id)
      return { user: { ...request.user!, name: clean } }
    })

    // ----- Estado general -----
    api.get('/api/stats', async () => {
      const counts: Record<string, number> = Object.fromEntries(STATUSES.map((s) => [s, 0]))
      for (const r of db.prepare('SELECT status, COUNT(*) AS n FROM prospects GROUP BY status').all() as any[]) counts[r.status] = r.n
      const total = Object.values(counts).reduce((a, b) => a + b, 0)
      const replied = (db.prepare('SELECT COUNT(*) AS n FROM prospects WHERE replied_at IS NOT NULL').get() as any).n
      const settings = getSettings()
      return {
        total, counts, replied,
        sentToday: queue.sentToday(), dailyLimit: settings.dailyLimit,
        blocked: queue.countBlocked(),
        campaign: queue.snapshot(),
        whatsapp: whatsapp.snapshot,
      }
    })

    // ----- Prospectos -----
    api.get('/api/prospects', async (request) => {
      const q = request.query as any
      const { sql, params } = prospectFilter(q)
      const pageSize = Math.min(100, Math.max(5, Number(q.pageSize) || 25))
      const page = Math.max(1, Number(q.page) || 1)
      const sorts: Record<string, string> = { name: 'name COLLATE NOCASE', sent: 'sent_at', created: 'id', status: 'status' }
      const order = `${sorts[q.sort] ?? 'id'} ${q.dir === 'desc' ? 'DESC' : 'ASC'}`
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM prospects ${sql}`).get(...params) as any).n
      const items = db.prepare(`SELECT * FROM prospects ${sql} ORDER BY ${order}, id LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize)
      return { items: items.map(toProspect), total, page, pageSize }
    })

    api.get('/api/prospects/export.csv', async (request, reply) => {
      const { sql, params } = prospectFilter(request.query)
      const rows = db.prepare(`SELECT * FROM prospects ${sql} ORDER BY id`).all(...params) as any[]
      audit(actor(request), 'prospects.export', 'prospect', null, `${rows.length} filas`)
      return sendCsv(reply, 'buybot-prospectos.csv', [
        ['DNI', 'Nombre', 'WhatsApp', 'Autorización WhatsApp', 'Monto', 'Tasa', 'Estado', 'Enviado', 'Respondió', 'Notas'],
        ...rows.map((r) => [r.dni, r.name, r.phone, r.whatsapp_opt_in ? 'Sí' : 'No', r.offer_amount, r.rate, r.status, r.sent_at, r.replied_at, r.notes]),
      ])
    })

    api.get('/api/prospects/:id', async (request) => {
      const row = db.prepare('SELECT * FROM prospects WHERE id = ?').get(Number((request.params as any).id))
      if (!row) throw new HttpError(404, 'Prospecto no encontrado.')
      const messages = db.prepare('SELECT id, body, status, error, created_at, sent_at FROM messages WHERE prospect_id = ? ORDER BY id DESC').all((row as any).id)
      return { prospect: toProspect(row), messages }
    })

    api.post('/api/prospects', async (request, reply) => {
      const data = parseProspectInput(request.body as any, false)
      try {
        const initialStatus = data.whatsappOptIn ? 'pending' : 'on_hold'
        const res = db.prepare('INSERT INTO prospects(dni,name,phone,offer_amount,rate,notes,whatsapp_opt_in,status) VALUES(?,?,?,?,?,?,?,?)')
          .run(data.dni!, data.name!, data.phone!, data.offerAmount ?? null, data.rate ?? null, data.notes ?? '', data.whatsappOptIn ? 1 : 0, initialStatus)
        audit(actor(request), 'prospect.create', 'prospect', Number(res.lastInsertRowid), data.name!, data)
        const row = db.prepare('SELECT * FROM prospects WHERE id = ?').get(Number(res.lastInsertRowid))
        return reply.code(201).send({ prospect: toProspect(row) })
      } catch (error) {
        const msg = uniqueConflict(error)
        if (msg) throw new HttpError(409, msg)
        throw error
      }
    })

    api.patch('/api/prospects/:id', async (request) => {
      const id = Number((request.params as any).id)
      const body = request.body as any
      const current = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id) as any
      if (!current) throw new HttpError(404, 'Prospecto no encontrado.')
      const data = parseProspectInput(body, true)
      let status: Status | undefined
      if (body.status !== undefined) {
        // Cambios manuales permitidos: poner en espera o liberar. "sent" no se puede fabricar ni deshacer aquí.
        if (!['on_hold', 'pending'].includes(body.status)) throw bad('Estado no permitido.')
        if (current.status === 'sent' || current.status === 'sending') throw new HttpError(409, 'Este cliente ya fue contactado; su estado no se puede cambiar.')
        if (current.status === 'opted_out' && body.status === 'pending') throw new HttpError(409, 'El cliente pidió no recibir mensajes.')
        status = body.status
      }
      const locked = current.status === 'sent' || current.status === 'sending'
      if (locked && (data.dni !== undefined && data.dni !== current.dni || data.phone !== undefined && data.phone !== current.phone)) {
        throw new HttpError(409, 'No se puede cambiar el DNI ni el WhatsApp de un cliente ya contactado.')
      }
      if (current.status === 'sending') throw new HttpError(409, 'El mensaje se está enviando en este momento.')
      const next = { ...current, ...{
        dni: data.dni ?? current.dni, name: data.name ?? current.name, phone: data.phone ?? current.phone,
        offer_amount: data.offerAmount !== undefined ? data.offerAmount : current.offer_amount,
        rate: data.rate !== undefined ? data.rate : current.rate, notes: data.notes ?? current.notes,
        whatsapp_opt_in: data.whatsappOptIn !== undefined ? (data.whatsappOptIn ? 1 : 0) : current.whatsapp_opt_in,
        status: status ?? current.status,
      } }
      if (status === 'pending' && next.whatsapp_opt_in !== 1) throw new HttpError(409, 'Registra primero la autorización de WhatsApp para liberar este contacto.')
      if (data.whatsappOptIn === false && ['pending', 'failed', 'no_whatsapp'].includes(current.status)) next.status = 'on_hold'
      // Si un envío falló por número inválido y se corrige el teléfono, vuelve a pendiente.
      if (data.phone !== undefined && data.phone !== current.phone && ['failed', 'no_whatsapp'].includes(current.status) && next.whatsapp_opt_in === 1) { next.status = 'pending'; next.attempts = 0; next.last_error = null }
      try {
        db.prepare('UPDATE prospects SET dni=?, name=?, phone=?, offer_amount=?, rate=?, notes=?, whatsapp_opt_in=?, status=?, attempts=?, last_error=?, updated_at=? WHERE id=?')
          .run(next.dni, next.name, next.phone, next.offer_amount, next.rate, next.notes, next.whatsapp_opt_in, next.status, next.attempts, next.last_error, nowIso(), id)
      } catch (error) {
        const msg = uniqueConflict(error)
        if (msg) throw new HttpError(409, msg)
        throw error
      }
      const changes: Record<string, [unknown, unknown]> = {}
      for (const k of ['dni', 'name', 'phone', 'offer_amount', 'rate', 'notes', 'whatsapp_opt_in', 'status'] as const) if (current[k] !== next[k]) changes[k] = [current[k], next[k]]
      if (Object.keys(changes).length) audit(actor(request), 'prospect.update', 'prospect', id, next.name, changes)
      return { prospect: toProspect(db.prepare('SELECT * FROM prospects WHERE id = ?').get(id)) }
    })

    api.delete('/api/prospects/:id', async (request) => {
      const id = Number((request.params as any).id)
      const force = (request.query as any).force === 'true'
      const current = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id) as any
      if (!current) throw new HttpError(404, 'Prospecto no encontrado.')
      if (current.status === 'sending') throw new HttpError(409, 'El mensaje se está enviando en este momento.')
      if (current.status === 'sent' && !force) throw new HttpError(409, 'Este cliente ya fue contactado. Confirma para eliminarlo (el registro del envío se conserva).')
      db.prepare('DELETE FROM prospects WHERE id = ?').run(id)
      audit(actor(request), 'prospect.delete', 'prospect', id, current.name, { dni: current.dni, phone: current.phone, status: current.status })
      return { ok: true }
    })

    api.post('/api/prospects/:id/resend', async (request) => {
      const id = Number((request.params as any).id)
      const current = db.prepare('SELECT * FROM prospects WHERE id = ?').get(id) as any
      if (!current) throw new HttpError(404, 'Prospecto no encontrado.')
      if (current.status === 'sending') throw new HttpError(409, 'El mensaje se está enviando en este momento.')
      if (current.status === 'opted_out') throw new HttpError(409, 'El cliente pidió no recibir mensajes.')
      if (current.whatsapp_opt_in !== 1) throw new HttpError(409, 'No se puede reenviar: falta la autorización de WhatsApp.')
      tx(() => {
        db.prepare(`UPDATE messages SET status = 'superseded' WHERE prospect_id = ? AND status IN ('sent','unknown','failed')`).run(id)
        db.prepare(`UPDATE prospects SET status = 'pending', attempts = 0, last_error = NULL, sent_at = NULL, updated_at = ? WHERE id = ? AND whatsapp_opt_in = 1`).run(nowIso(), id)
      })
      audit(actor(request), 'prospect.requeue', 'prospect', id, current.name, `Estado anterior: ${current.status}`)
      return { prospect: toProspect(db.prepare('SELECT * FROM prospects WHERE id = ?').get(id)) }
    })

    api.post('/api/prospects/bulk', async (request) => {
      const { action, ids } = request.body as { action: string; ids: number[] }
      if (!Array.isArray(ids) || !ids.length || ids.length > 5000) throw bad('Selecciona al menos un prospecto.')
      const list = ids.map(Number).filter(Number.isInteger)
      const marks = list.map(() => '?').join(',')
      let affected = 0
      if (action === 'delete') {
        affected = Number(db.prepare(`DELETE FROM prospects WHERE id IN (${marks}) AND status NOT IN ('sent','sending')`).run(...list).changes)
      } else if (action === 'hold') {
        affected = Number(db.prepare(`UPDATE prospects SET status='on_hold', updated_at=? WHERE id IN (${marks}) AND status IN ('pending','failed','no_whatsapp')`).run(nowIso(), ...list).changes)
      } else if (action === 'release') {
        affected = Number(db.prepare(`UPDATE prospects SET status='pending', attempts=0, last_error=NULL, updated_at=? WHERE id IN (${marks}) AND status IN ('on_hold','failed','no_whatsapp') AND whatsapp_opt_in = 1`).run(nowIso(), ...list).changes)
      } else throw bad('Acción no válida.')
      audit(actor(request), `prospects.bulk_${action}`, 'prospect', null, `${affected} de ${list.length}`)
      return { affected, skipped: list.length - affected }
    })

    api.post('/api/prospects/import', async (request) => {
      const { rows } = request.body as { rows: any[] }
      if (!Array.isArray(rows) || !rows.length) throw bad('El archivo no tiene filas.')
      if (rows.length > 20000) throw bad('Máximo 20 000 filas por importación.')
      const invalid: { row: number; reason: string }[] = []
      const duplicates: { row: number; reason: string }[] = []
      let created = 0
      let onHold = 0
      tx(() => {
        const insert = db.prepare('INSERT INTO prospects(dni,name,phone,offer_amount,rate,notes,whatsapp_opt_in,status) VALUES(?,?,?,?,?,?,?,?)')
        rows.forEach((raw, index) => {
          try {
            const data = parseProspectInput(raw, false)
            const initialStatus = data.whatsappOptIn ? 'pending' : 'on_hold'
            insert.run(data.dni!, data.name!, data.phone!, data.offerAmount ?? null, data.rate ?? null, data.notes ?? '', data.whatsappOptIn ? 1 : 0, initialStatus)
            created++
            if (!data.whatsappOptIn) onHold++
          } catch (error) {
            const dup = uniqueConflict(error)
            if (dup) duplicates.push({ row: index + 2, reason: dup })
            else invalid.push({ row: index + 2, reason: error instanceof HttpError ? error.message : 'Fila no válida.' })
          }
        })
      })
      audit(actor(request), 'prospects.import', 'prospect', null, `${created} nuevos`, { created, onHold, duplicates: duplicates.length, invalid: invalid.length })
      return { created, onHold, duplicates: duplicates.length, invalid: invalid.length, duplicateRows: duplicates.slice(0, 50), invalidRows: invalid.slice(0, 50) }
    })

    // ----- Campaña -----
    api.get('/api/campaign', async () => queue.snapshot())
    api.post('/api/campaign/:action', async (request) => {
      const action = (request.params as any).action
      const who = actor(request)
      if (action === 'start') {
        const result = queue.start(who)
        if (!result.ok) throw new HttpError(409, result.error)
      } else if (action === 'pause') queue.pause(who)
      else if (action === 'stop') queue.stop(who)
      else throw new HttpError(404, 'Acción no válida.')
      return queue.snapshot()
    })

    // ----- WhatsApp -----
    api.get('/api/whatsapp/status', async () => whatsapp.refresh())
    api.post('/api/whatsapp/connect', async (request) => whatsapp.connect(actor(request)))
    api.post('/api/whatsapp/disconnect', async (request) => {
      if (queue.status === 'running') queue.pause(actor(request))
      return whatsapp.disconnect(actor(request))
    })
    api.post('/api/whatsapp/reset', async (request) => {
      if (queue.status === 'running') queue.pause(actor(request))
      return whatsapp.reset(actor(request))
    })
    api.post('/api/whatsapp/test', async (request) => {
      const phone = normalizePhone(String((request.body as any)?.phone ?? ''))
      if (!phone) throw bad('Escribe un celular válido de 9 dígitos.')
      const status = await whatsapp.refresh(true)
      if (status.state !== 'connected') throw new HttpError(409, 'Conecta WhatsApp antes de enviar una prueba.')
      if (!status.phone || phone !== status.phone) throw new HttpError(403, 'El mensaje de prueba solo se puede enviar al mismo número conectado.')
      const body = renderMessage(getSettings().messageTemplate, { name: 'Cliente de prueba', offer_amount: 25000, rate: 11.9 })
      await evolution.sendText(config.instanceName, phone, `[PRUEBA] ${body}`, 0)
      audit(actor(request), 'whatsapp.test', 'whatsapp', null, 'Mensaje de prueba', phone)
      return { ok: true }
    })

    // ----- Configuración -----
    api.get('/api/settings', async () => ({ ...getSettings(), defaultTemplate: DEFAULT_TEMPLATE, evolutionConfigured: Boolean(config.evolutionUrl && config.evolutionKey) }))
    api.put('/api/settings', async (request) => {
      const b = request.body as any
      const s = getSettings()
      const next = { ...s }
      if (b.messageTemplate !== undefined) {
        const t = String(b.messageTemplate)
        if (!t.trim() || t.length > 1500) throw bad('La plantilla debe tener entre 1 y 1500 caracteres.')
        next.messageTemplate = t
      }
      for (const k of ['dailyLimit', 'delayMin', 'delayMax'] as const) if (b[k] !== undefined) next[k] = Number(b[k])
      if (!Number.isInteger(next.dailyLimit) || next.dailyLimit < 1 || next.dailyLimit > 1000) throw bad('El límite diario debe estar entre 1 y 1000.')
      if (!(next.delayMin >= 5 && next.delayMin <= 600)) throw bad('La pausa mínima debe estar entre 5 y 600 segundos.')
      if (!(next.delayMax >= next.delayMin && next.delayMax <= 1800)) throw bad('La pausa máxima debe ser mayor o igual a la mínima (máx. 1800 s).')
      for (const k of ['windowStart', 'windowEnd'] as const) {
        if (b[k] !== undefined) { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(b[k]))) throw bad('Horario no válido (HH:MM).'); next[k] = String(b[k]) }
      }
      for (const [k, v] of Object.entries(next)) setRaw(k, String(v))
      audit(actor(request), 'settings.update', 'settings', null, 'Configuración', next)
      return getSettings()
    })

    // ----- Historial -----
    api.get('/api/events', async (request) => {
      const q = request.query as any
      const where: string[] = []; const params: (string | number)[] = []
      if (q.q) { const like = `%${String(q.q).toLowerCase()}%`; where.push('(lower(label) LIKE ? OR lower(action) LIKE ? OR lower(detail) LIKE ?)'); params.push(like, like, like) }
      if (q.entity && q.entity !== 'all') { where.push('entity = ?'); params.push(String(q.entity)) }
      const sql = where.length ? `WHERE ${where.join(' AND ')}` : ''
      const pageSize = Math.min(200, Math.max(5, Number(q.pageSize) || 30)); const page = Math.max(1, Number(q.page) || 1)
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM audit_log ${sql}`).get(...params) as any).n
      const items = db.prepare(`SELECT * FROM audit_log ${sql} ORDER BY id DESC LIMIT ? OFFSET ?`).all(...params, pageSize, (page - 1) * pageSize)
      return { items, total, page, pageSize }
    })
    api.get('/api/events/export.csv', async (_request, reply) => {
      const rows = db.prepare('SELECT * FROM audit_log ORDER BY id DESC LIMIT 50000').all() as any[]
      return sendCsv(reply, 'buybot-historial.csv', [['Fecha', 'Quién', 'Acción', 'Detalle', 'Referencia'], ...rows.map((r) => [r.ts, r.actor, r.action, r.label, r.detail])])
    })
    api.get('/api/messages/today', async () => {
      const items = db.prepare(`SELECT id, prospect_id AS prospectId, name, phone, status, sent_at AS sentAt FROM messages WHERE status = 'sent' AND sent_at >= ? ORDER BY id DESC LIMIT 20`).all(startOfLocalDay())
      return { items }
    })

    // ----- Respaldo -----
    api.get('/api/backup', async (request, reply) => {
      const file = copyForDownload()
      audit(actor(request), 'backup.download', 'system', null, 'Descargó un respaldo')
      const stream = createReadStream(file)
      stream.on('close', () => rmSync(file, { force: true }))
      return reply.header('Content-Type', 'application/octet-stream').header('Content-Disposition', `attachment; filename="buybot-respaldo-${new Date().toISOString().slice(0, 10)}.db"`).send(stream)
    })
  })
}
