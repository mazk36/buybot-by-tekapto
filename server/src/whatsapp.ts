import { config } from './config.js'
import { audit, getRaw, setRaw, webhookSecret } from './db.js'
import { EvolutionError, evolution, evolutionConfigured } from './evolution.js'

export type WaState = 'evolution_not_configured' | 'evolution_unreachable' | 'no_instance' | 'disconnected' | 'connecting' | 'connected'

export interface WaStatus {
  state: WaState
  qr: string | null
  qrAgeSeconds: number | null
  pairingCode: string | null
  phone: string | null
  profileName: string | null
  wantConnected: boolean
  message: string | null
  checkedAt: string | null
}

const QR_TTL_MS = 24_000
const RECONNECT_EVERY_MS = 4_000
const CACHE_MS = 1_500

class WhatsAppService {
  private status: WaStatus = {
    state: evolutionConfigured() ? 'disconnected' : 'evolution_not_configured',
    qr: null, qrAgeSeconds: null, pairingCode: null, phone: null, profileName: null,
    wantConnected: getRaw('wa_want_connected') === '1', message: null, checkedAt: null,
  }
  private qrAt = 0
  private lastReconnectAt = 0
  private lastRefreshAt = 0
  private inflight: Promise<WaStatus> | null = null
  private previous: WaState | null = null

  private get name() { return config.instanceName }

  get snapshot(): WaStatus {
    return { ...this.status, qrAgeSeconds: this.qrAt ? Math.round((Date.now() - this.qrAt) / 1000) : null }
  }

  get connected() { return this.status.state === 'connected' }

  /** Consulta el estado real en Evolution (con caché corto y una sola consulta simultánea). */
  refresh(force = false): Promise<WaStatus> {
    if (this.inflight) return this.inflight
    if (!force && Date.now() - this.lastRefreshAt < CACHE_MS) return Promise.resolve(this.snapshot)
    this.inflight = this.doRefresh().finally(() => { this.inflight = null; this.lastRefreshAt = Date.now() })
    return this.inflight
  }

  private set(patch: Partial<WaStatus>) {
    this.status = { ...this.status, ...patch, checkedAt: new Date().toISOString() }
    if (this.status.state !== this.previous) {
      if (this.previous !== null) audit('sistema', 'whatsapp.state', 'whatsapp', null, this.status.state, this.status.message ?? '')
      this.previous = this.status.state
    }
  }

  private async doRefresh(): Promise<WaStatus> {
    if (!evolutionConfigured()) {
      this.set({ state: 'evolution_not_configured', qr: null, message: 'Falta configurar EVOLUTION_API_URL y EVOLUTION_API_KEY en el servidor.' })
      return this.snapshot
    }
    try {
      const instance = await evolution.fetchInstance(this.name)
      if (!instance) {
        this.set({ state: 'no_instance', qr: null, pairingCode: null, phone: null, profileName: null, message: null })
        if (this.status.wantConnected) await this.startConnection()
        return this.snapshot
      }
      const state = await evolution.state(this.name)
      if (state === 'open') {
        this.qrAt = 0
        this.lastReconnectAt = 0
        this.set({
          state: 'connected', qr: null, pairingCode: null, message: null,
          phone: instance.ownerJid ? instance.ownerJid.split('@')[0].split(':')[0] : this.status.phone,
          profileName: instance.profileName ?? this.status.profileName,
        })
        return this.snapshot
      }
      // No conectado: ¿el usuario quiere estar conectado? Entonces mantenemos un QR vigente.
      if (this.status.wantConnected) {
        const qrExpired = !this.status.qr || Date.now() - this.qrAt > QR_TTL_MS
        const canRetry = Date.now() - this.lastReconnectAt > (this.status.qr ? QR_TTL_MS : RECONNECT_EVERY_MS)
        if (qrExpired && canRetry) await this.fetchQr()
        this.set({ state: 'connecting', phone: null, message: null })
      } else {
        this.set({ state: 'disconnected', qr: null, pairingCode: null, phone: null, message: null })
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido'
      this.set({ state: 'evolution_unreachable', message })
    }
    return this.snapshot
  }

  private async fetchQr() {
    this.lastReconnectAt = Date.now()
    const result = await evolution.connect(this.name)
    if (result.base64) {
      this.qrAt = Date.now()
      this.status.qr = result.base64.startsWith('data:') ? result.base64 : `data:image/png;base64,${result.base64}`
      this.status.pairingCode = result.pairingCode ?? null
    } else if (!result.code && !result.pairingCode) {
      // Evolution aún no generó el QR; se reintenta en la siguiente consulta.
      this.status.qr = null
    }
  }

  private async startConnection() {
    const instance = await evolution.fetchInstance(this.name)
    if (!instance) {
      const webhookUrl = config.webhookBase ? `${config.webhookBase}/api/webhooks/evolution?secret=${webhookSecret()}` : undefined
      await evolution.create(this.name, webhookUrl)
    }
    await this.fetchQr()
    this.set({ state: 'connecting' })
  }

  async connect(actor: string): Promise<WaStatus> {
    if (!evolutionConfigured()) return this.refresh(true)
    this.status.wantConnected = true
    setRaw('wa_want_connected', '1')
    try {
      const instance = await evolution.fetchInstance(this.name)
      if (instance && (await evolution.state(this.name)) === 'open') return this.refresh(true)
      await this.startConnection()
      audit(actor, 'whatsapp.connect', 'whatsapp', null, 'Solicitó conexión por QR')
    } catch (error) {
      this.set({ state: 'evolution_unreachable', message: error instanceof Error ? error.message : 'Error de conexión' })
    }
    return this.refresh(true)
  }

  async disconnect(actor: string): Promise<WaStatus> {
    this.status.wantConnected = false
    setRaw('wa_want_connected', '0')
    this.qrAt = 0
    try {
      await evolution.logout(this.name)
    } catch (error) {
      // Si ya estaba desconectado Evolution responde con error; no es un fallo real.
      if (!(error instanceof EvolutionError) || error.kind !== 'http') {
        this.set({ state: 'evolution_unreachable', message: error instanceof Error ? error.message : 'Error de conexión' })
        return this.snapshot
      }
    }
    audit(actor, 'whatsapp.disconnect', 'whatsapp', null, 'Cerró la sesión de WhatsApp')
    this.set({ state: 'disconnected', qr: null, pairingCode: null, phone: null, profileName: null, message: null })
    return this.refresh(true)
  }

  /** Borra la instancia por completo (para destrabar un QR que no aparece o una sesión corrupta). */
  async reset(actor: string): Promise<WaStatus> {
    this.qrAt = 0
    try {
      try { await evolution.logout(this.name) } catch { /* puede no estar conectada */ }
      await evolution.remove(this.name)
    } catch (error) {
      if (!(error instanceof EvolutionError) || error.status !== 404) {
        this.set({ state: 'evolution_unreachable', message: error instanceof Error ? error.message : 'Error de conexión' })
        return this.snapshot
      }
    }
    audit(actor, 'whatsapp.reset', 'whatsapp', null, 'Reinició la instancia de WhatsApp')
    this.status.wantConnected = true
    setRaw('wa_want_connected', '1')
    this.set({ state: 'no_instance', qr: null, pairingCode: null, phone: null, profileName: null })
    return this.connect(actor)
  }

  /** Eventos del webhook: refresco inmediato. */
  poke() { void this.refresh(true) }
}

export const whatsapp = new WhatsAppService()
