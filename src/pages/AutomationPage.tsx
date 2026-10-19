import { Activity, Check, CheckCircle2, FileSpreadsheet, LoaderCircle, MessageCircle, MessageSquareText, Pause, Play, Search, ShieldCheck, Sparkles, Square } from 'lucide-react'
import type { DemoState } from '../types'
import { DAILY_GOAL } from '../services/simulationEngine'
import { EmptyInline, PageTitle, getInitials, getStats } from '../components/shared'
import { StatusBadge } from '../components/StatusBadge'
import { WhatsAppPreview } from '../components/WhatsAppPreview'
import { formatPhone, formatTime } from '../utils/format'
export function AutomationPage({ demo, onStart, onPause, onStop }: { demo: DemoState; onStart: () => void; onPause: () => void; onStop: () => void }) {
  const stats = getStats(demo.prospects)
  const current = demo.prospects.find((item) => item.id === demo.currentProspectId) ?? null
  const progress = Math.min(100, stats.contacted / DAILY_GOAL * 100)
  const hasPending = stats.pending > 0 || current !== null
  const statusLabelText = demo.automationStatus === 'running' ? 'En curso' : demo.automationStatus === 'paused' ? 'En pausa' : demo.automationStatus === 'completed' ? 'Base procesada' : 'Detenida'
  const activeStep = current ? (demo.stageIndex === 0 ? 1 : demo.stageIndex === 1 ? 2 : demo.stageIndex === 2 ? (current.eligibility === false ? 2 : 3) : demo.stageIndex === 3 ? 3 : 4) : 0
  const timeline = [
    { title: 'Cliente cargado', detail: current ? 'Registro listo para consulta' : 'Pendiente de iniciar' },
    { title: 'DNI consultado', detail: 'Validación de identidad' },
    { title: current?.eligibility === false ? 'Programando revisión' : 'Elegibilidad verificada', detail: current?.eligibility === false ? 'Próxima revisión en 30 días' : 'Resultado de evaluación' },
    { title: 'Oferta preparada', detail: current?.eligibility ? 'Monto y tasa referencial' : 'Propuesta comercial' },
    { title: 'Mensaje enviado', detail: 'Primer contacto al cliente' },
  ]
  return <>
    <PageTitle eyebrow="CENTRO DE OPERACIONES" title="Automatización" subtitle="Supervisa el flujo de evaluación y primer contacto." action={<div className={`status-indicator large-status ${demo.automationStatus}`}><i />{statusLabelText}</div>} />
    <section className="operation-goal panel"><div className="operation-goal-top"><div><span className="muted-label">META DIARIA</span><div className="operation-count"><strong>{stats.contacted}</strong><span>/ {DAILY_GOAL}</span><small>mensajes enviados</small></div></div><div className="operation-controls">
      {demo.automationStatus === 'running' ? <button className="outline-button control-pause" onClick={onPause}><Pause size={15} fill="currentColor" /> Pausar</button> : <button className="primary-button" onClick={onStart} disabled={!hasPending || demo.automationStatus === 'completed'}><Play size={15} fill="currentColor" />{demo.automationStatus === 'paused' ? 'Reanudar' : 'Iniciar'}</button>}
      <button className="outline-button control-stop" onClick={onStop} disabled={demo.automationStatus === 'stopped' || demo.automationStatus === 'completed'}><Square size={13} fill="currentColor" /> Detener</button>
    </div></div><div className="operation-progress"><div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div><div className="operation-progress-caption"><span>{stats.contacted} de 100 clientes contactados</span><span>{progress.toFixed(0)}%</span></div></div>
    </section>
    {demo.automationStatus === 'completed' && <div className="base-processed"><span><CheckCircle2 size={19} /></span><div><strong>BASE PROCESADA</strong><p>No quedan clientes pendientes. Mensajes enviados hoy: {stats.contacted} / 100. Importa una nueva base para continuar.</p></div></div>}
    <div className="operations-layout">
      <div className="operations-main">
        <section className="panel focus-panel"><div className="panel-heading"><div><div className="eyebrow">CLIENTE EN PROCESO</div><h2>{current ? 'Evaluación en curso' : demo.automationStatus === 'completed' ? 'Todo listo por hoy' : 'Esperando inicio'}</h2></div><span className="focus-step">{current ? `Etapa ${Math.min(demo.stageIndex + 1, 5)} de 5` : '—'}</span></div>
          {current ? <><div className="focus-client"><div className="avatar avatar-soft large-avatar">{getInitials(current.name)}</div><div className="focus-client-name"><h3>{current.name}</h3><span>DNI {current.dni}</span></div><StatusBadge status={current.status} /><div className="focus-client-phone"><MessageCircle size={14} />{formatPhone(current.phone)}</div></div>
            <div className="timeline">{timeline.map((step, index) => { const isDone = index === 0 || (index === 1 && demo.stageIndex > 0) || (index === 2 && demo.stageIndex > 1) || (index === 3 && demo.stageIndex > 2 && current.eligibility === true) || (index === 4 && current.status === 'contacted'); const isActive = activeStep === index && !isDone; return <div className={`timeline-step ${isDone ? 'done' : ''} ${isActive ? 'active' : ''}`} key={step.title}><div className="timeline-mark">{isDone ? <Check size={13} /> : isActive ? <LoaderCircle size={14} className="spin" /> : <span>{index + 1}</span>}</div><div className="timeline-copy"><strong>{step.title}</strong><span>{step.detail}</span></div>{index < timeline.length - 1 && <div className="timeline-connector" />}</div>})}</div>
          </> : <div className="automation-waiting"><div className="automation-illustration"><div className="illustration-orbit orbit-one" /><div className="illustration-orbit orbit-two" /><div className="illustration-core"><Sparkles size={22} /></div></div><h3>{demo.automationStatus === 'completed' ? '¡Excelente trabajo!' : demo.automationStatus === 'paused' ? 'El proceso está en pausa' : 'Tu equipo está listo'}</h3><p>{demo.automationStatus === 'completed' ? 'Ya se procesó toda la base de prospectos.' : demo.automationStatus === 'paused' ? 'Puedes reanudar desde donde quedó.' : 'Al iniciar, BuyBot revisará automáticamente los prospectos pendientes.'}</p>{demo.automationStatus === 'stopped' && <button className="primary-button" onClick={onStart} disabled={!hasPending}><Play size={15} fill="currentColor" /> Iniciar automatización</button>}</div>}
        </section>
        <section className="panel pipeline-panel"><div className="panel-heading"><div><div className="eyebrow">FLUJO DE TRABAJO</div><h2>Proceso automático</h2></div><span className="pipeline-caption"><span className="online-dot" /> Actualización en vivo</span></div><div className="pipeline-steps">{['Importar', 'Consultar DNI', 'Evaluar', 'Preparar oferta', 'Contactar'].map((label, index) => <div className={`pipeline-step ${index < 1 || (current && index <= Math.min(4, Math.floor(demo.stageIndex / 1.1))) ? 'passed' : ''} ${current && index === Math.min(4, Math.floor(demo.stageIndex / 1.1)) ? 'current' : ''}`} key={label}><span className="pipeline-icon">{index === 0 ? <FileSpreadsheet size={17} /> : index === 1 ? <Search size={17} /> : index === 2 ? <ShieldCheck size={17} /> : index === 3 ? <Sparkles size={17} /> : <MessageSquareText size={17} />}</span><span>{label}</span></div>)}</div></section>
      </div>
      <aside className="operations-aside"><section className="panel wa-panel"><div className="panel-heading"><div><div className="eyebrow">VISTA PREVIA</div><h2>Mensaje al cliente</h2></div><span className="preview-mark"><MessageCircle size={14} /></span></div><WhatsAppPreview name={current?.name} phone={current?.phone} message={current?.message} sending={current?.status === 'contacting'} sent={current?.status === 'contacted'} /></section>
        <section className="panel live-log-panel"><div className="panel-heading"><div><div className="eyebrow">SEGUIMIENTO</div><h2>Actividad en tiempo real</h2></div><span className="live-pill"><i /> EN VIVO</span></div>{demo.events.length ? <div className="live-log">{demo.events.slice(0, 7).map((event) => <div className="live-log-row" key={event.id}><time>{formatTime(event.timestamp)}</time><span className="live-log-dot" /><div><strong>{event.action}</strong><span>{event.name}</span></div></div>)}</div> : <EmptyInline icon={Activity} title="Sin movimientos todavía" text="El registro aparecerá cuando inicies." />}</section>
      </aside>
    </div>
  </>
}
