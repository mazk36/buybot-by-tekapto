export type Status = 'pending' | 'sending' | 'sent' | 'failed' | 'no_whatsapp' | 'opted_out' | 'on_hold'
export type WaState = 'evolution_not_configured' | 'evolution_unreachable' | 'no_instance' | 'disconnected' | 'connecting' | 'connected'

export interface Prospect {
  id: number; dni: string; name: string; messageName: string | null; phone: string; offerAmount: number | null; rate: number | null; notes: string
  whatsappOptIn: boolean
  status: Status; attempts: number; lastError: string | null; sentAt: string | null; repliedAt: string | null; replyText: string | null
  createdAt: string; updatedAt: string
}
export interface WaStatus {
  state: WaState; qr: string | null; qrAgeSeconds: number | null; pairingCode: string | null; phone: string | null
  profileName: string | null; wantConnected: boolean; message: string | null; checkedAt: string | null
}
export type CampaignReason = null | 'whatsapp_disconnected' | 'outside_window' | 'daily_limit' | 'finished' | 'missing_data' | 'waiting' | 'error'
export interface Campaign {
  status: 'stopped' | 'running' | 'paused'; reason: CampaignReason; reasonText: string | null; nextAt: string | null; currentProspectId: number | null
  scheduledAt: string | null; scheduleError: string | null
  mixBases: boolean
}
export interface Stats {
  totalMessagesToday: number; manualMessagesToday: number; contactedTotal: number; salesTotal: number; total: number; counts: Record<Status, number>; replied: number; sentToday: number; dailyLimit: number; blocked: number
  campaign: Campaign; whatsapp: WaStatus
}
export interface Settings {
  messageTemplate: string; dailyLimit: number; delayMin: number; delayMax: number; windowStart: string; windowEnd: string
  defaultTemplate: string; evolutionConfigured: boolean
}
export interface BaseSummary { id: number | null; name: string; total: number; contacted: number; consented: number; pending: number }
export interface AuditEvent { id: number; ts: string; actor: string; action: string; entity: string; entity_id: string | null; label: string; detail: string }
export interface User { id: number; email: string; name: string }
export interface Paged<T> { items: T[]; total: number; page: number; pageSize: number }

export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message) }
}

let onUnauthorized: () => void = () => {}
export const setUnauthorizedHandler = (fn: () => void) => { onUnauthorized = fn }

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method, credentials: 'same-origin',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError('No hay conexión con el servidor de BuyBot. Revisa que esté encendido.', 0)
  }
  const text = await response.text()
  let data: any = null
  try { data = text ? JSON.parse(text) : null } catch { data = null }
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/auth/')) onUnauthorized()
    throw new ApiError(data?.error ?? `Error ${response.status}`, response.status)
  }
  return data as T
}

export const qs = (params: Record<string, string | number | undefined>) => {
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') search.set(k, String(v))
  const text = search.toString()
  return text ? `?${text}` : ''
}
