import { useState } from 'react'
import type { FormEvent } from 'react'
import { LockKeyhole } from 'lucide-react'
import { api } from '../api'
import type { User } from '../api'
import { Button, Field } from '../ui'

export function LoginPage({ needsSetup, onUser }: { needsSetup: boolean; onUser: (u: User) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const res = await api<{ user: User }>('POST', needsSetup ? '/auth/setup' : '/auth/login', { email, password, name })
      onUser(res.user)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión') } finally { setBusy(false) }
  }

  return <main className="auth-page">
    <form className="auth-card" onSubmit={submit} noValidate>
      <div className="auth-brand"><img src="/buybot-robot.png" alt="" /><strong>Buy<span>Bot</span></strong></div>
      <h1>{needsSetup ? 'Crea tu cuenta' : 'Inicia sesión'}</h1>
      <p className="muted-text">{needsSetup ? 'Es la primera vez que abres BuyBot. Crea la cuenta con la que vas a administrar tus envíos.' : 'Ingresa para administrar tus prospectos y envíos.'}</p>
      {needsSetup && <Field label="Tu nombre"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Cristina" /></Field>}
      <Field label="Correo electrónico"><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="tu@correo.com" required /></Field>
      <Field label="Contraseña" hint={needsSetup ? 'Mínimo 8 caracteres.' : undefined}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={needsSetup ? 'new-password' : 'current-password'} required />
      </Field>
      {error && <p className="field-error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" busy={busy} className="btn-block" icon={<LockKeyhole size={16} />}>{needsSetup ? 'Crear cuenta y entrar' : 'Entrar'}</Button>
    </form>
  </main>
}
