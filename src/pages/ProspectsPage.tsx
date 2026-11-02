import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownToLine, ChevronLeft, ChevronRight, MessageCircle, Pause, Pencil, Play, Plus, RotateCcw, Search, Trash2, Users } from 'lucide-react'
import { ApiError, api, qs } from '../api'
import type { Paged, Prospect, Status } from '../api'
import { Button, ConfirmDialog, Empty, ErrorBox, Field, Modal, PageHeader, STATUS_LABEL, Spinner, StatusBadge, useDebounced, useToast } from '../ui'
import { useStats } from '../store'
import { downloadUrl, formatDateTime, formatMoney, formatPhone, formatRate, initials } from '../format'

const FILTERS: { id: Status | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' }, { id: 'pending', label: 'Pendientes' }, { id: 'sent', label: 'Enviados' },
  { id: 'failed', label: 'Con error' }, { id: 'no_whatsapp', label: 'Sin WhatsApp' }, { id: 'on_hold', label: 'En espera' }, { id: 'opted_out', label: 'No contactar' },
]

export function ProspectsPage({ initialFilter, onImport }: { initialFilter?: Status | 'all'; onImport: () => void }) {
  const toast = useToast()
  const { stats, refresh } = useStats()
  const [filter, setFilter] = useState<Status | 'all'>(initialFilter ?? 'all')
  const [search, setSearch] = useState('')
  const q = useDebounced(search)
  const [page, setPage] = useState(1)
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' }>({ key: 'created', dir: 'desc' })
  const [data, setData] = useState<Paged<Prospect> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [editing, setEditing] = useState<Prospect | 'new' | null>(null)
  const [bulkConfirm, setBulkConfirm] = useState(false)

  const load = useCallback(async () => {
    try {
      setData(await api<Paged<Prospect>>('GET', `/prospects${qs({ status: filter, q, page, pageSize: 25, sort: sort.key, dir: sort.dir })}`))
      setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }, [filter, q, page, sort])

  useEffect(() => { void load() }, [load, stats?.total, stats?.counts.sent])
  useEffect(() => { setPage(1); setSelected(new Set()) }, [filter, q])
  // Refresco suave para ver el avance de envíos en vivo.
  useEffect(() => { const t = window.setInterval(() => { if (document.visibilityState === 'visible' && !editing) void load() }, 5000); return () => window.clearInterval(t) }, [load, editing])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1
  const items = data?.items ?? []
  const allSelected = items.length > 0 && items.every((p) => selected.has(p.id))
  const toggle = (id: number) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })

  const bulk = async (action: 'delete' | 'hold' | 'release') => {
    try {
      const res = await api<{ affected: number; skipped: number }>('POST', '/prospects/bulk', { action, ids: [...selected] })
      toast(`${res.affected} actualizado(s)${res.skipped ? ` · ${res.skipped} omitido(s) (ya contactados o no aplica)` : ''}`)
      setSelected(new Set()); void load(); void refresh()
    } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error') }
  }

  const sortBy = (key: string) => setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))
  const counts = stats?.counts
  const countFor = (id: Status | 'all') => id === 'all' ? stats?.total : counts?.[id]
  const sortMark = (key: string) => sort.key === key ? (sort.dir === 'asc' ? ' ▲' : ' ▼') : ''

  return <>
    <PageHeader eyebrow="BASE DE CLIENTES" title="Prospectos" subtitle="Agrega, edita y da seguimiento a cada cliente. Los ya contactados quedan protegidos."
      actions={<>
        <Button icon={<ArrowDownToLine size={16} />} onClick={() => downloadUrl(`/api/prospects/export.csv${qs({ status: filter, q })}`)}>Exportar</Button>
        <Button onClick={onImport}>Importar Excel</Button>
        <Button variant="primary" icon={<Plus size={16} />} onClick={() => setEditing('new')}>Nuevo prospecto</Button>
      </>} />

    <section className="card table-card">
      <div className="toolbar">
        <div className="chips" role="tablist" aria-label="Filtrar por estado">
          {FILTERS.map((f) => <button key={f.id} role="tab" aria-selected={filter === f.id} className={`chip ${filter === f.id ? 'on' : ''}`} onClick={() => setFilter(f.id)}>{f.label}<span>{countFor(f.id) ?? '·'}</span></button>)}
        </div>
        <label className="search"><Search size={16} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nombre, DNI o celular" aria-label="Buscar prospectos" /></label>
      </div>

      {selected.size > 0 && <div className="bulkbar" role="region" aria-label="Acciones masivas">
        <strong>{selected.size} seleccionado(s)</strong>
        <div className="btn-row">
          <Button icon={<Pause size={15} />} onClick={() => void bulk('hold')}>Poner en espera</Button>
          <Button icon={<Play size={15} />} onClick={() => void bulk('release')}>Liberar</Button>
          <Button variant="danger" icon={<Trash2 size={15} />} onClick={() => setBulkConfirm(true)}>Eliminar</Button>
          <Button variant="ghost" onClick={() => setSelected(new Set())}>Quitar selección</Button>
        </div>
      </div>}

      {error ? <ErrorBox message={error} onRetry={() => void load()} /> : !data ? <Spinner /> : !items.length ? (
        <Empty icon={<Users size={22} />} title={q || filter !== 'all' ? 'No encontramos prospectos' : 'Aún no hay prospectos'}
          text={q || filter !== 'all' ? 'Prueba con otro término o cambia el filtro.' : 'Importa tu base desde Excel o agrega el primer cliente manualmente.'}
          action={!q && filter === 'all' ? <div className="btn-row"><Button variant="primary" onClick={onImport}>Importar Excel</Button><Button onClick={() => setEditing('new')}>Agregar manualmente</Button></div> : undefined} />
      ) : <>
        <div className="table-wrap"><table className="data responsive">
          <thead><tr>
            <th className="col-check"><input type="checkbox" aria-label="Seleccionar todos" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(items.map((p) => p.id)))} /></th>
            <th><button className="th-sort" onClick={() => sortBy('name')}>Cliente{sortMark('name')}</button></th><th>DNI</th><th>WhatsApp</th>
            <th><button className="th-sort" onClick={() => sortBy('status')}>Estado{sortMark('status')}</button></th><th className="num">Monto</th><th className="num">Tasa</th>
            <th><button className="th-sort" onClick={() => sortBy('sent')}>Enviado{sortMark('sent')}</button></th><th><span className="sr-only">Editar</span></th>
          </tr></thead>
          <tbody>{items.map((p) => <tr key={p.id} className={selected.has(p.id) ? 'selected' : ''} onClick={() => setEditing(p)}>
            <td className="col-check" data-label="" onClick={(e) => e.stopPropagation()}><input type="checkbox" aria-label={`Seleccionar ${p.name}`} checked={selected.has(p.id)} onChange={() => toggle(p.id)} /></td>
            <td data-label="Cliente" className="cell-main"><div className="person"><span className="avatar">{initials(p.name)}</span><div><strong>{p.name}</strong>{p.repliedAt && <small className="replied"><MessageCircle size={12} /> Respondió</small>}</div></div></td>
            <td data-label="DNI" className="mono">{p.dni}</td>
            <td data-label="WhatsApp">{formatPhone(p.phone)}</td>
            <td data-label="Estado"><StatusBadge status={p.status} /></td>
            <td data-label="Monto" className="num">{formatMoney(p.offerAmount)}</td>
            <td data-label="Tasa" className="num">{formatRate(p.rate)}</td>
            <td data-label="Enviado">{formatDateTime(p.sentAt)}</td>
            <td data-label="" className="col-action"><button className="icon-btn" aria-label={`Editar ${p.name}`}><Pencil size={16} /></button></td>
          </tr>)}</tbody>
        </table></div>
        <div className="pager">
          <span>{data.total} prospecto(s) · página {page} de {totalPages}</span>
          <div className="btn-row"><Button disabled={page <= 1} icon={<ChevronLeft size={16} />} onClick={() => setPage(page - 1)}>Anterior</Button><Button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Siguiente <ChevronRight size={16} /></Button></div>
        </div>
      </>}
    </section>

    {editing && <ProspectModal prospect={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void load(); void refresh() }} />}
    {bulkConfirm && <ConfirmDialog danger title={`¿Eliminar ${selected.size} prospecto(s)?`} confirmLabel="Eliminar"
      text="Los clientes ya contactados no se eliminan en bloque. Esta acción queda registrada en el historial." onCancel={() => setBulkConfirm(false)}
      onConfirm={async () => { await bulk('delete'); setBulkConfirm(false) }} />}
  </>
}

