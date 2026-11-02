import { useEffect, useState } from 'react'
import { ArrowRight, CheckCircle2, Clock3, MessageSquareText, TriangleAlert, Users, Wifi } from 'lucide-react'
import { api } from '../api'
import type { AuditEvent, Paged } from '../api'
import { Button, Empty, PageHeader, Spinner } from '../ui'
import { useStats, useUser } from '../store'
import { formatTime, greeting } from '../format'
import { waLabel } from './WhatsAppPage'
import type { Page } from '../App'
import { eventText } from './HistoryPage'

export function DashboardPage({ goto }: { goto: (p: Page) => void }) {
  const { stats } = useStats()
  const { user } = useUser()
  const [events, setEvents] = useState<AuditEvent[] | null>(null)
  useEffect(() => { api<Paged<AuditEvent>>('GET', '/events?pageSize=6').then((r) => setEvents(r.items)).catch(() => setEvents([])) }, [stats?.sentToday, stats?.total])
  if (!stats) return <Spinner />
  const wa = waLabel(stats.whatsapp.state)
  const progress = Math.min(100, (stats.sentToday / stats.dailyLimit) * 100)
  const review = stats.counts.failed + stats.counts.no_whatsapp
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

    <section className="card goal">
      <div><span className="muted-label">META DE HOY</span><div className="big-count"><strong>{stats.sentToday}</strong><span>/ {stats.dailyLimit} mensajes</span></div></div>
      <div className="progress" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="Avance diario"><i style={{ width: `${progress}%` }} /></div>
      <div className="goal-foot"><span className={`status-pill ${stats.campaign.status}`}><i />{stats.campaign.status === 'running' ? 'Envío en curso' : stats.campaign.status === 'paused' ? 'Envío en pausa' : 'Envío detenido'}</span><Button variant="ghost" onClick={() => goto('send')}>Ir a envíos <ArrowRight size={15} /></Button></div>
    </section>

    <section className="kpis" aria-label="Indicadores">
      <Kpi icon={<Users size={18} />} label="Prospectos" value={stats.total} detail={`${stats.counts.pending} pendientes`} onClick={() => goto('prospects')} />
      <Kpi icon={<MessageSquareText size={18} />} label="Contactados" value={stats.counts.sent} detail={`${stats.replied} respondieron`} tone="green" onClick={() => goto('prospects')} />
      <Kpi icon={<TriangleAlert size={18} />} label="Por revisar" value={review} detail="Con error o sin WhatsApp" tone={review ? 'amber' : undefined} onClick={() => goto('review')} />
      <Kpi icon={<Wifi size={18} />} label="WhatsApp" value={wa.text} small detail={stats.whatsapp.phone ? `+${stats.whatsapp.phone}` : 'Toca para administrar'} tone={wa.tone} onClick={() => goto('whatsapp')} />
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
