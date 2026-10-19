import { Filter, MessageCircle, MoreHorizontal, Plus, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { Prospect } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { EmptyInline, PageTitle, getInitials, getStats } from '../components/shared'
import { formatCurrency, formatDate, formatPhone } from '../utils/format'
export function ProspectsPage({ prospects, onProspect, onImport }: { prospects: Prospect[]; onProspect: (prospect: Prospect) => void; onImport: () => void }) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<'all' | 'pending' | 'eligible' | 'contacted' | 'second_review'>('all')
  const counts = getStats(prospects)
  const filtered = useMemo(() => prospects.filter((item) => {
    const matchesQuery = `${item.name} ${item.dni} ${item.phone}`.toLowerCase().includes(query.toLowerCase())
    const matchesFilter = filter === 'all' || (filter === 'eligible' ? item.eligibility === true : item.status === filter)
    return matchesQuery && matchesFilter
  }), [prospects, query, filter])
  const quickFilters = [
    { id: 'all', label: 'Todos', count: prospects.length },
    { id: 'pending', label: 'Pendientes', count: counts.pending },
    { id: 'eligible', label: 'Aptos', count: counts.eligible },
    { id: 'contacted', label: 'Contactados', count: counts.contacted },
    { id: 'second_review', label: 'Segunda revisión', count: counts.secondReview },
  ] as const
  return <>
    <PageTitle eyebrow="GESTIÓN COMERCIAL" title="Prospectos" subtitle="Administra y da seguimiento a tu cartera de clientes." action={<button className="primary-button" onClick={onImport}><Plus size={16} /> Agregar prospectos</button>} />
    <section className="panel table-panel">
      <div className="table-topline"><div className="quick-filters">{quickFilters.map((item) => <button key={item.id} className={`quick-filter ${filter === item.id ? 'selected' : ''}`} onClick={() => setFilter(item.id)}>{item.label}<span>{item.count}</span></button>)}</div><div className="table-tools"><label className="search-field"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre, DNI..." /></label><button className="outline-button filter-button" onClick={() => setFilter(filter === 'all' ? 'pending' : 'all')}><Filter size={15} /> Filtro</button></div></div>
      <div className="table-caption"><span><strong>{filtered.length}</strong> registros</span><span className="table-caption-right"><span className="online-dot" /> Actualizado ahora</span></div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th>Nombre</th><th>DNI</th><th>WhatsApp</th><th>Estado</th><th>Monto</th><th>Tasa</th><th>Última revisión</th><th><span className="sr-only">Acciones</span></th></tr></thead><tbody>
        {filtered.map((prospect) => <tr key={prospect.id} onClick={() => onProspect(prospect)} className="clickable-row"><td><div className="table-person"><div className="avatar avatar-soft small-avatar">{getInitials(prospect.name)}</div><strong>{prospect.name}</strong></div></td><td className="mono-cell">{prospect.dni}</td><td><span className="phone-cell"><MessageCircle size={14} />{formatPhone(prospect.phone)}</span></td><td><StatusBadge status={prospect.status} /></td><td className="money-cell">{formatCurrency(prospect.offerAmount)}</td><td>{prospect.rate !== null ? `${prospect.rate.toFixed(2)} %` : '—'}</td><td>{formatDate(prospect.lastReview)}</td><td><button className="icon-button row-more" aria-label={`Ver ${prospect.name}`} onClick={(event) => { event.stopPropagation(); onProspect(prospect) }}><MoreHorizontal size={18} /></button></td></tr>)}
        {!filtered.length && <tr><td colSpan={8}><EmptyInline icon={Search} title="No encontramos prospectos" text="Prueba con otro término o cambia los filtros." /></td></tr>}
      </tbody></table></div>
      <div className="table-footer"><span>Mostrando <strong>{filtered.length}</strong> de <strong>{prospects.length}</strong> prospectos</span><div className="pagination"><button disabled>Anterior</button><button className="page-number">1</button><button disabled>Siguiente</button></div></div>
    </section>
  </>
}
