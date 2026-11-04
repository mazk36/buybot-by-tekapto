import { useEffect, useState } from 'react'
import { CheckCircle2, CloudOff, LoaderCircle, Plug, PlugZap, Plus, QrCode, RefreshCw, Send, Server, Smartphone, WifiOff } from 'lucide-react'
import { api } from '../api'
import type { WaStatus } from '../api'
import { Button, ConfirmDialog, Field, Modal, PageHeader, useToast, usePolling } from '../ui'
import { useStats } from '../store'
import { formatPhone } from '../format'

export function waLabel(state: WaStatus['state'] | undefined): { text: string; tone: 'green' | 'amber' | 'red' | 'neutral' } {
  switch (state) {
    case 'connected': return { text: 'WhatsApp conectado', tone: 'green' }
    case 'connecting': return { text: 'Esperando escaneo del QR', tone: 'amber' }
    case 'evolution_unreachable': return { text: 'Sin conexión con Evolution', tone: 'red' }
    case 'evolution_not_configured': return { text: 'Evolution sin configurar', tone: 'red' }
    case undefined: return { text: 'Verificando…', tone: 'neutral' }
    default: return { text: 'WhatsApp desconectado', tone: 'red' }
  }
}

export function WhatsAppPage() {
  const toast = useToast()
  const { refresh } = useStats()
  const [accounts, setAccounts] = useState<AccountView[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'disconnect' | 'reset' | null>(null)
  const [testOpen, setTestOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [, tick] = useState(0)

  const load = async () => {
    try {
      const result = await api<{ accounts: AccountView[] }>('GET', '/whatsapp/accounts')
      setAccounts(result.accounts)
      setSelectedId((current) => result.accounts.some((account) => account.id === current) ? current : result.accounts[0]?.id ?? '')
    } catch { /* el banner global lo muestra */ }
  }
  usePolling(() => void load(), 2000)
  useEffect(() => { const t = window.setInterval(() => tick((n) => n + 1), 1000); return () => window.clearInterval(t) }, [])

  const act = async (name: string, action: string, okMessage?: string) => {
    if (!selectedId) return
    setBusy(name)
    try { await api('POST', `/whatsapp/accounts/${encodeURIComponent(selectedId)}/${action}`); await load(); if (okMessage) toast(okMessage); void refresh() }
    catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error') }
    finally { setBusy(null) }
  }

  const wa = accounts.find((account) => account.id === selectedId)?.status ?? null
  const state = wa?.state
  const qrLeft = wa?.qrAgeSeconds != null ? Math.max(0, 24 - wa.qrAgeSeconds) : null

  return <>
    <PageHeader eyebrow="CONEXIÓN" title="WhatsApp" subtitle="Vincula uno o más números y administra cada conexión por separado."
      actions={<Button variant="primary" icon={<Plus size={16} />} onClick={() => setAddOpen(true)}>Agregar WhatsApp</Button>} />
    <div className="alert alert-warn">El QR usa Evolution API para vincular una sesión de WhatsApp Web de terceros. WhatsApp no la respalda y advierte que el uso de clientes no oficiales puede causar bloqueos. Para una operación estable, conviene migrar a la plataforma oficial de WhatsApp Business.</div>
    <div className="wa-accounts" aria-label="Números de WhatsApp">
      {accounts.map((account) => <button key={account.id} type="button" className={`wa-account ${selectedId === account.id ? 'active' : ''}`} aria-pressed={selectedId === account.id} onClick={() => setSelectedId(account.id)}>
        <strong>{account.label}</strong><span>{account.status.phone ? `+${account.status.phone}` : waLabel(account.status.state).text}</span>
        <small>{account.sentToday} / {account.dailyLimit} intentos hoy</small>
      </button>)}
    </div>
    <div className="wa-layout">
      <section className="card wa-main" aria-live="polite">
        {!wa && <div className="wa-state"><LoaderCircle className="spin" size={28} /><h2>Verificando conexión…</h2></div>}

        {state === 'evolution_not_configured' && <div className="wa-state">
          <span className="wa-icon tone-red"><Server size={28} /></span>
          <h2>Falta conectar Evolution API</h2>
          <p className="muted-text">El servidor de BuyBot no tiene la dirección o la clave de Evolution API. Agrega <code>EVOLUTION_API_URL</code> y <code>EVOLUTION_API_KEY</code> en el archivo <code>.env</code> y reinicia.</p>
        </div>}

        {state === 'evolution_unreachable' && <div className="wa-state">
          <span className="wa-icon tone-red"><CloudOff size={28} /></span>
          <h2>No hay comunicación con Evolution API</h2>
          <p className="muted-text">{wa?.message ?? 'El servicio no responde.'} Seguimos intentando automáticamente; los envíos esperan hasta que vuelva.</p>
          <Button icon={<RefreshCw size={16} />} onClick={() => void load()}>Reintentar ahora</Button>
        </div>}

        {(state === 'no_instance' || state === 'disconnected') && <div className="wa-state">
          <span className="wa-icon tone-neutral"><WifiOff size={28} /></span>
          <h2>Este número no está conectado</h2>
          <p className="muted-text">Conecta el WhatsApp de la asesora escaneando un código QR desde el celular. Solo toma unos segundos.</p>
          <Button variant="primary" icon={<QrCode size={17} />} busy={busy === 'connect'} onClick={() => void act('connect', 'connect')}>Conectar WhatsApp</Button>
        </div>}

        {state === 'connecting' && <div className="wa-state">
          <h2>Escanea el código QR</h2>
          <div className="qr-box">
            {wa?.qr ? <img src={wa.qr} alt="Código QR para vincular WhatsApp" className={qrLeft === 0 ? 'qr-stale' : ''} /> : <div className="qr-loading"><LoaderCircle className="spin" size={30} /><span>Generando código…</span></div>}
          </div>
          {qrLeft !== null && <div className="qr-timer" aria-hidden><i style={{ width: `${(qrLeft / 24) * 100}%` }} /></div>}
          <p className="muted-text small">{wa?.qr ? 'El código se renueva solo cada pocos segundos.' : 'Esto puede tardar unos segundos.'}</p>
          {wa?.pairingCode && <p className="pairing">O ingresa el código: <strong>{wa.pairingCode}</strong></p>}
          <div className="btn-row">
            <Button onClick={() => void act('disconnect', 'disconnect')} busy={busy === 'disconnect'}>Cancelar</Button>
            <Button variant="ghost" icon={<RefreshCw size={16} />} onClick={() => setConfirm('reset')}>¿No aparece el QR?</Button>
          </div>
        </div>}

        {state === 'connected' && <div className="wa-state">
          <span className="wa-icon tone-green"><CheckCircle2 size={30} /></span>
          <h2>WhatsApp conectado</h2>
          <div className="wa-number"><Smartphone size={18} /><strong>{wa?.phone ? `+${wa.phone.slice(0, 2)} ${formatPhone(wa.phone)}` : 'Número vinculado'}</strong>{wa?.profileName && <span>{wa.profileName}</span>}</div>
          <p className="muted-text">Todo listo para enviar. Si el celular pierde internet o se cierra la sesión, BuyBot pausa el envío y te pedirá volver a conectar.</p>
          <div className="btn-row">
            <Button icon={<Send size={16} />} onClick={() => setTestOpen(true)}>Enviar mensaje de prueba</Button>
            <Button variant="danger" icon={<Plug size={16} />} onClick={() => setConfirm('disconnect')}>Desconectar</Button>
          </div>
        </div>}
      </section>

      <aside className="card wa-help">
        <h3>Cómo vincular</h3>
        <ol className="steps">
          <li><Smartphone size={16} /><span>Abre <b>WhatsApp</b> en el celular de la asesora.</span></li>
          <li><PlugZap size={16} /><span>Toca <b>Dispositivos vinculados</b> (en Ajustes o menú ⋮).</span></li>
          <li><QrCode size={16} /><span>Elige <b>Vincular un dispositivo</b> y apunta al QR.</span></li>
        </ol>
        <div className="note">BuyBot alterna los números conectados y aplica el límite diario a cada teléfono. Agregar números no garantiza evitar los límites o restricciones de WhatsApp.</div>
        {state === 'connected' && <Button variant="ghost" icon={<RefreshCw size={15} />} onClick={() => setConfirm('reset')}>Reiniciar conexión</Button>}
      </aside>
    </div>

    {confirm === 'disconnect' && <ConfirmDialog danger title="¿Desconectar WhatsApp?" confirmLabel="Desconectar"
      text="Se cerrará la sesión del número y el envío se pausará. Podrás volver a conectarlo con un nuevo QR."
      onCancel={() => setConfirm(null)} onConfirm={async () => { await act('disconnect', 'disconnect', 'WhatsApp desconectado'); setConfirm(null) }} />}
    {confirm === 'reset' && <ConfirmDialog title="¿Reiniciar la conexión?" confirmLabel="Reiniciar"
      text="Se elimina la sesión actual en Evolution y se genera un QR nuevo. Úsalo si el QR no aparece o la conexión quedó trabada. El envío se pausará."
      onCancel={() => setConfirm(null)} onConfirm={async () => { await act('reset', 'reset', 'Conexión reiniciada'); setConfirm(null) }} />}
    {testOpen && <TestDialog accountId={selectedId} onClose={() => setTestOpen(false)} />}
    {addOpen && <AddAccountDialog onClose={() => setAddOpen(false)} onAdded={async (id) => { setSelectedId(id); setAddOpen(false); await load(); void refresh() }} />}
  </>
}

interface AccountView { id: string; label: string; status: WaStatus; sentToday: number; dailyLimit: number }

function AddAccountDialog({ onClose, onAdded }: { onClose: () => void; onAdded: (id: string) => void }) {
  const [label, setLabel] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const add = async () => {
    setBusy(true); setError('')
    try { const result = await api<{ id: string }>('POST', '/whatsapp/accounts', { label }); onAdded(result.id) }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo agregar el número') }
    finally { setBusy(false) }
  }
  return <Modal title="Agregar WhatsApp" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} disabled={!label.trim()} onClick={() => void add()}>Agregar</Button></>}>
    <p className="muted-text">Dale un nombre para reconocer este número. Después podrás vincularlo con su propio QR.</p>
    <Field label="Nombre del número" error={error}><input value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} placeholder="Ej. WhatsApp de Cristina" /></Field>
  </Modal>
}

function TestDialog({ accountId, onClose }: { accountId: string; onClose: () => void }) {
  const toast = useToast()
  const [phone, setPhone] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const send = async () => {
    setBusy(true); setError('')
    try { await api('POST', `/whatsapp/accounts/${encodeURIComponent(accountId)}/test`, { phone }); toast('Mensaje de prueba enviado'); onClose() }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo enviar') } finally { setBusy(false) }
  }
  return <Modal title="Mensaje de prueba" onClose={onClose} footer={<><Button onClick={onClose}>Cancelar</Button><Button variant="primary" busy={busy} onClick={() => void send()}>Enviar prueba</Button></>}>
    <p className="muted-text">Se enviará tu plantilla con datos de ejemplo, marcada como [PRUEBA]. Usa tu propio número.</p>
    <Field label="Celular (9 dígitos)" error={error}><input inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="999 555 101" /></Field>
  </Modal>
}
