import { Activity, ArrowRight, ArrowUpRight, ChevronDown, Clock3, Gauge, ListChecks, LockKeyhole, LoaderCircle, MessageSquareText, Play, RotateCcw, ShieldCheck, Sparkles } from 'lucide-react'
import type { DemoState } from '../types'
import { DAILY_GOAL } from '../services/simulationEngine'
import { ActivityRow, EmptyInline, currentStageLabel, getGreeting, getInitials, getStats, type AppPage as Page, type IconType } from '../components/shared'
export function DashboardPage({ demo, onNavigate, onStart }: { demo: DemoState; onNavigate: (page: Page) => void; onStart: () => void }) {
  const stats = getStats(demo.prospects)
  const current = demo.prospects.find((item) => item.id === demo.currentProspectId) ?? null
  const latestEvents = demo.events.slice(0, 5)
  const progress = Math.min(100, (stats.contacted / DAILY_GOAL) * 100)
  const statusText = demo.automationStatus === 'running' ? 'En curso' : demo.automationStatus === 'paused' ? 'Pausada' : demo.automationStatus === 'completed' ? 'Base procesada' : 'Detenida'
  return (
    <>
      <div className="dashboard-intro"><div><div className="date-kicker"><span className="date-dot" />{new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date())}</div><h1>{getGreeting()}, Cristina <span className="wave">✦</span></h1><p>Resumen de prospección de hoy</p></div><button className="outline-button date-selector" onClick={() => onNavigate('history')}><Clock3 size={15} /> Actividad de hoy <ChevronDown size={14} /></button></div>

      <section className="goal-card">
        <div className="goal-main"><div className="goal-label"><span className="goal-icon"><Gauge size={16} /></span> META DIARIA</div><div className="goal-count"><strong>{stats.contacted}</strong><span>/ {DAILY_GOAL}</span><span className="goal-unit">clientes contactados</span></div><div className="goal-progress"><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div><span>{progress.toFixed(0)}% completado</span></div></div>
        <div className="goal-divider" />
        <div className="goal-side"><div className="goal-side-icon"><MessageSquareText size={17} /></div><div><strong>Más tiempo para tus clientes</strong><p>BuyBot automatiza las consultas y el primer contacto para que tú puedas enfocarte en asesorar.</p><button className="text-button light-text-button" onClick={() => onNavigate('automation')}>Explorar automatización <ArrowRight size={14} /></button></div></div>
        <div className="goal-watermark">BB</div>
      </section>

      <section className="kpi-grid" aria-label="Indicadores de hoy">
        <KpiCard label="Clientes revisados" value={stats.reviewed} icon={ListChecks} iconClass="icon-blue" detail={`${stats.pending} pendientes`} onClick={() => onNavigate('prospects')} />
        <KpiCard label="Clientes aptos" value={stats.eligible} icon={ShieldCheck} iconClass="icon-green" detail="Con oferta disponible" onClick={() => onNavigate('prospects')} />
        <KpiCard label="Mensajes enviados" value={stats.contacted} icon={MessageSquareText} iconClass="icon-red" detail="Meta de 100 por día" onClick={() => onNavigate('history')} />
        <KpiCard label="Segunda revisión" value={stats.secondReview} icon={RotateCcw} iconClass="icon-amber" detail="Reevaluación en 30 días" onClick={() => onNavigate('review')} />
      </section>

      <div className="dashboard-grid">
        <section className="panel automation-panel">
          <div className="panel-heading"><div><div className="eyebrow">CENTRO DE OPERACIONES</div><h2>Automatización</h2></div><span className={`status-indicator ${demo.automationStatus}`}><i />{statusText}</span></div>
          {current ? <div className="current-client-card"><div className="client-inline"><div className="avatar avatar-soft">{getInitials(current.name)}</div><div><span className="muted-label">CLIENTE ACTUAL</span><strong>{current.name}</strong><span className="client-dni">DNI {current.dni}</span></div></div><div className="current-stage"><span className="stage-spinner"><LoaderCircle size={16} /></span><div><strong>{currentStageLabel(current, demo.stageIndex)}</strong><span>{demo.stageIndex === 0 ? 'Consultando información del cliente' : 'El proceso avanza automáticamente'}</span></div></div><div className="client-progress-line"><div style={{ width: `${Math.min(96, 15 + demo.stageIndex * 16)}%` }} /></div><button className="text-button" onClick={() => onNavigate('automation')}>Ver centro de operaciones <ArrowRight size={14} /></button></div> : (
            <div className="automation-empty"><div className="automation-illustration"><div className="illustration-orbit orbit-one" /><div className="illustration-orbit orbit-two" /><div className="illustration-core"><Sparkles size={22} /></div><span className="orbit-dot dot-one" /><span className="orbit-dot dot-two" /></div><div className="empty-copy"><strong>{demo.automationStatus === 'completed' ? 'Base procesada' : demo.automationStatus === 'paused' ? 'Automatización en pausa' : 'Listo para comenzar'}</strong><span>{demo.automationStatus === 'completed' ? 'Importa una nueva base para continuar.' : 'Inicia el flujo y deja que BuyBot revise tus prospectos.'}</span></div><button className="primary-button compact-button" onClick={demo.automationStatus === 'paused' ? onStart : () => onNavigate('automation')}><Play size={14} fill="currentColor" />{demo.automationStatus === 'paused' ? 'Reanudar' : 'Ir a automatización'}</button></div>
          )}
          <div className="automation-panel-footer"><div><span>Estado del sistema</span><strong><span className="online-dot" />{demo.automationStatus === 'running' ? 'Operando con normalidad' : 'Disponible para iniciar'}</strong></div><button className="icon-button subtle" aria-label="Abrir automatización" onClick={() => onNavigate('automation')}><ArrowUpRight size={17} /></button></div>
        </section>

        <section className="panel activity-panel"><div className="panel-heading"><div><div className="eyebrow">EN TIEMPO REAL</div><h2>Actividad reciente</h2></div><button className="text-button panel-view-all" onClick={() => onNavigate('history')}>Ver todo <ArrowRight size={14} /></button></div>
          {latestEvents.length ? <div className="activity-list">{latestEvents.map((event) => <ActivityRow key={event.id} event={event} />)}</div> : <EmptyInline icon={Activity} title="Aún no hay actividad" text="Los movimientos de hoy aparecerán aquí." />}
        </section>
      </div>
      <div className="dashboard-footer-note"><LockKeyhole size={13} /><span>Los datos de esta demostración son ficticios y se guardan únicamente en este navegador.</span><button onClick={() => onNavigate('settings')}>Más información</button></div>
    </>
  )
}

function KpiCard({ label, value, icon: Icon, iconClass, detail, onClick }: { label: string; value: number; icon: IconType; iconClass: string; detail: string; onClick: () => void }) {
  return <button className="kpi-card" onClick={onClick}><div className="kpi-top"><span>{label}</span><span className={`kpi-icon ${iconClass}`}><Icon size={17} /></span></div><div className="kpi-value">{value}<span className="kpi-change"><ArrowUpRight size={13} /> hoy</span></div><div className="kpi-detail">{detail}</div></button>
}
