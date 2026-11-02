import { createHash, randomBytes, scrypt as scryptCb, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { audit, db } from './db.js'
import { config } from './config.js'

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>
export const COOKIE = 'buybot_session'
const SESSION_DAYS = 30

export interface SessionUser { id: number; email: string; name: string }

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, 64)
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, keyHex] = stored.split('$')
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false
  const key = await scrypt(password, Buffer.from(saltHex, 'hex'), 64)
  const expected = Buffer.from(keyHex, 'hex')
  return key.length === expected.length && timingSafeEqual(key, expected)
}

const sha = (value: string) => createHash('sha256').update(value).digest('hex')

export function userCount(): number {
  return (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n
}

export function createSession(userId: number): string {
  const token = randomBytes(32).toString('hex')
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString()
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)').run(sha(token), userId, expires)
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(new Date().toISOString())
  return token
}

export function destroySession(token: string) {
  db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha(token))
}

export function destroyOtherSessions(userId: number, keepToken: string) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').run(userId, sha(keepToken))
}

export function userFromToken(token: string | undefined): SessionUser | null {
  if (!token) return null
  const row = db.prepare(
    `SELECT u.id, u.email, u.name FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).get(sha(token), new Date().toISOString()) as SessionUser | undefined
  return row ?? null
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', secure: config.secureCookie, path: '/', maxAge: SESSION_DAYS * 86_400,
  })
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = userFromToken(request.cookies[COOKIE])
  if (!user) return reply.code(401).send({ error: 'Inicia sesión para continuar.' })
  request.user = user
}

declare module 'fastify' {
  interface FastifyRequest { user?: SessionUser }
}

// Limitador sencillo contra fuerza bruta (en memoria).
const attempts = new Map<string, { count: number; until: number }>()
export function loginBlocked(key: string): number {
  const entry = attempts.get(key)
  return entry && entry.count >= 5 && entry.until > Date.now() ? Math.ceil((entry.until - Date.now()) / 1000) : 0
}
export function loginFailed(key: string) {
  const entry = attempts.get(key)
  if (!entry || entry.until < Date.now()) attempts.set(key, { count: 1, until: Date.now() + 15 * 60_000 })
  else entry.count += 1
}
export function loginOk(key: string) { attempts.delete(key) }

export async function bootstrapAdmin() {
  if (userCount() > 0 || !config.bootstrapEmail || !config.bootstrapPassword) return
  const hash = await hashPassword(config.bootstrapPassword)
  db.prepare('INSERT INTO users(email,name,password_hash) VALUES(?,?,?)').run(config.bootstrapEmail, 'Administrador', hash)
  audit('sistema', 'user.create', 'user', null, config.bootstrapEmail, 'Cuenta inicial desde variables de entorno')
}
