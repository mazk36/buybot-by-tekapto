// Evolution API simulado SOLO para desarrollo y pruebas locales (no se usa en producción).
// Ejecutar: pnpm mock:evolution   → http://localhost:8080  (apikey: dev-key)
import { createServer } from 'node:http'

const KEY = process.env.MOCK_KEY ?? 'dev-key'
const PORT = Number(process.env.MOCK_PORT ?? 8080)
type Inst = { name: string; state: 'close' | 'connecting' | 'open'; qrCount: number; owner?: string }
const instances = new Map<string, Inst>()
const sent: { number: string; text: string; at: string }[] = []
let failNext: 'none' | 'http' | 'hang' = 'none'

// PNG 1x1 como QR de prueba (el frontend solo necesita una imagen base64).
const qrPng = (n: number) => `data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==#${n}`

function json(res: any, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify(body))
}

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x')
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString() || '{}') : {}
  const parts = url.pathname.split('/').filter(Boolean)

  // Controles del simulador
  if (parts[0] === '__mock') {
    if (parts[1] === 'scan') { for (const i of instances.values()) if (i.state === 'connecting') { i.state = 'open'; i.owner = '51999000111@s.whatsapp.net' } return json(res, 200, { ok: true }) }
    if (parts[1] === 'drop') { for (const i of instances.values()) i.state = 'close'; return json(res, 200, { ok: true }) }
    if (parts[1] === 'fail') { failNext = (url.searchParams.get('mode') as any) ?? 'http'; return json(res, 200, { ok: true }) }
    if (parts[1] === 'sent') return json(res, 200, sent)
    return json(res, 404, {})
  }

  if (req.headers.apikey !== KEY) return json(res, 401, { status: 401, error: 'Unauthorized' })
  const [a, b, name] = parts
  const inst = name ? instances.get(name) : undefined

  if (a === 'instance' && b === 'fetchInstances') {
    const n = url.searchParams.get('instanceName')
    const found = n ? instances.get(n) : null
    if (n && !found) return json(res, 404, { status: 404, response: { message: [`Instance ${n} not found`] } })
    return json(res, 200, found ? [{ name: found.name, connectionStatus: found.state, ownerJid: found.owner, profileName: found.owner ? 'Vendedora' : undefined }] : [])
  }
  if (a === 'instance' && b === 'create') {
    if (instances.has(body.instanceName)) return json(res, 403, { status: 403, response: { message: ['This name is already in use.'] } })
    instances.set(body.instanceName, { name: body.instanceName, state: 'connecting', qrCount: 1 })
    return json(res, 201, { instance: { instanceName: body.instanceName, status: 'created' } })
  }
  if (a === 'instance' && b === 'connect' && inst) {
    if (inst.state === 'open') return json(res, 200, { instance: { state: 'open' } })
    inst.state = 'connecting'; inst.qrCount++
    return json(res, 200, { pairingCode: null, code: `2@mock${inst.qrCount}`, base64: qrPng(inst.qrCount), count: inst.qrCount })
  }
  if (a === 'instance' && b === 'connectionState' && inst) return json(res, 200, { instance: { instanceName: inst.name, state: inst.state } })
  if (a === 'instance' && b === 'logout' && inst) { inst.state = 'close'; inst.owner = undefined; return json(res, 200, { status: 'SUCCESS' }) }
  if (a === 'instance' && b === 'delete' && inst) { instances.delete(inst.name); return json(res, 200, { status: 'SUCCESS' }) }
  if (a === 'instance' && b === 'restart' && inst) return json(res, 200, { instance: { state: inst.state } })
  if (a === 'webhook') return json(res, 200, { ok: true })
  if (a === 'chat' && b === 'whatsappNumbers' && inst) {
    return json(res, 200, (body.numbers as string[]).map((n) => ({ exists: !n.endsWith('0'), jid: `${n}@s.whatsapp.net`, number: n })))
  }
  if (a === 'message' && b === 'sendText' && inst) {
    if (inst.state !== 'open') return json(res, 400, { status: 400, response: { message: ['Connection Closed'] } })
    if (failNext === 'http') { failNext = 'none'; return json(res, 500, { status: 500, response: { message: ['Internal error'] } }) }
    if (failNext === 'hang') { failNext = 'none'; return } // nunca responde → timeout
    sent.push({ number: body.number, text: body.text, at: new Date().toISOString() })
    return json(res, 201, { key: { id: `MOCK${sent.length}` }, status: 'PENDING' })
  }
  return json(res, 404, { status: 404, error: 'Not Found', path: url.pathname })
}).listen(PORT, () => console.log(`Evolution simulado en http://localhost:${PORT} (apikey: ${KEY})`))
