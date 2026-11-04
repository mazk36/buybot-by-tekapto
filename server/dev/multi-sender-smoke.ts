// Prueba aislada: solo usa la API simulada y una base temporal, nunca WhatsApp real.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const tmp = mkdtempSync(join(tmpdir(), 'buybot-multisender-'))
const children: ChildProcess[] = []
let cookie = ''

async function freePort(): Promise<number> {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  return port
}

function launch(file: string, env: Record<string, string>) {
  const child = spawn(process.execPath, ['--import', 'tsx', file], {
    cwd: process.cwd(), env: { PATH: process.env.PATH, ...env }, stdio: 'ignore',
  })
  children.push(child)
  return child
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return
  child.kill('SIGTERM')
  await Promise.race([new Promise<void>((resolve) => child.once('exit', () => resolve())), sleep(3000)])
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function run() {
  const mockPort = await freePort()
  const apiPort = await freePort()
  const apiUrl = `http://127.0.0.1:${apiPort}`
  const mockUrl = `http://127.0.0.1:${mockPort}`
  launch('server/dev/mock-evolution.ts', { MOCK_PORT: String(mockPort), MOCK_KEY: 'dev-key' })
  const appEnv = {
    PORT: String(apiPort), HOST: '127.0.0.1', DATA_DIR: tmp, WEB_DIR: join(tmp, 'no-web'),
    EVOLUTION_API_URL: mockUrl, EVOLUTION_API_KEY: 'dev-key', EVOLUTION_INSTANCE: 'buybot', TZ: 'America/Lima',
  }
  let app = launch('server/src/index.ts', appEnv)

  async function request(method: string, path: string, body?: unknown, base = apiUrl) {
    const res = await fetch(base + path, {
      method, headers: { 'Content-Type': 'application/json', cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    const set = res.headers.get('set-cookie')
    if (set) cookie = set.split(';')[0]
    const data = await res.json() as any
    return { status: res.status, data }
  }
  async function waitFor(check: () => Promise<boolean>, description: string, timeout = 20000) {
    const until = Date.now() + timeout
    while (Date.now() < until) {
      try { if (await check()) return } catch { /* el servidor puede estar arrancando */ }
      await sleep(300)
    }
    throw new Error(`Tiempo agotado: ${description}`)
  }
  await waitFor(async () => (await request('GET', '/api/health')).status === 200, 'arranque')
  assert.equal((await request('POST', '/api/auth/setup', { email: 'qa@example.test', password: 'clave-prueba-segura', name: 'QA' })).status, 200)
  assert.equal((await request('PUT', '/api/settings', { dailyLimit: 1, delayMin: 5, delayMax: 5, windowStart: '00:00', windowEnd: '23:59', messageTemplate: 'Hola [nombre]' })).status, 200)

  const second = (await request('POST', '/api/whatsapp/accounts', { label: 'Segundo' })).data.id as string
  const duplicate = (await request('POST', '/api/whatsapp/accounts', { label: 'Mismo teléfono' })).data.id as string
  for (const [id, phone] of [['buybot', '51999000111'], [second, '51999000222'], [duplicate, '51999000111']]) {
    const connected = await request('POST', `/api/whatsapp/accounts/${id}/connect`)
    assert.equal(connected.data.state, 'connecting')
    assert.ok(connected.data.qr)
    await request('POST', `/__mock/scan?name=${encodeURIComponent(id)}&phone=${phone}`, {}, mockUrl)
  }
  await waitFor(async () => {
    const accounts = (await request('GET', '/api/whatsapp/accounts')).data.accounts
    return accounts.length === 3 && accounts.every((account: any) => account.status.state === 'connected')
  }, 'conexión simulada')

  const existing = await request('POST', '/api/prospects', { dni: '70000009', name: 'Ejemplo Antiguo', phone: '999555109' })
  assert.equal(existing.status, 201)
  const associated = await request('POST', '/api/prospects/import', { sourceName: 'base-antigua.xlsx', assignExisting: true, consentAll: true, rows: [{ dni: '70000009', phone: '999555109', rate: 999 }] })
  assert.equal(associated.data.reassigned, 1)
  assert.equal(associated.data.created, 0)
  const unchanged = (await request('GET', `/api/prospects/${existing.data.prospect.id}`)).data.prospect
  assert.equal(unchanged.status, 'on_hold')
  assert.equal(unchanged.whatsappOptIn, false)
  assert.equal(unchanged.name, 'Ejemplo Antiguo')

  for (let i = 1; i <= 3; i++) {
    const result = await request('POST', '/api/prospects', { dni: `7000000${i}`, name: 'Carlos Pérez Flores', messageName: 'Carlos Pérez', phone: `99955510${i}`, whatsappOptIn: true })
    assert.equal(result.status, 201)
  }
  assert.equal((await request('POST', '/api/campaign/start')).status, 200)
  await waitFor(async () => {
    const status = (await request('GET', '/api/stats')).data
    return status.counts.sent === 2 && status.campaign.reason === 'daily_limit'
  }, 'reparto y límite por teléfono', 30000)
  const sent = (await request('GET', '/__mock/sent', undefined, mockUrl)).data as any[]
  assert.equal(sent.length, 2)
  assert.deepEqual(new Set(sent.map((message) => message.instance)), new Set(['buybot', second]))
  assert.ok(sent.every((message) => message.text === 'Hola Carlos Pérez'))
  const accounts = (await request('GET', '/api/whatsapp/accounts')).data.accounts as any[]
  assert.deepEqual(accounts.map((account) => account.sentToday), [1, 1, 1])
  assert.equal((await request('POST', `/api/whatsapp/accounts/${duplicate}/test`, { phone: '999000111' })).status, 409)

  await stop(app)
  app = launch('server/src/index.ts', appEnv)
  await waitFor(async () => (await request('GET', '/api/health')).status === 200, 'reinicio')
  const afterRestart = (await request('GET', '/api/whatsapp/accounts')).data.accounts as any[]
  assert.equal(afterRestart.length, 3)
  assert.deepEqual(afterRestart.map((account) => account.sentToday), [1, 1, 1])
  assert.equal((await request('GET', '/api/stats')).data.campaign.status, 'paused')
  console.log('OK: QR simulado, reparto entre números, límite compartido por teléfono y persistencia tras reiniciar.')
}

try { await run() }
finally {
  for (const child of children) await stop(child)
  rmSync(tmp, { recursive: true, force: true })
}
