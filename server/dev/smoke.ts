// Prueba de humo de punta a punta contra un servidor y un Evolution simulado ya levantados.
// pnpm mock:evolution  +  pnpm start  →  pnpm test:smoke
const API = process.env.API ?? 'http://localhost:8787'
const MOCK = process.env.MOCK ?? 'http://localhost:8080'
let cookie = ''
let failures = 0
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function req(method: string, path: string, body?: unknown, base = API) {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', cookie }, body: body === undefined ? undefined : JSON.stringify(body) })
  const set = res.headers.get('set-cookie')
  if (set) cookie = set.split(';')[0]
  const text = await res.text()
  let data: any = text
  try { data = JSON.parse(text) } catch { /* texto */ }
  return { status: res.status, data }
}
function check(name: string, ok: boolean, extra?: unknown) {
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` → ${JSON.stringify(extra)}`}`)
  if (!ok) failures++
}

const unauth = await req('GET', '/api/stats')
check('API protegida sin sesión (401)', unauth.status === 401)

const me = await req('GET', '/api/auth/me')
if (me.data.needsSetup) {
  const setup = await req('POST', '/api/auth/setup', { email: 'vendedora@test.pe', password: 'clave-segura-1', name: 'Cristina' })
  check('Crear cuenta inicial', setup.status === 200, setup.data)
} else {
  const bad = await req('POST', '/api/auth/login', { email: 'vendedora@test.pe', password: 'mala' })
  check('Login con clave incorrecta rechazado', bad.status === 401, bad.data)
  const login = await req('POST', '/api/auth/login', { email: 'vendedora@test.pe', password: 'clave-segura-1' })
  check('Login correcto', login.status === 200, login.data)
}

// Prospectos
await req('PUT', '/api/settings', { dailyLimit: 100, delayMin: 5, delayMax: 5, windowStart: '00:00', windowEnd: '23:59', messageTemplate: 'Hola [nombre], oferta de [monto] a [tasa].' })
const created = await req('POST', '/api/prospects', { dni: '70000001', name: 'carlos MENDOZA', phone: '999 555 101', offerAmount: '32,500', rate: '11.9', whatsappOptIn: true })
check('Crear prospecto (nombre normalizado, teléfono 51…)', created.status === 201 && created.data.prospect.name === 'Carlos Mendoza' && created.data.prospect.phone === '51999555101', created.data)
const noConsent = await req('POST', '/api/prospects', { dni: '70000010', name: 'Sin autorización', phone: '999555106' })
check('Sin autorización queda en espera', noConsent.status === 201 && noConsent.data.prospect.status === 'on_hold' && !noConsent.data.prospect.whatsappOptIn, noConsent.data)
const noConsentRelease = await req('PATCH', `/api/prospects/${noConsent.data.prospect.id}`, { status: 'pending' })
check('No se libera un contacto sin autorización', noConsentRelease.status === 409, noConsentRelease.data)
const dup = await req('POST', '/api/prospects', { dni: '70000001', name: 'Otro', phone: '999555102', whatsappOptIn: true })
check('DNI duplicado rechazado (409)', dup.status === 409, dup.data)
const badPhone = await req('POST', '/api/prospects', { dni: '70000009', name: 'Sin telefono', phone: '12345' })
check('Teléfono inválido rechazado (400)', badPhone.status === 400, badPhone.data)

const imp = await req('POST', '/api/prospects/import', { rows: [
  { dni: '70000002', name: 'ana torres', phone: '999555102', offerAmount: 18000, rate: 12.5, whatsappOptIn: true },
  { dni: '70000003', name: 'sin whatsapp', phone: '999555100', offerAmount: 20000, rate: 12, whatsappOptIn: true },   // termina en 0 → no existe en el mock
  { dni: '70000004', name: 'sin datos', phone: '999555104', whatsappOptIn: true },                                      // sin monto/tasa → no se envía
  { dni: '70000001', name: 'dup', phone: '999555199', whatsappOptIn: true },
  { dni: 'abc', name: 'mala fila', phone: '999555198' },
] })
check('Importar: 3 nuevos, 1 duplicado, 1 inválido', imp.data.created === 3 && imp.data.duplicates === 1 && imp.data.invalid === 1, imp.data)

// WhatsApp sin conectar
const startNoWa = await req('POST', '/api/campaign/start')
check('Iniciar campaña permitido (espera conexión)', startNoWa.status === 200, startNoWa.data)
await sleep(2500)
let stats = (await req('GET', '/api/stats')).data
check('Sin WhatsApp la campaña queda esperando (no envía)', stats.campaign.reason === 'whatsapp_disconnected' && stats.counts.sent === 0, stats.campaign)
await req('POST', '/api/campaign/pause')

// QR y conexión
let wa = (await req('POST', '/api/whatsapp/connect')).data
check('Conectar entrega QR', wa.state === 'connecting' && Boolean(wa.qr), wa)
await req('POST', '/__mock/scan', {}, MOCK)
wa = (await req('GET', '/api/whatsapp/status')).data
await sleep(1600); wa = (await req('GET', '/api/whatsapp/status')).data
check('Tras escanear queda conectado con número', wa.state === 'connected' && wa.phone === '51999000111', wa)

// Caída y reconexión
await req('POST', '/__mock/drop', {}, MOCK)
await sleep(1600); wa = (await req('GET', '/api/whatsapp/status')).data
check('Si se cae la sesión vuelve a pedir QR', wa.state === 'connecting' && Boolean(wa.qr), wa)
await req('POST', '/__mock/scan', {}, MOCK)
await sleep(1600); wa = (await req('GET', '/api/whatsapp/status')).data
check('Reconecta correctamente', wa.state === 'connected', wa)

// Envío real a través del mock
await req('POST', '/api/campaign/start')
for (let i = 0; i < 40; i++) { await sleep(1000); stats = (await req('GET', '/api/stats')).data; if (stats.campaign.status !== 'running') break }
const sentLog = (await req('GET', '/api/mock', undefined, MOCK)).data
const sentMock = (await req('GET', '/__mock/sent', undefined, MOCK)).data
void sentLog
check('Envió solo a quienes tenían datos completos y WhatsApp', stats.counts.sent === 2 && stats.counts.no_whatsapp === 1 && stats.counts.pending === 1 && sentMock.length === 2, { counts: stats.counts, sentMock: sentMock.length })
check('Campaña terminó avisando faltantes', stats.campaign.status === 'stopped' && stats.campaign.reason === 'missing_data', stats.campaign)
check('Mensaje personalizado', sentMock[0]?.text === 'Hola Carlos Mendoza, oferta de S/ 32,500 a 11.90 %.' || /Carlos Mendoza/.test(sentMock[0]?.text ?? ''), sentMock[0])

// Protecciones de "ya enviados"
const list = (await req('GET', '/api/prospects?status=sent')).data
const sentOne = list.items[0]
const editPhone = await req('PATCH', `/api/prospects/${sentOne.id}`, { phone: '999555177' })
check('No se puede cambiar el teléfono de un cliente ya contactado', editPhone.status === 409, editPhone.data)
const delSent = await req('DELETE', `/api/prospects/${sentOne.id}`)
check('Eliminar un contactado exige confirmación', delSent.status === 409, delSent.data)
const editNotes = await req('PATCH', `/api/prospects/${sentOne.id}`, { notes: 'Llamar el lunes' })
check('Sí se pueden editar notas', editNotes.status === 200 && editNotes.data.prospect.notes === 'Llamar el lunes', editNotes.data)

// Completar datos y reenviar solo ese
const blocked = (await req('GET', '/api/prospects?status=pending')).data.items[0]
await req('PATCH', `/api/prospects/${blocked.id}`, { offerAmount: 22000, rate: 12.2 })

// Fallo HTTP → reintento
await req('GET', '/__mock/fail?mode=http', undefined, MOCK)
await req('POST', '/api/campaign/start')
for (let i = 0; i < 60; i++) { await sleep(1000); stats = (await req('GET', '/api/stats')).data; if (stats.counts.sent === 3) break }
check('Un fallo HTTP se reintenta y termina enviando', stats.counts.sent === 3, stats.counts)

// Webhook de opt-out
const secret = process.env.WEBHOOK_SECRET
if (secret) {
  const hook = await req('POST', `/api/webhooks/evolution?secret=${secret}`, { event: 'messages.upsert', data: { key: { remoteJid: '51999555101@s.whatsapp.net', fromMe: false }, message: { conversation: 'BAJA' } } })
  const after = (await req('GET', `/api/prospects/${sentOne.id}`)).data.prospect
  check('Respuesta BAJA marca opted_out', hook.status === 200 && after.status === 'opted_out', after)
}
const noSecret = await req('POST', '/api/webhooks/evolution?secret=mal', { event: 'x' })
check('Webhook sin secreto correcto rechazado', noSecret.status === 401)

// Desconectar
wa = (await req('POST', '/api/whatsapp/disconnect')).data
check('Desconectar deja el estado "desconectado"', wa.state === 'disconnected' && !wa.qr, wa)

const backup = await fetch(API + '/api/backup', { headers: { cookie } })
check('Respaldo descargable', backup.status === 200 && (await backup.arrayBuffer()).byteLength > 4096)

console.log(failures ? `\n${failures} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(failures ? 1 : 0)
