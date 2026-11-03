import { useEffect, useState } from 'react'
import { AlertTriangle, Clock3, MessageSquareText, Pause, Play, Square, WifiOff } from 'lucide-react'
import { api } from '../api'
import type { CampaignReason } from '../api'
import { Button, Empty, PageHeader, StatusBadge, useToast } from '../ui'
import { useStats } from '../store'
import { formatPhone, formatTime, initials } from '../format'

export const REASON_TEXT: Record<Exclude<CampaignReason, null>, string> = {
  whatsapp_disconnected: 'Esperando que WhatsApp esté conectado',
  outside_window: 'Fuera del horario de envío',
  daily_limit: 'Límite diario alcanzado',
  finished: 'Base procesada',
  missing_data: 'Terminó; quedan clientes sin monto o tasa',
  waiting: 'Reintentando',
  error: 'Hubo un problema',
}

export function SendPage({ goto }: { goto: (page: 'whatsapp' | 'settings' | 'prospects') => void }) {
  const toast = useToast()
  const { stats, refresh } = useStats()
  const [busy, setBusy] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [recent, setRecent] = useState<{ id: number; name: string; phone: string; sentAt: string }[]>([])
  useEffect(() => { const t = window.setInterval(() => setNow(Date.now()), 1000); return () => window.clearInterval(t) }, [])
  useEffect(() => { api<{ items: typeof recent }>('GET', '/messages/today').then((r) => setRecent(r.items)).catch(() => {}) }, [stats?.sentToday])

  if (!stats) return null
  const c = stats.campaign
  const wa = stats.whatsapp
  const pending = stats.counts.pending
  const progress = Math.min(100, (stats.sentToday / stats.dailyLimit) * 100)
  const countdown = c.nextAt ? Math.max(0, Math.round((new Date(c.nextAt).getTime() - now) / 1000)) : null
  const label = c.status === 'running' ? 'En curso' : c.status === 'paused' ? 'En pausa' : 'Detenido'

  const act = async (action: 'start' | 'pause' | 'stop') => {
    setBusy(true)
    try { await api('POST', `/campaign/${action}`); await refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error') } finally { setBusy(false) }
  }

  return <>
    <PageHeader eyebrow="CENTRO DE ENVÍOS" title="Envíos" subtitle="Controla el envío automático. Los mensajes salen uno por uno, con una pausa predeterminada de 30 segundos."
      actions={<span className={`status-pill ${c.status}`}><i />{label}</span>} />

    {wa.state !== 'connected' && <div className="alert alert-warn"><WifiOff size={18} /><div><strong>WhatsApp no está conectado</strong><p>El envío no avanza hasta que vincules un número.</p></div><Button onClick={() => goto('whatsapp')}>Conectar</Button></div>}
    {c.reason && c.status !== 'stopped' && c.reason !== 'whatsapp_disconnected' && <div className="alert alert-info"><Clock3 size={18} /><div><strong>{REASON_TEXT[c.reason]}</strong>{c.reasonText && <p>{c.reasonText}</p>}</div></div>}
    {c.status === 'stopped' && c.reason && ['finished', 'missing_data'].includes(c.reason) && <div className="alert alert-info"><MessageSquareText size={18} /><div><strong>{REASON_TEXT[c.reason]}</strong>{c.reasonText && <p>{c.reasonText}</p>}</div>{c.reason === 'missing_data' && <Button onClick={() => goto('prospects')}>Completar datos</Button>}</div>}
    {stats.blocked > 0 && c.status !== 'stopped' && <div className="alert alert-warn"><AlertTriangle size={18} /><div><strong>{stats.blocked} cliente(s) sin monto o tasa</strong><p>No se enviarán hasta que completes esos datos.</p></div><Button onClick={() => goto('prospects')}>Ver</Button></div>}

    <section className="card send-hero">
      <div className="send-top">
        <div><span className="muted-label">ENVIADOS HOY</span><div className="big-count"><strong>{stats.sentToday}</strong><span>/ {stats.dailyLimit}</span></div></div>
        <div className="send-controls">
          {c.status === 'running'
            ? <Button busy={busy} icon={<Pause size={16} />} onClick={() => void act('pause')}>Pausar</Button>
            : <Button variant="primary" busy={busy} disabled={pending === 0} icon={<Play size={16} />} onClick={() => void act('start')}>{c.status === 'paused' ? 'Reanudar' : 'Iniciar envío'}</Button>}
          <Button busy={busy} disabled={c.status === 'stopped'} icon={<Square size={14} />} onClick={() => void act('stop')}>Detener</Button>
        </div>
      </div>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance diario"><i style={{ width: `${progress}%` }} /></div>
      <div className="send-meta">
        <span><b>{pending}</b> pendientes en cola</span>
        {c.status === 'running' && countdown !== null && countdown > 0 && <span>Siguiente mensaje en <b>{countdown} s</b></span>}
        {c.status === 'running' && countdown === 0 && !c.reason && <span>Enviando…</span>}
      </div>
      {pending === 0 && c.status !== 'running' && <Empty icon={<MessageSquareText size={22} />} title="No hay clientes pendientes" text="Importa una base o libera clientes en espera para empezar." action={<Button onClick={() => goto('prospects')}>Ir a prospectos</Button>} />}
    </section>

    <div className="grid-2">
      <section className="card"><h3 className="card-title">Resumen de la base</h3>
        <dl className="kv">
          <div><dt>Pendientes</dt><dd>{stats.counts.pending}</dd></div><div><dt>Enviados</dt><dd>{stats.counts.sent}</dd></div>
          <div><dt>Sin WhatsApp</dt><dd>{stats.counts.no_whatsapp}</dd></div><div><dt>Con error</dt><dd>{stats.counts.failed}</dd></div>
          <div><dt>En espera</dt><dd>{stats.counts.on_hold}</dd></div><div><dt>No contactar</dt><dd>{stats.counts.opted_out}</dd></div>
        </dl>
        <Button variant="ghost" onClick={() => goto('settings')}>Ajustar pausas, horario y límite</Button>
      </section>
      <section className="card"><h3 className="card-title">Enviados hoy</h3>
        {!recent.length ? <p className="muted-text">Todavía no se envió nada hoy.</p> : <ul className="feed">{recent.map((m) => <li key={m.id}><span className="avatar sm">{initials(m.name)}</span><div><strong>{m.name}</strong><small>{formatPhone(m.phone)}</small></div><time>{formatTime(m.sentAt)}</time></li>)}</ul>}
      </section>
    </div>
    <p className="muted-text small pad"><StatusBadge status="sent" /> Los clientes ya contactados nunca reciben el mensaje dos veces, aunque el servidor se reinicie.</p>
  </>
}
