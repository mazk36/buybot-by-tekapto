import { CheckCheck, MessageCircle, Sparkles } from 'lucide-react'
import { formatPhone } from '../utils/format'

interface WhatsAppPreviewProps {
  name?: string
  phone?: string
  message?: string | null
  sending?: boolean
  sent?: boolean
}

export function WhatsAppPreview({ name, phone, message, sending = false, sent = false }: WhatsAppPreviewProps) {
  return (
    <section className="wa-card">
      <div className="wa-topbar">
        <div className="wa-avatar"><MessageCircle size={16} /></div>
        <div className="wa-person"><strong>{name || 'Vista previa'}</strong><span>{phone ? formatPhone(phone) : 'Canal de contacto'}</span></div>
        <span className="wa-secure">Canal seguro</span>
      </div>
      <div className="wa-chat">
        <div className="wa-day">HOY</div>
        {message ? <div className="wa-message"><p>{message}</p><div className="wa-message-meta">12:43 <CheckCheck size={13} className={sent ? 'sent-check' : ''} /></div></div> : (
          <div className="wa-placeholder"><Sparkles size={16} /><span>El mensaje personalizado aparecerá aquí</span></div>
        )}
      </div>
      <div className={`wa-status ${sent ? 'is-sent' : sending ? 'is-sending' : ''}`}>
        <span className="wa-status-dot" />{sent ? 'Mensaje enviado' : sending ? 'Enviando mensaje…' : message ? 'Mensaje listo para enviar' : 'Esperando cliente apto'}
      </div>
    </section>
  )
}
