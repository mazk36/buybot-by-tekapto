import { useCallback, useEffect, useState } from 'react'
import { Activity, BookOpen, History, LayoutDashboard, Menu, MessageCircle, Moon, RotateCcw, Settings, Sun, Upload, Users, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { ApiError, api, setUnauthorizedHandler } from './api'
import type { Status, User } from './api'
import { Spinner, ToastProvider } from './ui'
import { StatsProvider, UserProvider, useStats } from './store'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ProspectsPage } from './pages/ProspectsPage'
import { ImportPage } from './pages/ImportPage'
import { SendPage } from './pages/SendPage'
import { WhatsAppPage, waLabel } from './pages/WhatsAppPage'
import { ReviewPage } from './pages/ReviewPage'
import { HistoryPage } from './pages/HistoryPage'
import { SettingsPage } from './pages/SettingsPage'
import { TutorialPage } from './pages/TutorialPage'
import { TekaptoSignature } from './Brand'

export type Page = 'dashboard' | 'prospects' | 'import' | 'send' | 'whatsapp' | 'review' | 'history' | 'settings' | 'tutorial'
const PAGES: Page[] = ['dashboard', 'prospects', 'import', 'send', 'whatsapp', 'review', 'history', 'settings', 'tutorial']
const NAV: { id: Page; label: string; icon: LucideIcon }[] = [
  { id: 'dashboard', label: 'Inicio', icon: LayoutDashboard },
  { id: 'prospects', label: 'Prospectos', icon: Users },
  { id: 'import', label: 'Importar', icon: Upload },
  { id: 'send', label: 'Envíos', icon: Activity },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'review', label: 'Ventas', icon: RotateCcw },
  { id: 'history', label: 'Historial', icon: History },
  { id: 'tutorial', label: 'Tutorial', icon: BookOpen },
]
const TITLES: Record<Page, string> = { dashboard: 'Inicio', prospects: 'Prospectos', import: 'Importar', send: 'Envíos', whatsapp: 'WhatsApp', review: 'Ventas', history: 'Historial', settings: 'Configuración', tutorial: 'Tutorial' }

const readHash = (): Page => { const h = window.location.hash.replace('#/', '') as Page; return PAGES.includes(h) ? h : 'dashboard' }

export default function App() {
  const [booting, setBooting] = useState(true)
  const [user, setUser] = useState<User | null>(null)
  const [needsSetup, setNeedsSetup] = useState(false)
  const [canCreateAccount, setCanCreateAccount] = useState(false)
  const [bootError, setBootError] = useState('')
  const [dark, setDark] = useState(() => { try { return localStorage.getItem('buybot-theme') === 'dark' } catch { return false } })

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; try { localStorage.setItem('buybot-theme', dark ? 'dark' : 'light') } catch { /* sin almacenamiento */ } }, [dark])

  const boot = useCallback(async () => {
    setBootError('')
    try { const r = await api<{ user: User | null; needsSetup: boolean; canCreateAccount: boolean }>('GET', '/auth/me'); setUser(r.user); setNeedsSetup(r.needsSetup); setCanCreateAccount(r.canCreateAccount) }
    catch (e) { setBootError(e instanceof ApiError ? e.message : 'Error') } finally { setBooting(false) }
  }, [])
  useEffect(() => { void boot() }, [boot])
  useEffect(() => { setUnauthorizedHandler(() => setUser(null)) }, [])

  const logout = async () => { try { await api('POST', '/auth/logout') } finally { setUser(null); window.location.hash = ''; void boot() } }

  return <ToastProvider>
    {booting ? <div className="boot"><Spinner label="Iniciando…" /></div>
      : bootError ? <div className="boot"><div className="alert alert-error"><div><strong>No hay conexión con BuyBot</strong><p>{bootError}</p></div><button className="btn btn-outline" onClick={() => void boot()}>Reintentar</button></div></div>
      : !user ? <LoginPage needsSetup={needsSetup} canCreateAccount={canCreateAccount} onUser={(u, canCreate) => { setUser(u); setNeedsSetup(false); if (canCreate !== undefined) setCanCreateAccount(canCreate) }} />
      : <UserProvider value={{ user, setUser, logout }}><StatsProvider><Shell dark={dark} onToggleTheme={() => setDark(!dark)} /></StatsProvider></UserProvider>}
  </ToastProvider>
}

