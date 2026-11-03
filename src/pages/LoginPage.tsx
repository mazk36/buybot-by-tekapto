import { useState } from 'react'
import type { FormEvent } from 'react'
import { BookOpen, LockKeyhole, UserPlus } from 'lucide-react'
import { api } from '../api'
import type { User } from '../api'
import { Button, Field, Modal } from '../ui'
import { TutorialSteps } from './TutorialPage'
import { TekaptoSignature } from '../Brand'

export function LoginPage({ needsSetup, canCreateAccount, onUser }: { needsSetup: boolean; canCreateAccount: boolean; onUser: (u: User, canCreateAccount?: boolean) => void }) {
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [code, setCode] = useState('')
  const [creatingAccount, setCreatingAccount] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [showTutorial, setShowTutorial] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError('')
    try {
      const path = needsSetup ? '/auth/setup' : creatingAccount ? '/auth/create-account' : '/auth/login'
      const body = creatingAccount ? { email, password, confirmPassword, name, code } : { email, password, name }
      const res = await api<{ user: User; canCreateAccount?: boolean }>('POST', path, body)
      onUser(res.user, res.canCreateAccount)
    } catch (err) { setError(err instanceof Error ? err.message : 'No se pudo iniciar sesión') } finally { setBusy(false) }
  }

  return <>
  <main className="auth-page">
    <div className="auth-layout">
    <section className="auth-welcome" aria-label="Acerca de BuyBot">
      <TekaptoSignature />
      <div className="auth-intro">
        <div className="auth-eyebrow"><span /> PLATAFORMA / BUYBOT</div>
        <h1>Una mejor forma de conectar<span>.</span></h1>
        <p>Organiza tus prospectos y gestiona tus primeros contactos desde un solo lugar.</p>
      </div>
      <div className="auth-meta"><span>AUTOMATIZACIÓN COMERCIAL</span><span>BUYBOT / 01</span></div>
    </section>
    <form className="auth-card" onSubmit={submit} noValidate>
      <div className="auth-brand"><img src="/buybot-robot.png" alt="" /><div><strong>BuyBot<span>.</span></strong><small>BY TEKAPTO</small></div></div>
      <h1>{needsSetup || creatingAccount ? 'Crea tu cuenta' : 'Inicia sesión'}</h1>
      <p className="muted-text">{needsSetup
        ? 'Es la primera vez que abres BuyBot. Crea la cuenta con la que vas a administrar tus envíos.'
        : creatingAccount
          ? 'Usa el código de un solo uso que te dio el administrador para configurar tu acceso.'
          : 'Ingresa para administrar tus prospectos y envíos.'}</p>
      {(needsSetup || creatingAccount) && <Field label="Tu nombre"><input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Cristina" required /></Field>}
      <Field label="Correo electrónico"><input type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="tu@correo.com" required /></Field>
      {creatingAccount && <Field label="Código de alta" hint="Solicita el código al administrador de BuyBot.">
        <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" required />
      </Field>}
      <Field label="Contraseña" hint={needsSetup || creatingAccount ? 'Mínimo 8 caracteres.' : undefined}>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={needsSetup || creatingAccount ? 'new-password' : 'current-password'} minLength={needsSetup || creatingAccount ? 8 : undefined} required />
      </Field>
      {creatingAccount && <Field label="Confirma la contraseña">
        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" minLength={8} required />
      </Field>}
      {error && <p className="field-error" role="alert">{error}</p>}
      <Button type="submit" variant="primary" busy={busy} className="btn-block" icon={<LockKeyhole size={16} />}>{needsSetup || creatingAccount ? 'Crear cuenta y entrar' : 'Entrar'}</Button>
      {!needsSetup && canCreateAccount && !creatingAccount && <Button type="button" variant="outline" className="btn-block" icon={<UserPlus size={16} />} onClick={() => { setCreatingAccount(true); setPassword(''); setError('') }}>Crear cuenta</Button>}
      {creatingAccount && <button type="button" className="auth-switch" onClick={() => { setCreatingAccount(false); setCode(''); setConfirmPassword(''); setError('') }}>Volver a iniciar sesión</button>}
      <button type="button" className="tutorial-link" onClick={() => setShowTutorial(true)}><BookOpen size={16} /> Ver tutorial paso a paso</button>
    </form>
    </div>
  </main>
  {showTutorial && <Modal title="Cómo funciona BuyBot" onClose={() => setShowTutorial(false)} wide>
    <TutorialSteps compact />
  </Modal>}
  </>
}
