import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Clock3, MessageSquareText, Users, Wifi } from 'lucide-react'
import { api } from '../api'
import type { AuditEvent, BaseSummary, Paged } from '../api'
import { Button, Empty, PageHeader, Spinner } from '../ui'
import { useStats, useUser } from '../store'
import { formatTime, greeting } from '../format'
import { waLabel } from './WhatsAppPage'
import type { Page } from '../App'
import { eventText } from './HistoryPage'

const formatSales = (amount: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(amount)

export function DashboardPage({ goto }: { goto: (p: Page) => void }) {
  const { stats } = useStats()
  const { user } = useUser()
  const [events, setEvents] = useState<AuditEvent[] | null>(null)
  const [bases, setBases] = useState<BaseSummary[] | null>(null)
  const [basesError, setBasesError] = useState(false)
  useEffect(() => { api<Paged<AuditEvent>>('GET', '/events?pageSize=6').then((r) => setEvents(r.items)).catch(() => setEvents([])) }, [stats?.sentToday, stats?.total])
  useEffect(() => { api<{ items: BaseSummary[] }>('GET', '/bases').then((r) => { setBases(r.items); setBasesError(false) }).catch(() => setBasesError(true)) }, [stats?.sentToday, stats?.total, stats?.counts.sent, stats?.counts.opted_out, stats?.counts.pending, stats?.counts.on_hold])
  if (!stats) return <Spinner />
  const wa = waLabel(stats.whatsapp.state)
  const setupDone = [stats.whatsapp.state === 'connected', stats.total > 0, stats.sentToday > 0 || stats.counts.sent > 0]

  return <>
    <PageHeader eyebrow={new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())} title={`${greeting()}${user.name ? `, ${user.name}` : ''}`} subtitle="Resumen de tu prospección de hoy." />

    {setupDone.some((d) => !d) && <section className="card onboarding">
      <h3 className="card-title">Para empezar</h3>
      <ol className="checklist">
        <li className={setupDone[0] ? 'done' : ''}><CheckCircle2 size={18} /><span>Conecta el WhatsApp de la asesora</span>{!setupDone[0] && <Button onClick={() => goto('whatsapp')}>Conectar</Button>}</li>
        <li className={setupDone[1] ? 'done' : ''}><CheckCircle2 size={18} /><span>Importa tu base de clientes</span>{!setupDone[1] && <Button onClick={() => goto('import')}>Importar</Button>}</li>
        <li className={setupDone[2] ? 'done' : ''}><CheckCircle2 size={18} /><span>Inicia el envío</span>{setupDone[0] && setupDone[1] && !setupDone[2] && <Button variant="primary" onClick={() => goto('send')}>Ir a envíos</Button>}</li>
      </ol>
    </section>}

    <section className="card goal"><span className="muted-label">VENTAS ACUMULADAS</span><div className="big-count"><strong>{formatSales(stats.salesTotal)}</strong></div></section>

    <section className="card goal">
      <div><span className="muted-label">CONTACTADOS HOY</span><div className="big-count"><strong>{stats.sentToday}</strong><span>personas de tus bases</span></div><p className="muted-text small">Límite configurado: {stats.dailyLimit} intentos diarios por número.</p></div>
      <p className="muted-text small">Mensajes enviados hoy: {stats.totalMessagesToday} · Manuales o pruebas: {stats.manualMessagesToday}. Una persona puede recibir varios mensajes.</p>
      <div className="goal-foot"><span className={`status-pill ${stats.campaign.status}`}><i />{stats.campaign.status === 'running' ? 'Envío en curso' : stats.campaign.status === 'paused' ? 'Envío en pausa' : 'Envío detenido'}</span><Button variant="ghost" onClick={() => goto('send')}>Ir a envíos <ArrowRight size={15} /></Button></div>
    </section>

    <section className="kpis" aria-label="Indicadores">
      <Kpi icon={<Users size={18} />} label="Prospectos" value={stats.total} detail={`${stats.counts.pending} pendientes · ${stats.counts.no_whatsapp} sin WhatsApp excluidos`} onClick={() => goto('prospects')} />
      <Kpi icon={<MessageSquareText size={18} />} label="Contactados" value={stats.contactedTotal} detail={`${stats.replied} respondieron`} tone="green" onClick={() => goto('prospects')} />
      <Kpi icon={<CheckCircle2 size={18} />} label="Ventas" value={formatSales(stats.salesTotal)} small detail="Registrar ventas" onClick={() => goto('review')} />
      <Kpi icon={<Wifi size={18} />} label="WhatsApp" value={wa.text} small detail={stats.whatsapp.phone ? `+${stats.whatsapp.phone}` : 'Toca para administrar'} tone={wa.tone} onClick={() => goto('whatsapp')} />
    </section>

    <section className="card">
      <h3 className="card-title">Contactados por base</h3>
      <p className="muted-text small">Seguimiento de los prospectos de cada archivo importado.</p>
      {basesError ? <p className="error-text small">No se pudo cargar el resumen de las bases.</p> : !bases ? <Spinner /> : !bases.length ? <Empty icon={<Users size={22} />} title="Aún no hay bases" text="Importa un archivo para ver su avance aquí." /> :
        <ul className="feed base-feed">{bases.map((base) => <li key={base.id ?? 'sin-base'}><div><strong>{base.name}</strong><small>{base.pending} pendientes con autorización</small></div><span className="base-count"><b>{base.contacted}</b> / {base.total} contactados</span></li>)}</ul>}
    </section>

    <section className="card">
      <div className="card-head"><h3 className="card-title">Actividad reciente</h3><Button variant="ghost" onClick={() => goto('history')}>Ver todo <ArrowRight size={15} /></Button></div>
      {!events ? <Spinner /> : !events.length ? <Empty icon={<Clock3 size={22} />} title="Aún no hay actividad" text="Los movimientos aparecerán aquí." /> :
        <ul className="feed">{events.map((e) => <li key={e.id}><span className={`dot dot-${eventText(e).tone}`} /><div><strong>{eventText(e).title}</strong><small>{e.label}</small></div><time>{formatTime(e.ts)}</time></li>)}</ul>}
    </section>
  </>
}

function Kpi({ icon, label, value, detail, tone, small, onClick }: { icon: React.ReactNode; label: string; value: number | string; detail: string; tone?: string; small?: boolean; onClick: () => void }) {
  return <button className={`kpi ${tone ? `tone-${tone}` : ''}`} onClick={onClick}><span className="kpi-icon">{icon}</span><span className="kpi-label">{label}</span><span className={`kpi-value ${small ? 'small' : ''}`}>{value}</span><span className="kpi-detail">{detail}</span></button>
}
