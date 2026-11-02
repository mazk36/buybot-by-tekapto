import Fastify from 'fastify'
import cookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { config } from './config.js'
import { autoBackup, db } from './db.js'
import { bootstrapAdmin } from './auth.js'
import { registerRoutes } from './routes.js'
import { queue } from './queue.js'
import { whatsapp } from './whatsapp.js'

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true, bodyLimit: 8 * 1024 * 1024 })
await app.register(cookie)
// Acepta POST sin cuerpo aunque el cliente envíe Content-Type: application/json.
app.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
  try { done(null, body ? JSON.parse(body as string) : {}) } catch { done(Object.assign(new Error('JSON no válido'), { statusCode: 400 }), undefined) }
})
await registerRoutes(app)

if (existsSync(join(config.webDir, 'index.html'))) {
  await app.register(fastifyStatic, { root: config.webDir })
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/')) return reply.code(404).send({ error: 'No encontrado' })
    return reply.sendFile('index.html')
  })
}

await bootstrapAdmin()
queue.init()
autoBackup()
const backupTimer = setInterval(() => { try { autoBackup() } catch (e) { app.log.error(e) } }, 6 * 3600_000)
// Mantiene vigente el estado de WhatsApp aunque nadie tenga la pantalla abierta (reconexión automática).
const waTimer = setInterval(() => void whatsapp.refresh(), 10_000)
void whatsapp.refresh(true)

const shutdown = async () => {
  clearInterval(backupTimer); clearInterval(waTimer); queue.shutdown()
  await app.close()
  db.close()
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

await app.listen({ port: config.port, host: config.host })
