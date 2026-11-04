import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, FileSpreadsheet, MessageCircle, Send, Settings2, ShieldCheck, UserRound } from 'lucide-react'
import type { Page } from '../App'
import { Button, PageHeader } from '../ui'

type Destination = Exclude<Page, 'tutorial'>

const steps: { title: string; summary: string; details: string[]; target?: Destination; action?: string; icon: typeof UserRound }[] = [
  {
    title: 'Crea tu cuenta e inicia sesión',
    summary: 'La primera persona que abre la app crea la cuenta administradora.',
    details: ['Usa un correo al que tengas acceso y una contraseña segura.', 'La cuenta administra la base, la conexión de WhatsApp y la cola de envíos.'],
    icon: UserRound,
  },
  {
    title: 'Vincula los números de WhatsApp',
    summary: 'Puedes conectar varios números, cada uno con su propio QR.',
    details: ['En WhatsApp, selecciona un número o pulsa Agregar WhatsApp y después Conectar WhatsApp.', 'En cada teléfono, entra a Dispositivos vinculados > Vincular dispositivo y escanea su QR.'],
    target: 'whatsapp', action: 'Ir a WhatsApp', icon: MessageCircle,
  },
  {
    title: 'Importa la base de prospectos',
    summary: 'Carga un archivo Excel o CSV con una fila por persona.',
    details: ['Incluye DNI de 8 dígitos, nombre y número de celular. Monto y tasa son opcionales.', 'Puedes registrar la autorización de todos los contactos nuevos del archivo al importar.', 'Para identificar contactos antiguos, vuelve a subir su archivo y selecciona Asociar contactos existentes sin base.'],
    target: 'import', action: 'Ir a Importar', icon: FileSpreadsheet,
  },
  {
    title: 'Revisa y completa los registros',
    summary: 'Antes de enviar, confirma que la información y el permiso estén correctos.',
    details: ['En Prospectos puedes buscar, editar y revisar el estado de cada contacto.', 'Corrige filas inválidas o duplicadas y confirma la autorización registrada.'],
    target: 'prospects', action: 'Ver Prospectos', icon: ShieldCheck,
  },
  {
    title: 'Configura el mensaje y el ritmo',
    summary: 'Una plantilla común conserva la misma estructura para todos los clientes.',
    details: ['Personaliza el texto con [nombre], [monto] y [tasa]; [nombre] usa un nombre y un apellido.', 'La pausa predeterminada es 30 segundos. Puedes definir horario y límite diario por teléfono.', 'Una respuesta “BAJA” detiene futuros envíos a ese contacto.'],
    target: 'settings', action: 'Abrir Configuración', icon: Settings2,
  },
  {
    title: 'Inicia y supervisa los envíos',
    summary: 'La cola procesa prospectos autorizados uno por uno.',
    details: ['En Envíos puedes iniciar ahora o programar una fecha y hora.', 'Activa Mezclar bases para alternar entre archivos; BuyBot también alterna los números conectados.', 'Consulta en Inicio el número de contactados por base y revisa los envíos con error.'],
    target: 'send', action: 'Ir a Envíos', icon: Send,
  },
  {
    title: 'Consulta el resultado',
    summary: 'El historial permite seguir lo que ocurrió con cada campaña.',
    details: ['En Historial revisa los cambios y los mensajes registrados.', 'En Por revisar encontrarás envíos fallidos o números que no tienen WhatsApp.'],
    target: 'history', action: 'Abrir Historial', icon: CheckCircle2,
  },
]

export function TutorialSteps({ compact = false, goto }: { compact?: boolean; goto?: (page: Destination) => void }) {
  return <div className={compact ? 'tutorial-steps tutorial-steps-compact' : 'tutorial-steps'}>
    {steps.map(({ title, summary, details, target, action, icon: Icon }, index) => <section className="card tutorial-step" key={title}>
      <div className="tutorial-step-top"><span className="tutorial-number">{index + 1}</span><span className="tutorial-step-icon"><Icon size={19} /></span></div>
      <h3>{title}</h3>
      <p>{summary}</p>
      <ul>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
      {target && action && goto && <Button variant="ghost" onClick={() => goto(target)}>{action}<ArrowRight size={15} /></Button>}
    </section>)}
  </div>
}

export function TutorialPage({ goto }: { goto: (page: Page) => void }) {
  return <>
    <PageHeader eyebrow="GUÍA RÁPIDA" title="Tu primer recorrido por BuyBot" subtitle="Sigue estos pasos para preparar la base, revisar el mensaje y supervisar los envíos de Cristina." />
    <div className="tutorial-intro card"><span className="tutorial-step-icon"><BookOpen size={20} /></span><p>Reserva unos minutos para revisar la lista antes de iniciar una campaña. BuyBot solo pone en cola a los prospectos con autorización explícita para recibir mensajes por WhatsApp.</p></div>
    <TutorialSteps goto={goto} />
    <div className="alert alert-warn tutorial-note"><CircleHelp size={18} /><span>BuyBot necesita que su servidor esté encendido para usar el login, la base de datos y WhatsApp. La guía pública de GitHub Pages explica el recorrido, pero no envía mensajes.</span></div>
  </>
}