interface Msg { id: number; body: string; status: string; error: string | null; created_at: string; sent_at: string | null }

function ProspectModal({ prospect, onClose, onSaved }: { prospect: Prospect | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast()
  const locked = prospect?.status === 'sent' || prospect?.status === 'sending'
  const [form, setForm] = useState({
    dni: prospect?.dni ?? '', name: prospect?.name ?? '', phone: prospect ? formatPhone(prospect.phone) : '',
    offerAmount: prospect?.offerAmount?.toString() ?? '', rate: prospect?.rate?.toString() ?? '', notes: prospect?.notes ?? '',
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [messages, setMessages] = useState<Msg[] | null>(null)
  const [confirm, setConfirm] = useState<'delete' | 'resend' | null>(null)
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const initial = useMemo(() => JSON.stringify(form), [])  // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(form) !== initial

  useEffect(() => {
    if (prospect) api<{ messages: Msg[] }>('GET', `/prospects/${prospect.id}`).then((r) => setMessages(r.messages)).catch(() => setMessages([]))
  }, [prospect])

  const save = async () => {
    setBusy(true); setError('')
    try {
      const body = { dni: form.dni, name: form.name, phone: form.phone, offerAmount: form.offerAmount === '' ? null : form.offerAmount, rate: form.rate === '' ? null : form.rate, notes: form.notes }
      if (prospect) await api('PATCH', `/prospects/${prospect.id}`, body)
      else await api('POST', '/prospects', body)
      toast(prospect ? 'Cambios guardados' : 'Prospecto agregado')
      onSaved()
    } catch (e) { setError(e instanceof ApiError ? e.message : 'No se pudo guardar') } finally { setBusy(false) }
  }

  const quick = async (status: 'on_hold' | 'pending') => {
    try { await api('PATCH', `/prospects/${prospect!.id}`, { status }); toast(status === 'on_hold' ? 'Puesto en espera' : 'Liberado para envío'); onSaved() }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error') }
  }

  return <>
    <Modal wide title={prospect ? 'Detalle del prospecto' : 'Nuevo prospecto'} onClose={onClose}
      footer={<>
        {prospect && <div className="foot-left">
          <Button variant="ghost" icon={<Trash2 size={15} />} onClick={() => setConfirm('delete')}>Eliminar</Button>
          {(prospect.status === 'sent' || prospect.status === 'failed' || prospect.status === 'no_whatsapp') && <Button variant="ghost" icon={<RotateCcw size={15} />} onClick={() => setConfirm('resend')}>Volver a enviar</Button>}
          {prospect.status === 'on_hold' && <Button variant="ghost" icon={<Play size={15} />} onClick={() => void quick('pending')}>Liberar</Button>}
          {prospect.status === 'pending' && <Button variant="ghost" icon={<Pause size={15} />} onClick={() => void quick('on_hold')}>Poner en espera</Button>}
        </div>}
        <Button onClick={onClose}>Cerrar</Button>
        <Button variant="primary" busy={busy} disabled={!dirty && !!prospect} onClick={() => void save()}>{prospect ? 'Guardar cambios' : 'Agregar'}</Button>
      </>}>
      {prospect && <div className="detail-head"><StatusBadge status={prospect.status} />
        {prospect.sentAt && <span className="muted-text">Enviado el {formatDateTime(prospect.sentAt)}</span>}
        {prospect.attempts > 0 && prospect.status !== 'sent' && <span className="muted-text">{prospect.attempts} intento(s)</span>}</div>}
      {locked && <div className="alert alert-info">Este cliente ya fue contactado: el DNI y el WhatsApp están bloqueados para que el registro no cambie. Puedes editar monto, tasa y notas.</div>}
      {prospect?.lastError && prospect.status !== 'sent' && <div className="alert alert-error"><div><strong>Último error</strong><p>{prospect.lastError}</p></div></div>}
      {prospect?.replyText && <div className="alert alert-info"><div><strong>Respuesta del cliente</strong><p>{prospect.replyText}</p></div></div>}
      <div className="form-grid">
        <Field label="Nombre completo"><input value={form.name} onChange={set('name')} autoComplete="off" /></Field>
        <Field label="DNI" hint="8 dígitos"><input value={form.dni} onChange={set('dni')} inputMode="numeric" maxLength={8} disabled={locked} /></Field>
        <Field label="WhatsApp" hint="Celular de 9 dígitos"><input value={form.phone} onChange={set('phone')} inputMode="tel" disabled={locked} /></Field>
        <Field label="Monto ofertado (S/)" hint="Opcional hasta enviar"><input value={form.offerAmount} onChange={set('offerAmount')} inputMode="decimal" placeholder="32500" /></Field>
        <Field label="Tasa referencial (%)"><input value={form.rate} onChange={set('rate')} inputMode="decimal" placeholder="11.9" /></Field>
        <div className="span-2"><Field label="Notas internas"><textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="Ej. Pidió que lo llamen en la tarde" /></Field></div>
      </div>
      {error && <p className="field-error" role="alert">{error}</p>}
      {prospect && <div className="msg-history"><h4>Mensajes enviados</h4>
        {messages === null ? <Spinner /> : !messages.length ? <p className="muted-text">Todavía no se le ha enviado nada.</p> :
          messages.map((m) => <div key={m.id} className="msg"><div className="msg-meta"><span className={`badge badge-${m.status === 'sent' ? 'green' : m.status === 'superseded' ? 'neutral' : 'red'}`}><i />{m.status === 'sent' ? 'Enviado' : m.status === 'superseded' ? 'Reemplazado' : m.status === 'sending' ? 'Enviando' : 'No confirmado'}</span><time>{formatDateTime(m.sent_at ?? m.created_at)}</time></div><p>{m.body}</p>{m.error && <small className="error-text">{m.error}</small>}</div>)}
      </div>}
    </Modal>
    {confirm === 'delete' && prospect && <ConfirmDialog danger title="¿Eliminar este prospecto?" confirmLabel="Eliminar"
      text={prospect.status === 'sent' ? 'Este cliente ya fue contactado. Se eliminará de la lista, pero el registro del mensaje enviado se conserva en el historial.' : 'Se eliminará de la lista. Queda registrado en el historial.'}
      onCancel={() => setConfirm(null)}
      onConfirm={async () => { try { await api('DELETE', `/prospects/${prospect.id}${prospect.status === 'sent' ? '?force=true' : ''}`); toast('Prospecto eliminado'); onSaved() } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); setConfirm(null) } }} />}
    {confirm === 'resend' && prospect && <ConfirmDialog title="¿Volver a enviar a este cliente?" confirmLabel="Sí, volver a enviar"
      text={<>Volverá a la cola como <b>{STATUS_LABEL.pending.toLowerCase()}</b> y recibirá el mensaje otra vez. El envío anterior queda en el historial como reemplazado.</>}
      onCancel={() => setConfirm(null)}
      onConfirm={async () => { try { await api('POST', `/prospects/${prospect.id}/resend`); toast('Cliente puesto de nuevo en la cola'); onSaved() } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error'); setConfirm(null) } }} />}
  </>
}
