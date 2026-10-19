import { useEffect, useRef, useState } from 'react'
import { Activity, ArrowRight, Bell, Check, ChevronDown, FileSpreadsheet, History, LayoutDashboard, LockKeyhole, Menu, Moon, RotateCcw, Settings, Sparkles, Sun, Users } from 'lucide-react'
import { addAutomationEvent, advanceSimulation, stageDelay, stopSimulation } from './services/simulationEngine'
import { initialDemoState, loadDemoState, saveDemoState } from './services/storage'
import type { DemoState, HistoryEvent, Prospect } from './types'
import type { AppPage as Page, IconType } from './components/shared'
import { DashboardPage } from './pages/DashboardPage'
import { ProspectsPage } from './pages/ProspectsPage'
import { AutomationPage } from './pages/AutomationPage'
import { ImportPage } from './pages/ImportPage'
import { SecondReviewPage } from './pages/SecondReviewPage'
import { HistoryPage } from './pages/HistoryPage'
import { ProspectDrawer } from './pages/ProspectDrawer'
import { ResetDialog } from './pages/ResetDialog'
import { SettingsPage } from './pages/SettingsPage'
import { DEFAULT_MESSAGE_TEMPLATE } from './utils/format'

const navItems: { id: Page; label: string; icon: IconType }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'prospects', label: 'Prospectos', icon: Users },
  { id: 'automation', label: 'Automatización', icon: Activity },
  { id: 'import', label: 'Importar Excel', icon: FileSpreadsheet },
  { id: 'review', label: 'Segunda revisión', icon: RotateCcw },
  { id: 'history', label: 'Historial', icon: History },
]

const pageTitles: Record<Page, string> = {
  dashboard: 'Dashboard', prospects: 'Prospectos', automation: 'Automatización', import: 'Importar prospectos',
  review: 'Segunda revisión', history: 'Historial', settings: 'Configuración',
}

function createEvent(name: string, action: string, result: string, prospectId: string | null = null): HistoryEvent {
  return { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, timestamp: new Date().toISOString(), prospectId, name, action, result }
}

