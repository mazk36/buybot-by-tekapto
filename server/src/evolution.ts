import { config } from './config.js'

export class EvolutionError extends Error {
  constructor(message: string, readonly kind: 'unreachable' | 'timeout' | 'http', readonly status = 0) {
    super(message)
  }
}

export const evolutionConfigured = () => Boolean(config.evolutionUrl && config.evolutionKey)

async function call<T = any>(method: string, path: string, body?: unknown, timeoutMs = 12_000): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.evolutionUrl}${path}`, {
      method,
      headers: { apikey: config.evolutionKey, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    })
  } catch (error) {
    const timedOut = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    throw new EvolutionError(timedOut ? 'Evolution API no respondió a tiempo' : 'No se pudo conectar con Evolution API', timedOut ? 'timeout' : 'unreachable')
  }
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = text }
  if (!response.ok) {
    const message = response.status >= 500
      ? 'Evolution API presenta un error interno.'
      : 'Evolution API rechazó la solicitud.'
    throw new EvolutionError(message + ' (HTTP ' + response.status + ').', 'http', response.status)
  }
  return data as T
}

const enc = encodeURIComponent
const webhookEvents = ['CONNECTION_UPDATE', 'QRCODE_UPDATED', 'MESSAGES_UPSERT']

export const evolution = {
  async fetchInstance(name: string): Promise<{ name: string; status?: string; ownerJid?: string; profileName?: string } | null> {
    try {
      const data = await call<any>('GET', `/instance/fetchInstances?instanceName=${enc(name)}`)
      const first = Array.isArray(data) ? data[0] : data
      if (!first) return null
      const item = first.instance ?? first
      const found = item.name ?? item.instanceName
      if (found && found !== name) return null
      return { name, status: item.connectionStatus ?? item.status, ownerJid: item.ownerJid ?? item.owner, profileName: item.profileName }
    } catch (error) {
      if (error instanceof EvolutionError && error.status === 404) return null
      throw error
    }
  },
  create(name: string, webhookUrl?: string) {
    return call('POST', '/instance/create', {
      instanceName: name,
      qrcode: true,
      integration: 'WHATSAPP-BAILEYS',
      rejectCall: false,
      groupsIgnore: true,
      alwaysOnline: false,
      readMessages: false,
      readStatus: false,
      syncFullHistory: false,
      ...(webhookUrl ? { webhook: { url: webhookUrl, byEvents: false, base64: false, events: webhookEvents } } : {}),
    })
  },
  async connect(name: string): Promise<{ base64?: string; code?: string; pairingCode?: string }> {
    const data = await call<any>('GET', `/instance/connect/${enc(name)}`)
    return { base64: data?.base64 ?? data?.qrcode?.base64, code: data?.code, pairingCode: data?.pairingCode }
  },
  async state(name: string): Promise<'open' | 'connecting' | 'close'> {
    const data = await call<any>('GET', `/instance/connectionState/${enc(name)}`)
    const state = data?.instance?.state ?? data?.state
    return state === 'open' || state === 'connecting' ? state : 'close'
  },
  restart: (name: string) => call('PUT', `/instance/restart/${enc(name)}`),
  logout: (name: string) => call('DELETE', `/instance/logout/${enc(name)}`),
  remove: (name: string) => call('DELETE', `/instance/delete/${enc(name)}`),
  setWebhook: (name: string, url: string) =>
    call('POST', `/webhook/set/${enc(name)}`, { webhook: { enabled: true, url, byEvents: false, base64: false, events: webhookEvents } }),
  async checkNumber(name: string, number: string): Promise<boolean> {
    const data = await call<any[]>('POST', `/chat/whatsappNumbers/${enc(name)}`, { numbers: [number] })
    const first = Array.isArray(data) ? data[0] : null
    return Boolean(first?.exists)
  },
  async sendText(name: string, number: string, text: string, typingDelayMs: number): Promise<string | null> {
    const data = await call<any>('POST', `/message/sendText/${enc(name)}`, { number, text, delay: Math.round(typingDelayMs) }, 30_000)
    return data?.key?.id ?? null
  },
}
