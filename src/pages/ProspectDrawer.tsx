import { useEffect } from 'react'
import { LockKeyhole, Sparkles, X } from 'lucide-react'
import type { Prospect } from '../types'
import { StatusBadge } from '../components/StatusBadge'
import { getInitials } from '../components/shared'
import { formatCurrency, formatDate, formatPhone } from '../utils/format'
export function ProspectDrawer({ prospect, onClose }: { prospect: Prospect; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return <div className="drawer-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><aside className="prospect-drawer"><div className="drawer-top"><div><div className="eyebrow">FICHA DEL CLIENTE</div><h2>Detalle del prospecto</h2></div><button className="icon-button" aria-label="Cerrar ficha" onClick={onClose}><X size={19} /></button></div><div className="drawer-person"><div className="avatar avatar-red drawer-avatar">{getInitials(prospect.name)}</div><div><h3>{prospect.name}</h3><span>Prospecto · BuyBot</span></div></div><div className="drawer-status-row"><span>Estado actual</span><StatusBadge status={prospect.status} /></div><div className="drawer-section"><h4>Información personal</h4><div className="detail-grid"><Detail label="DNI" value={prospect.dni} /><Detail label="WhatsApp" value={formatPhone(prospect.phone)} /></div></div><div className="drawer-section"><h4>Oferta referencial</h4><div className="detail-grid"><Detail label="Monto disponible" value={formatCurrency(prospect.offerAmount)} /><Detail label="Tasa referencial" value={prospect.rate !== null ? `${prospect.rate.toFixed(2)} %` : '—'} /></div></div><div className="drawer-section"><h4>Seguimiento</h4><div className="detail-grid"><Detail label="Última consulta" value={formatDate(prospect.lastReview)} /><Detail label="Próxima revisión" value={formatDate(prospect.nextReview)} /><Detail label="Fecha de contacto" value={formatDate(prospect.contactDate)} /></div></div><div className="drawer-message-section"><div className="drawer-message-head"><h4>Mensaje generado</h4><span><Sparkles size={12} /> Personalizado</span></div>{prospect.message ? <div className="drawer-message">{prospect.message}</div> : <div className="drawer-message-empty">El mensaje estará disponible cuando el cliente resulte apto.</div>}</div><div className="drawer-footer"><div><LockKeyhole size={14} /> Información ficticia de demostración</div><button className="outline-button" onClick={onClose}>Cerrar ficha</button></div></aside></div>
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="detail-item"><span>{label}</span><strong>{value}</strong></div> }