function App() {
  const [demo, setDemo] = useState<DemoState>(() => loadDemoState())
  const [theme, setTheme] = useState<'light' | 'dark'>(() => localStorage.getItem('buybot-theme') === 'dark' ? 'dark' : 'light')
  const [messageTemplate, setMessageTemplate] = useState(() => localStorage.getItem('buybot-message-template') ?? DEFAULT_MESSAGE_TEMPLATE)
  const [page, setPage] = useState<Page>('dashboard')
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [selected, setSelected] = useState<Prospect | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => saveDemoState(demo), [demo])
  useEffect(() => { localStorage.setItem('buybot-theme', theme) }, [theme])
  useEffect(() => { localStorage.setItem('buybot-message-template', messageTemplate) }, [messageTemplate])
  useEffect(() => () => window.clearTimeout(toastTimer.current), [])
  useEffect(() => { window.scrollTo({ top: 0, left: 0 }) }, [page])

  useEffect(() => {
    if (demo.automationStatus !== 'running') return
    const delay = demo.currentProspectId ? stageDelay(demo.stageIndex) : 280
    const timer = window.setTimeout(() => setDemo((current) => advanceSimulation(current, messageTemplate)), delay)
    return () => window.clearTimeout(timer)
  }, [demo.automationStatus, demo.currentProspectId, demo.stageIndex, messageTemplate])

  const notify = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 3200)
  }

  const startAutomation = () => {
    setDemo((current) => ({
      ...addAutomationEvent(current, current.automationStatus === 'paused' ? 'Automatización reanudada' : 'Automatización iniciada', 'Procesamiento en curso'),
      automationStatus: 'running',
    }))
    notify(demo.automationStatus === 'paused' ? 'Automatización reanudada' : 'Automatización iniciada')
  }

  const pauseAutomation = () => {
    setDemo((current) => ({ ...addAutomationEvent(current, 'Automatización pausada', 'Proceso en espera'), automationStatus: 'paused' }))
    notify('Automatización pausada')
  }

  const haltAutomation = () => {
    setDemo((current) => stopSimulation(current))
    notify('Automatización detenida')
  }

  const resetDemo = () => {
    setDemo(initialDemoState())
    setResetOpen(false)
    setSelected(null)
    setPage('dashboard')
    notify('La demostración está lista para comenzar')
  }

  const importProspects = (records: Prospect[]) => {
    if (!records.length) return
    setDemo((current) => ({
      ...current,
      prospects: [...current.prospects, ...records],
      events: [createEvent(`${records.length} prospectos`, 'Base importada', `${records.length} registros agregados`), ...current.events].slice(0, 500),
      automationStatus: current.automationStatus === 'completed' ? 'stopped' : current.automationStatus,
    }))
    notify(`${records.length} prospectos importados correctamente`)
  }

  const reopenForReview = (prospectId: string) => {
    setDemo((current) => ({
      ...current,
      prospects: current.prospects.map((item) => item.id === prospectId ? { ...item, status: 'pending', lastReview: null, nextReview: null, eligibility: null, offerAmount: null, rate: null, message: null } : item),
      events: [createEvent(current.prospects.find((item) => item.id === prospectId)?.name ?? 'Cliente', 'Revisión reprogramada', 'Cliente agregado a pendientes', prospectId), ...current.events],
      automationStatus: current.automationStatus === 'completed' ? 'stopped' : current.automationStatus,
    }))
    notify('Cliente agregado nuevamente a pendientes')
  }

  const renderedPage = () => {
    switch (page) {
      case 'dashboard': return <DashboardPage demo={demo} onNavigate={setPage} onStart={startAutomation} />
      case 'prospects': return <ProspectsPage prospects={demo.prospects} onProspect={setSelected} onImport={() => setPage('import')} />
      case 'automation': return <AutomationPage demo={demo} onStart={startAutomation} onPause={pauseAutomation} onStop={haltAutomation} />
      case 'import': return <ImportPage prospects={demo.prospects} onImport={importProspects} onDemo={() => { setDemo({ ...initialDemoState() }); notify('Se cargó la base de demostración') }} />
      case 'review': return <SecondReviewPage prospects={demo.prospects} onProspect={setSelected} onReview={reopenForReview} />
      case 'history': return <HistoryPage events={demo.events} />
      case 'settings': return <SettingsPage darkMode={theme === 'dark'} messageTemplate={messageTemplate} onMessageTemplateChange={setMessageTemplate} onToggleTheme={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} onReset={() => setResetOpen(true)} onProfile={() => notify('El perfil de demostración está listo para configurarse')} />
    }
  }

  return (
    <div className="app-shell" data-theme={theme}>
      <Sidebar active={page} onNavigate={(next) => { setPage(next); setMobileNavOpen(false) }} onReset={() => setResetOpen(true)} mobileOpen={mobileNavOpen} />
      {mobileNavOpen && <button className="mobile-scrim" aria-label="Cerrar menú" onClick={() => setMobileNavOpen(false)} />}
      <div className="main-shell">
        <header className="topbar">
          <button className="icon-button menu-button" aria-label="Abrir menú" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button>
          <div className="breadcrumb"><span>BuyBot</span><span className="breadcrumb-slash">/</span><strong>{pageTitles[page]}</strong></div>
          <div className="topbar-right">
            <div className="secure-label"><LockKeyhole size={13} /> Entorno seguro</div>
            <button className="icon-button theme-toggle" aria-label={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} title={theme === 'dark' ? 'Activar modo claro' : 'Activar modo oscuro'} onClick={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}</button>
            <button className="icon-button notification-button" aria-label="Notificaciones" onClick={() => notify('No tienes notificaciones nuevas')}><Bell size={18} /><i /></button>
            <div className="user-menu"><div className="avatar avatar-red">C</div><div className="user-copy"><strong>Cristina</strong><span>Asesora comercial</span></div><ChevronDown size={15} className="user-chevron" /></div>
          </div>
        </header>
        <main className="page-wrap" key={page}>{renderedPage()}</main>
      </div>
      {selected && <ProspectDrawer prospect={demo.prospects.find((item) => item.id === selected.id) ?? selected} onClose={() => setSelected(null)} />}
      {resetOpen && <ResetDialog onCancel={() => setResetOpen(false)} onConfirm={resetDemo} />}
      {toast && <div className="toast"><span className="toast-icon"><Check size={15} /></span>{toast}</div>}
    </div>
  )
}

function Sidebar({ active, onNavigate, onReset, mobileOpen }: { active: Page; onNavigate: (page: Page) => void; onReset: () => void; mobileOpen: boolean }) {
  return (
    <aside className={`sidebar ${mobileOpen ? 'sidebar-open' : ''}`}>
      <div className="brand-lockup"><img className="brand-symbol" src="/buybot-robot.png" alt="Robot naranja de BuyBot" /><div><strong>Buy<span>Bot</span></strong><small>Automatización comercial</small></div></div>
      <div className="workspace-switch"><div className="workspace-mark">S</div><div><strong>Scotia Asesores</strong><span>Espacio de trabajo</span></div><ChevronDown size={14} /></div>
      <div className="nav-heading">MENÚ PRINCIPAL</div>
      <nav className="side-nav" aria-label="Navegación principal">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${active === id ? 'active' : ''}`} onClick={() => onNavigate(id)}><Icon size={18} strokeWidth={1.8} /><span>{label}</span>{id === 'review' && <span className="nav-pill">•</span>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="daily-tip"><div className="tip-icon"><Sparkles size={15} /></div><strong>Un día más eficiente</strong><p>Deja que BuyBot se encargue de las tareas repetitivas.</p><button onClick={() => onNavigate('automation')}>Ver automatización <ArrowRight size={13} /></button></div>
        <button className={`nav-link settings-link ${active === 'settings' ? 'active' : ''}`} onClick={() => onNavigate('settings')}><Settings size={18} strokeWidth={1.8} /><span>Configuración</span></button>
        <button className="reset-link" onClick={onReset}><RotateCcw size={16} /><span>Reiniciar demo</span></button>
        <div className="sidebar-version"><span className="online-dot" /> Sistema operativo <span>v1.0</span></div>
      </div>
    </aside>
  )
}

export default App
