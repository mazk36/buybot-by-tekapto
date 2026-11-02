import { useCallback, useEffect, useState } from 'react'
import { PhoneOff, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { api } from '../api'
import type { Paged, Prospect } from '../api'
import { Button, Empty, ErrorBox, PageHeader, Spinner, StatusBadge, useToast } from '../ui'
import { useStats } from '../store'
import { formatDateTime, formatPhone } from '../format'

export function ReviewPage({ openProspects }: { openProspects: () => void }) {
  const toast = useToast()
  const { stats, refresh } = useStats()
  const [items, setItems] = useState<Prospect[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([api<Paged<Prospect>>('GET', '/prospects?status=failed&pageSize=100'), api<Paged<Prospect>>('GET', '/prospects?status=no_whatsapp&pageSize=100')])
      setItems([...a.items, ...b.items]); setError(null)
    } catch (e) { setError(e instanceof Error ? e.message : 'Error') }
  }, [])
  useEffect(() => { void load() }, [load, stats?.counts.failed, stats?.counts.no_whatsapp])

  const retry = async (p: Prospect) => {
    try { await api('PATCH', `/prospects/${p.id}`, { status: 'pending' }); toast('Se volverá a intentar'); void load(); void refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error') }
  }

  return <>
    <PageHeader eyebrow="SEGUIMIENTO" title="Por revisar" subtitle="Clientes a los que no se pudo enviar. Corrige el dato o reintenta."
      actions={<Button onClick={openProspects}>Editar en prospectos</Button>} />
    {error ? <ErrorBox message={error} onRetry={() => void load()} /> : !items ? <Spinner /> : !items.length ? (
      <section className="card"><Empty icon={<ShieldCheck size={22} />} title="Todo en orden" text="No hay envíos con error ni números sin WhatsApp." /></section>
    ) : <section className="card list-card">
      {items.map((p) => <article key={p.id} className="review-item">
        <span className={`rv-icon ${p.status === 'no_whatsapp' ? 'tone-amber' : 'tone-red'}`}>{p.status === 'no_whatsapp' ? <PhoneOff size={18} /> : <TriangleAlert size={18} />}</span>
        <div className="rv-main"><div className="rv-title"><strong>{p.name}</strong><StatusBadge status={p.status} /></div>
          <small>{formatPhone(p.phone)} · DNI {p.dni} · {formatDateTime(p.updatedAt)}</small>
          <p>{p.lastError ?? (p.status === 'no_whatsapp' ? 'El número no tiene WhatsApp. Verifica el celular.' : 'Error desconocido.')}</p></div>
        <Button icon={<RotateCcw size={15} />} onClick={() => void retry(p)}>Reintentar</Button>
      </article>)}
    </section>}
  </>
}
