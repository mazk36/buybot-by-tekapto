import { useState } from 'react'
import { Bell, CheckCircle2, LayoutDashboard, LockKeyhole, Moon, RotateCcw, ShieldCheck } from 'lucide-react'
import { PageTitle, type IconType } from '../components/shared'
import { DEFAULT_MESSAGE_TEMPLATE, makeMessage } from '../utils/format'

interface SettingsPageProps {
  onReset: () => void
  onProfile: () => void
  darkMode: boolean
  onToggleTheme: () => void
  messageTemplate: string
  onMessageTemplateChange: (template: string) => void
}

export function SettingsPage({ onReset, onProfile, darkMode, onToggleTheme, messageTemplate, onMessageTemplateChange }: SettingsPageProps) {
  const [notifications, setNotifications] = useState(true)
  const [compact, setCompact] = useState(false)
  const previewMessage = makeMessage('Carlos Mendoza', 32500, 11.9, messageTemplate)

  return <>
    <PageTitle eyebrow="PREFERENCIAS" title="Configuración" subtitle="Administra las preferencias de tu espacio de trabajo." />
    <div className="settings-layout">
      <div className="settings-main">
        <section className="panel settings-panel">
          <div className="panel-heading"><div><div className="eyebrow">ESPACIO DE TRABAJO</div><h2>Preferencias generales</h2></div></div>
          <SettingRow icon={Moon} title="Modo oscuro" text="Cambia la apariencia de toda la aplicación." checked={darkMode} onChange={onToggleTheme} />
          <SettingRow icon={Bell} title="Notificaciones de actividad" text="Recibe avisos dentro de la aplicación sobre el flujo de trabajo." checked={notifications} onChange={() => setNotifications(!notifications)} />
          <SettingRow icon={LayoutDashboard} title="Vista compacta de tablas" text="Reduce el espacio entre filas para mostrar más registros." checked={compact} onChange={() => setCompact(!compact)} />
          <div className="setting-row"><span className="setting-icon"><LockKeyhole size={17} /></span><div className="setting-copy"><strong>Almacenamiento</strong><span>Los datos se guardan localmente en este navegador.</span></div><span className="local-storage-tag"><span className="online-dot" /> Activo</span></div>
        </section>

        <section className="panel settings-panel message-template-panel">
          <div className="panel-heading template-heading">
            <div><div className="eyebrow">MENSAJES</div><h2>Plantilla de contacto</h2><p>Una misma estructura para todos los prospectos. Las variables se completan con sus datos.</p></div>
            <button className="outline-button mini-button" onClick={() => onMessageTemplateChange(DEFAULT_MESSAGE_TEMPLATE)}>Restaurar predeterminada</button>
          </div>
          <label className="template-label" htmlFor="message-template">Mensaje personalizado</label>
          <textarea id="message-template" className="message-template-input" value={messageTemplate} onChange={(event) => onMessageTemplateChange(event.target.value)} spellCheck />
          <div className="template-variables"><span>Variables disponibles</span><code>[nombre]</code><code>[tasa]</code><code>[monto]</code></div>
          <p className="template-help">Escribe las variables entre corchetes donde quieras insertar el dato. Se guardará automáticamente en este navegador.</p>
          <div className="template-preview"><div className="template-preview-heading"><span>VISTA PREVIA</span><small>Ejemplo con Carlos Mendoza</small></div><p>{previewMessage}</p></div>
        </section>

        <section className="panel settings-panel account-panel">
          <div className="panel-heading"><div><div className="eyebrow">CUENTA</div><h2>Perfil de usuario</h2></div></div>
          <div className="profile-row"><div className="avatar avatar-red">C</div><div><strong>Cristina</strong><span>Asesora comercial · Scotia Asesores</span></div><button className="outline-button mini-button" onClick={onProfile}>Editar perfil</button></div>
        </section>
      </div>
      <aside className="settings-aside">
        <section className="settings-info-card"><div className="settings-info-icon"><ShieldCheck size={19} /></div><h3>Tu información está protegida</h3><p>Esta aplicación es un prototipo de demostración. Toda la información se conserva únicamente en este navegador.</p><div><CheckCircle2 size={14} /> Sin conexiones externas</div><div><CheckCircle2 size={14} /> Sin datos bancarios reales</div></section>
        <section className="panel reset-settings"><h3>Restaurar demostración</h3><p>Vuelve a cargar la base inicial y limpia todo el progreso actual.</p><button className="outline-button" onClick={onReset}><RotateCcw size={14} /> Reiniciar demo</button></section>
      </aside>
    </div>
  </>
}

function SettingRow({ icon: Icon, title, text, checked, onChange }: { icon: IconType; title: string; text: string; checked: boolean; onChange: () => void }) {
  return <div className="setting-row"><span className="setting-icon"><Icon size={17} /></span><div className="setting-copy"><strong>{title}</strong><span>{text}</span></div><button className={`switch ${checked ? 'checked' : ''}`} aria-label={`${checked ? 'Desactivar' : 'Activar'} ${title}`} aria-pressed={checked} onClick={onChange}><span /></button></div>
}
