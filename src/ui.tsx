import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, LoaderCircle, X } from 'lucide-react'
import type { Status } from './api'

// ---------- Toasts ----------
type ToastKind = 'ok' | 'error' | 'info'
const ToastCtx = createContext<(message: string, kind?: ToastKind) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<{ id: number; message: string; kind: ToastKind }[]>([])
  const counter = useRef(0)
  const push = useCallback((message: string, kind: ToastKind = 'ok') => {
    const id = ++counter.current
    setItems((list) => [...list.slice(-2), { id, message, kind }])
    window.setTimeout(() => setItems((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6000 : 3500)
  }, [])
  return <ToastCtx.Provider value={push}>
    {children}
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>
        {t.kind === 'ok' ? <CheckCircle2 size={17} /> : t.kind === 'error' ? <AlertTriangle size={17} /> : <Info size={17} />}
        <span>{t.message}</span>
      </div>)}
    </div>
  </ToastCtx.Provider>
}

// ---------- Botones ----------
type Variant = 'primary' | 'outline' | 'danger' | 'ghost'
export function Button({ variant = 'outline', busy, icon, children, className = '', ...rest }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean; icon?: ReactNode }) {
  return <button {...rest} disabled={rest.disabled || busy} className={`btn btn-${variant} ${className}`}>
    {busy ? <LoaderCircle size={16} className="spin" /> : icon}{children}
  </button>
}

// ---------- Modal / confirmación ----------
export function Modal({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId()
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    ref.current?.querySelector<HTMLElement>('input,select,textarea,button.btn-primary')?.focus()
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; previous?.focus() }
  }, [onClose])
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={ref} className={`modal ${wide ? 'modal-wide' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <div className="modal-head"><h2 id={titleId}>{title}</h2><button className="icon-btn" aria-label="Cerrar" onClick={onClose}><X size={19} /></button></div>
      <div className="modal-body">{children}</div>
      {footer && <div className="modal-foot">{footer}</div>}
    </div>
  </div>
}

export function ConfirmDialog({ title, text, confirmLabel, danger, onConfirm, onCancel }:
  { title: string; text: ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void> | void; onCancel: () => void }) {
  const [busy, setBusy] = useState(false)
  return <Modal title={title} onClose={onCancel} footer={<>
    <Button onClick={onCancel}>Cancelar</Button>
    <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={async () => { setBusy(true); try { await onConfirm() } finally { setBusy(false) } }}>{confirmLabel}</Button>
  </>}><div className="muted-text">{text}</div></Modal>
}

// ---------- Formularios ----------
export function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: ReactNode }) {
  const id = useId()
  return <div className="field">
    <label htmlFor={id}>{label}</label>
    <div className="field-control" data-id={id}>{children}</div>
    {error ? <p className="field-error" role="alert">{error}</p> : hint ? <p className="field-hint">{hint}</p> : null}
  </div>
}

// ---------- Etiquetas de estado ----------
export const STATUS_LABEL: Record<Status, string> = {
  pending: 'Pendiente', sending: 'Enviando', sent: 'Enviado', failed: 'Con error', no_whatsapp: 'Sin WhatsApp', opted_out: 'No contactar', on_hold: 'En espera',
}
const STATUS_TONE: Record<Status, string> = {
  pending: 'neutral', sending: 'blue', sent: 'green', failed: 'red', no_whatsapp: 'amber', opted_out: 'red', on_hold: 'neutral',
}
export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge badge-${STATUS_TONE[status]}`}><i />{STATUS_LABEL[status]}</span>
}

// ---------- Estructura ----------
export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: string; title: string; subtitle?: string; actions?: ReactNode }) {
  return <header className="page-header">
    <div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
    {actions && <div className="page-actions">{actions}</div>}
  </header>
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return <div className="empty"><span className="empty-icon">{icon}</span><strong>{title}</strong>{text && <p>{text}</p>}{action}</div>
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return <div className="loading" role="status"><LoaderCircle className="spin" size={20} /><span>{label}</span></div>
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="alert alert-error" role="alert"><AlertTriangle size={18} /><div><strong>No se pudo cargar</strong><p>{message}</p></div>{onRetry && <Button onClick={onRetry}>Reintentar</Button>}</div>
}

export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => { const t = window.setTimeout(() => setV(value), ms); return () => window.clearTimeout(t) }, [value, ms])
  return v
}

/** Ejecuta `fn` ahora y cada `ms` mientras la pestaña esté visible. */
export function usePolling(fn: () => void, ms: number, deps: unknown[] = []) {
  const saved = useRef(fn)
  saved.current = fn
  useEffect(() => {
    let timer: number | undefined
    const run = () => { if (document.visibilityState === 'visible') saved.current() }
    run()
    timer = window.setInterval(run, ms)
    const onVisible = () => { if (document.visibilityState === 'visible') saved.current() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ms, ...deps])
}