function Shell({ dark, onToggleTheme }: { dark: boolean; onToggleTheme: () => void }) {
  const { stats, error } = useStats()
  const [page, setPageState] = useState<Page>(readHash)
  const [menu, setMenu] = useState(false)
  const [filter, setFilter] = useState<Status | 'all'>('all')

  useEffect(() => { const on = () => { setPageState(readHash()); setMenu(false); window.scrollTo(0, 0) }; window.addEventListener('hashchange', on); return () => window.removeEventListener('hashchange', on) }, [])
  const goto = (p: Page) => { window.location.hash = `#/${p}` }
  const wa = waLabel(stats?.whatsapp.state)

  useEffect(() => { document.title = `${TITLES[page]} · BuyBot by Tekapto`; if (page !== 'prospects') setFilter('all') }, [page])

  return <div className="shell">
    <aside className={`sidebar ${menu ? 'open' : ''}`} aria-label="Navegación principal">
      <div className="brand"><img src="/buybot-robot.png" alt="" /><div><strong>BuyBot<span className="brand-dot">.</span></strong><small>Automatización comercial</small></div>
        <button className="icon-btn only-mobile" aria-label="Cerrar menú" onClick={() => setMenu(false)}><X size={20} /></button></div>
      <div className="sidebar-label">ESPACIO DE TRABAJO</div>
      <nav>{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`nav ${page === id ? 'active' : ''}`} aria-current={page === id ? 'page' : undefined} onClick={() => goto(id)}>
        <Icon size={18} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-foot">
        <button className={`nav ${page === 'settings' ? 'active' : ''}`} onClick={() => goto('settings')}><Settings size={18} /><span>Configuración</span></button>
        <button className={`wa-chip tone-${wa.tone}`} onClick={() => goto('whatsapp')}><i /><span>{wa.text}</span></button>
        <div className="sidebar-signature"><span>UN PRODUCTO DE</span><TekaptoSignature /></div>
      </div>
    </aside>
    {menu && <button className="scrim" aria-label="Cerrar menú" onClick={() => setMenu(false)} />}

    <div className="main">
      <header className="topbar">
        <button className="icon-btn only-mobile" aria-label="Abrir menú" onClick={() => setMenu(true)}><Menu size={21} /></button>
        <h2 className="topbar-title">{TITLES[page]}</h2>
        <div className="topbar-right">
          <button className={`wa-chip small tone-${wa.tone}`} onClick={() => goto('whatsapp')} aria-label={wa.text}><i /><span>{wa.text}</span></button>
          <button className="icon-btn" aria-label={dark ? 'Activar modo claro' : 'Activar modo oscuro'} onClick={onToggleTheme}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
          {stats && stats.campaign.status === 'running' && <span className="live" title="Envío en curso"><i />Enviando</span>}
        </div>
      </header>
      {error && <div className="banner-error" role="alert">Sin conexión con el servidor de BuyBot. Reintentando…</div>}
      {stats && stats.whatsapp.state !== 'connected' && stats.campaign.status === 'running' && <div className="banner-warn" role="alert">WhatsApp está desconectado: el envío está en espera. <button onClick={() => goto('whatsapp')}>Reconectar</button></div>}
      <main className="content" key={page}>
        {page === 'dashboard' && <DashboardPage goto={goto} />}
        {page === 'prospects' && <ProspectsPage initialFilter={filter} onImport={() => goto('import')} />}
        {page === 'import' && <ImportPage onDone={() => { setFilter('all'); goto('prospects') }} />}
        {page === 'send' && <SendPage goto={(p) => { if (p === 'prospects') setFilter('pending'); goto(p) }} />}
        {page === 'whatsapp' && <WhatsAppPage />}
        {page === 'review' && <ReviewPage openProspects={() => { setFilter('all'); goto('prospects') }} />}
        {page === 'history' && <HistoryPage />}
        {page === 'settings' && <SettingsPage dark={dark} onToggleTheme={onToggleTheme} />}
        {page === 'tutorial' && <TutorialPage goto={goto} />}
      </main>
    </div>
  </div>
}
