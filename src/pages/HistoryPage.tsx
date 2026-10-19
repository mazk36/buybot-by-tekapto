import { useState } from 'react'
import { Activity, ArrowDownToLine, Filter, History, Search } from 'lucide-react'
import type { HistoryEvent } from '../types'
import { EmptyInline, PageTitle, getInitials } from '../components/shared'
import { formatDate, formatTime } from '../utils/format'
export function HistoryPage({ events }: { events: HistoryEvent[] }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('Todos los eventos')
  const filtered = events.filter((event) => `${event.name} ${event.action} ${event.result}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'Todos los eventos' || event.action.toLowerCase().includes(filter.toLowerCase())))
  return <>
    <PageTitle eyebrow="REGISTRO DE ACTIVIDAD" title="Historial" subtitle="Consulta los movimientos de tu gestión en orden cronológico." action={<button className="outline-button" onClick={() => exportHistory(events)} disabled={!events.length}><ArrowDownToLine size={15} /> Exportar historial</button>} />
    <section className="panel table-panel history-panel"><div className="table-topline history-toolbar"><div className="history-filters"><span className="history-filter-label"><Filter size={14} /> Tipo de actividad</span><select value={filter} onChange={(event) => setFilter(event.target.value)}><option>Todos los eventos</option><option>Mensaje enviado</option><option>Cliente apto</option><option>segunda revisión</option><option>Automatización</option><option>Base importada</option></select></div><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar en el historial..." /></label></div><div className="table-caption"><span><strong>{filtered.length}</strong> eventos registrados</span><span className="table-caption-right">Más recientes primero</span></div><div className="table-scroll"><table className="data-table history-table"><thead><tr><th>Hora</th><th>Cliente</th><th>Acción</th><th>Resultado</th></tr></thead><tbody>{filtered.map((event) => <tr key={event.id}><td className="history-time">{formatDate(event.timestamp, { day: '2-digit', month: 'short' })}<span>{formatTime(event.timestamp)}</span></td><td><div className="table-person"><div className="avatar avatar-soft small-avatar">{event.prospectId ? getInitials(event.name) : <Activity size={14} />}</div><strong>{event.name}</strong></div></td><td><span className="event-action"><span className={event.action.includes('enviado') ? 'event-dot green' : event.action.includes('apto') ? 'event-dot blue' : 'event-dot neutral'} />{event.action}</span></td><td className="result-cell">{event.result || '—'}</td></tr>)}{!filtered.length && <tr><td colSpan={4}><EmptyInline icon={History} title="Sin resultados" text="Prueba con otro filtro o busca un cliente diferente." /></td></tr>}</tbody></table></div><div className="table-footer"><span>Se conservan los últimos 500 movimientos.</span><span className="table-caption-right"><span className="online-dot" /> Registro actualizado en tiempo real</span></div></section>
  </>
}


function exportHistory(events: HistoryEvent[]) {
  const escapeCell = (value: string) => `"${value.replaceAll('"', '""')}"`
  const rows = [['Fecha y hora', 'Cliente', 'Acción', 'Resultado'], ...events.map((event) => [event.timestamp, event.name, event.action, event.result])]
  const csv = `\uFEFF${rows.map((row) => row.map(escapeCell).join(',')).join('\r\n')}`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'buybot-historial.csv'
  link.click()
  URL.revokeObjectURL(url)
}
