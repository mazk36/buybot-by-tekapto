import { useCallback, useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { api } from '../api'
import { Button, Empty, ErrorBox, Field, Modal, PageHeader, Spinner, useToast } from '../ui'
import { useStats } from '../store'
import { formatPhone } from '../format'

type Item = { id: number; name: string; phone: string }
export function ReviewPage({ openProspects }: { openProspects: () => void }) {
  const { stats, refresh } = useStats()
  const toast = useToast()
  const [items, setItems] = useState<Item[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Item | null>(null)
  const [amount, setAmount] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => { try { setItems((await api<{items:Item[]}>('GET','/sales')).items); setError(null) } catch(e) { setError(e instanceof Error ? e.message : 'Error') } }, [])
  useEffect(() => { void load() }, [load, stats?.counts.sent])
  const record = async (item: Item, outcome: 'sold' | 'dismissed') => {
    setBusy(true)
    try { await api('POST', `/sales/${item.id}`, {outcome, amount: outcome === 'sold' ? Number(amount) : undefined}); setSelected(null); setAmount(''); await load(); await refresh(); toast(outcome === 'sold' ? 'Venta registrada' : 'Contacto retirado de ventas') }
    catch(e) { toast(e instanceof Error ? e.message : 'Error', 'error') } finally { setBusy(false) }
  }
  return <><PageHeader eyebrow="SEGUIMIENTO" title="Ventas" subtitle="Registra las ventas de tus contactos enviados." actions={<Button onClick={openProspects}>Ver prospectos</Button>} />
    {error ? <ErrorBox message={error} onRetry={() => void load()} /> : !items ? <Spinner /> : !items.length ? <section className="card"><Empty icon={<Check size={22}/>} title="Sin ventas por registrar" text="Los contactos enviados aparecerán aquí." /></section> : <section className="card list-card">{items.map(item => <article className="review-item" key={item.id}><div className="rv-main"><strong>{item.name}</strong><p>{formatPhone(item.phone)}</p></div><Button icon={<Check size={16}/>} onClick={() => setSelected(item)}>Venta</Button><Button icon={<X size={16}/>} busy={busy} onClick={() => void record(item, 'dismissed')}>Quitar</Button></article>)}</section>}
    {selected && <Modal title={`Registrar venta de ${selected.name}`} onClose={() => setSelected(null)} footer={<><Button onClick={() => setSelected(null)}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!amount || Number(amount) <= 0} onClick={() => void record(selected, 'sold')}>Guardar venta</Button></>}><Field label="Monto vendido (S/)"><input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></Field></Modal>}
  </>
}
