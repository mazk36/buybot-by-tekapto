import { useEffect, useState } from 'react'
import { Database, LogOut, Moon, Save, Sun } from 'lucide-react'
import { api } from '../api'
import type { Settings, User } from '../api'
import { Button, Field, PageHeader, Spinner, useToast } from '../ui'
import { useUser } from '../store'
import { downloadUrl, renderPreview } from '../format'

export function SettingsPage({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const toast = useToast()
  const { user, setUser, logout } = useUser()
  const [saved, setSaved] = useState<Settings | null>(null)
  const [form, setForm] = useState<Settings | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { api<Settings>('GET', '/settings').then((s) => { setSaved(s); setForm(s) }).catch((e) => setError(e.message)) }, [])
  if (!form || !saved) return error ? <p className="field-error">{error}</p> : <Spinner />
  const dirty = JSON.stringify(form) !== JSON.stringify(saved)
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setForm({ ...form, [k]: v })
  const num = (k: 'dailyLimit' | 'delayMin' | 'delayMax') => (e: { target: { value: string } }) => set(k, e.target.value === '' ? (0 as never) : (Number(e.target.value) as never))

  const save = async () => {
    setBusy(true); setError('')
    try { const s = await api<Settings>('PUT', '/settings', form); const merged = { ...form, ...s }; setSaved(merged); setForm(merged); toast('Configuración guardada') }
    catch (e) { setError(e instanceof Error ? e.message : 'No se pudo guardar') } finally { setBusy(false) }
  }

  return <>
    <PageHeader eyebrow="PREFERENCIAS" title="Configuración" subtitle="Mensaje, ritmo de envío y cuenta."
      actions={<Button variant="primary" icon={<Save size={16} />} busy={busy} disabled={!dirty} onClick={() => void save()}>Guardar cambios</Button>} />
    {error && <p className="field-error" role="alert">{error}</p>}

    <div className="settings-grid">
      <section className="card">
        <h3 className="card-title">Mensaje</h3>
        <Field label="Plantilla" hint="Variables: [nombre] (un nombre y un apellido), [monto] y [tasa]. Puedes ajustar el nombre para mensajes en cada prospecto.">
          <textarea rows={8} value={form.messageTemplate} onChange={(e) => set('messageTemplate', e.target.value)} maxLength={1500} />
        </Field>
        <div className="btn-row"><Button variant="ghost" onClick={() => set('messageTemplate', saved.defaultTemplate)}>Restaurar predeterminada</Button></div>
        <div className="wa-bubble-wrap"><span className="muted-label">VISTA PREVIA</span><div className="wa-bubble">{renderPreview(form.messageTemplate)}<small>12:43 ✓✓</small></div></div>
      </section>

      <section className="card">
        <h3 className="card-title">Ritmo de envío</h3>
        <div className="form-grid">
          <Field label="Límite diario por número" hint="Intentos de envío por teléfono y día"><input type="number" min={1} max={1000} value={form.dailyLimit || ''} onChange={num('dailyLimit')} /></Field>
          <div />
          <Field label="Pausa mínima (s)" hint="Entre un mensaje y otro"><input type="number" min={5} max={600} value={form.delayMin || ''} onChange={num('delayMin')} /></Field>
          <Field label="Pausa máxima (s)"><input type="number" min={5} max={1800} value={form.delayMax || ''} onChange={num('delayMax')} /></Field>
          <Field label="Enviar desde"><input type="time" value={form.windowStart} onChange={(e) => set('windowStart', e.target.value)} /></Field>
          <Field label="Hasta"><input type="time" value={form.windowEnd} onChange={(e) => set('windowEnd', e.target.value)} /></Field>
        </div>
        <div className="note">La pausa se aplica entre mensajes. El límite cuenta los intentos iniciados por cada teléfono, incluso los que quedan sin confirmación.</div>
      </section>

      <section className="card">
        <h3 className="card-title">Mi cuenta</h3>
        <ProfileForm user={user} onUser={setUser} />
        <PasswordForm />
        <div className="btn-row">
          <Button icon={dark ? <Sun size={16} /> : <Moon size={16} />} onClick={onToggleTheme}>{dark ? 'Modo claro' : 'Modo oscuro'}</Button>
          <Button variant="danger" icon={<LogOut size={16} />} onClick={() => void logout()}>Cerrar sesión</Button>
        </div>
      </section>

      <section className="card">
        <h3 className="card-title">Datos y respaldo</h3>
        <p className="muted-text">Toda la información vive en un archivo local del servidor (<code>data/buybot.db</code>). BuyBot guarda un respaldo automático cada día (últimos 14) y puedes descargar uno cuando quieras.</p>
        <Button icon={<Database size={16} />} onClick={() => downloadUrl('/api/backup')}>Descargar respaldo</Button>
      </section>
    </div>
  </>
}

function ProfileForm({ user, onUser }: { user: User; onUser: (u: User) => void }) {
  const toast = useToast()
  const [name, setName] = useState(user.name)
  return <div className="inline-form">
    <Field label="Nombre"><input value={name} onChange={(e) => setName(e.target.value)} /></Field>
    <Field label="Correo"><input value={user.email} disabled /></Field>
    <Button disabled={name.trim() === user.name} onClick={async () => { try { const r = await api<{ user: User }>('PATCH', '/auth/profile', { name }); onUser(r.user); toast('Nombre actualizado') } catch (e) { toast(e instanceof Error ? e.message : 'Error', 'error') } }}>Guardar nombre</Button>
  </div>
}

function PasswordForm() {
  const toast = useToast()
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  return <form className="inline-form" onSubmit={async (e) => {
    e.preventDefault(); setBusy(true); setError('')
    try { await api('POST', '/auth/password', { current, next }); toast('Contraseña actualizada'); setCurrent(''); setNext('') } catch (err) { setError(err instanceof Error ? err.message : 'Error') } finally { setBusy(false) }
  }}>
    <Field label="Contraseña actual"><input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
    <Field label="Nueva contraseña" hint="Mínimo 8 caracteres" error={error}><input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
    <Button type="submit" busy={busy} disabled={!current || next.length < 8}>Cambiar contraseña</Button>
  </form>
}
