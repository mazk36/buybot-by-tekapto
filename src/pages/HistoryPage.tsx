import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, ChevronLeft, ChevronRight, History as HistoryIcon, Search } from 'lucide-react'
import { api, qs } from '../api'
import type { AuditEvent, Paged } from '../api'
import { Button, Empty, ErrorBox, PageHeader, Spinner, useDebounced } from '../ui'
import { downloadUrl, formatDateTime } from '../format'

type Tone = 'green' | 'red' | 'amber' | 'blue' | 'neutral'
const MAP: Record<string, [string, Tone]> = {
  'message.sent': ['Mensaje enviado', 'green'], 'message.failed': ['Envío fallido', 'red'], 'message.retry': ['Reintento de envío', 'amber'],
  'message.no_whatsapp': ['Número sin WhatsApp', 'amber'], 'message.unknown': ['Envío sin confirmar', 'red'], 'message.interrupted': ['Envío interrumpido', 'red'],
  'prospect.create': ['Prospecto agregado', 'blue'], 'prospect.update': ['Prospecto editado', 'neutral'], 'prospect.delete': ['Prospecto eliminado', 'red'],
  'prospect.requeue': ['Vuelto a la cola', 'amber'], 'prospect.reply': ['El cliente respondió', 'green'], 'prospect.opt_out': ['El cliente pidió BAJA', 'red'],
  'prospects.import': ['Base importada', 'blue'], 'prospects.export': ['Base exportada', 'neutral'],
  'campaign.start': ['Envío iniciado', 'green'], 'campaign.resume': ['Envío reanudado', 'green'], 'campaign.pause': ['Envío pausado', 'amber'], 'campaign.stop': ['Envío detenido', 'red'], 'campaign.finish': ['Envío terminado', 'blue'],
  'whatsapp.connect': ['Conexión de WhatsApp solicitada', 'blue'], 'whatsapp.disconnect': ['WhatsApp desconectado', 'red'], 'whatsapp.reset': ['Conexión reiniciada', 'amber'], 'whatsapp.test': ['Mensaje de prueba', 'neutral'],
  'settings.update': ['Configuración cambiada', 'neutral'], 'auth.login': ['Inicio de sesión', 'neutral'], 'user.password': ['Contraseña cambiada', 'neutral'], 'backup.download': ['Respaldo descargado', 'neutral'],
}
const WA_STATE: Record<string, string> = { connected: 'WhatsApp conectado', connecting: 'Esperando QR', disconnected: 'WhatsApp desconectado', no_instance: 'Sin instancia', evolution_unreachable: 'Evolution sin respuesta', evolution_not_configured: 'Evolution sin configurar' }

export function eventText(e: AuditEvent): { title: string; tone: Tone } {
  if (e.action === 'whatsapp.state') return { title: WA_STATE[e.label] ?? 'Estado de WhatsApp', tone: e.label === 'connected' ? 'green' : e.label === 'connecting' ? 'amber' : 'red' }
  const m = MAP[e.action]
  return { title: m?.[0] ?? e.action, tone: m?.[1] ?? 'neutral' }
}

export function HistoryPage() {
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [entity, setEntity] = useState('all')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<Paged<AuditEvent> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { setData(await api<Paged<AuditEvent>>('GET', `/events${qs({ q, entity, page, pageSize: 30 })}`)); setError(null) } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }, [q, entity, page])
  useEffect(() => { void load() }, [load])
  useEffect(() => setPage(1), [q, entity])
  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return <>
    <PageHeader eyebrow="REGISTRO" title="Historial" subtitle="Todo lo que pasó en el sistema, en orden. Nada se borra."
      actions={<Button icon={<ArrowDownToLine size={16} />} onClick={() => downloadUrl('/api/events/export.csv')}>Exportar</Button>} />
    <section className="card table-card">
      <div className="toolbar">
        <label className="search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar en el historial" aria-label="Buscar en el historial" /></label>
        <select className="select" value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="Tipo de evento">
          <option value="all">Todos los eventos</option><option value="prospect">Prospectos y mensajes</option><option value="campaign">Envío automático</option><option value="whatsapp">WhatsApp</option><option value="settings">Configuración</option><option value="user">Cuenta</option>
        </select>
      </div>
      {error ? <ErrorBox message={error} onRetry={() => void load()} /> : !data ? <Spinner /> : !data.items.length ? <Empty icon={<HistoryIcon size={22} />} title="Sin resultados" text="Aún no hay movimientos o no coinciden con tu búsqueda." /> : <>
        <div className="table-wrap"><table className="data responsive"><thead><tr><th>Fecha</th><th>Evento</th><th>Detalle</th><th>Quién</th></tr></thead>
          <tbody>{data.items.map((e) => { const t = eventText(e); return <tr key={e.id}>
            <td data-label="Fecha" className="nowrap">{formatDateTime(e.ts)}</td>
            <td data-label="Evento" className="cell-main"><span className={`badge badge-${t.tone}`}><i />{t.title}</span></td>
            <td data-label="Detalle">{e.label}{e.detail && e.action !== 'settings.update' && !e.detail.startsWith('{') && <small className="sub">{e.detail}</small>}</td>
            <td data-label="Quién" className="muted-text">{e.actor}</td></tr> })}</tbody></table></div>
        <div className="pager"><span>{data.total} evento(s) · página {page} de {pages}</span>
          <div className="btn-row"><Button disabled={page <= 1} icon={<ChevronLeft size={16} />} onClick={() => setPage(page - 1)}>Anterior</Button><Button disabled={page >= pages} onClick={() => setPage(page + 1)}>Siguiente <ChevronRight size={16} /></Button></div></div>
      </>}
    </section>
  </>
}
