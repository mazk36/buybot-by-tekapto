import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import type { HistoryEvent, Prospect } from '../types'
import { automationStages } from '../services/simulationEngine'
import { formatTime } from '../utils/format'

export type AppPage = 'dashboard' | 'prospects' | 'automation' | 'import' | 'review' | 'history' | 'settings'
export type IconType = LucideIcon

export function getGreeting(): string {
  const hour = new Date().getHours()
  return hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches'
}

export function getInitials(name: string): string {
  return name.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase()
}

export function currentStageLabel(prospect: Prospect, stageIndex: number): string {
  if (stageIndex === 2 && prospect.eligibility === false) return 'Programando segunda revisión'
  return automationStages[stageIndex] ?? 'Procesando cliente'
}


export function PageTitle({ eyebrow, title, subtitle, action }: { eyebrow: string; title: string; subtitle?: string; action?: ReactNode }) {
  return <div className="page-title-row"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>{action && <div className="page-title-action">{action}</div>}</div>
}


export function ActivityRow({ event }: { event: HistoryEvent }) {
  const kind = event.action.includes('enviado') || event.action.includes('Enviado') ? 'activity-red' : event.action.includes('apto') ? 'activity-green' : event.action.includes('importada') ? 'activity-blue' : 'activity-neutral'
  return <div className="activity-row"><span className={`activity-marker ${kind}`}><span /></span><div className="activity-copy"><strong>{event.action}</strong><span>{event.name}{event.result ? ` · ${event.result}` : ''}</span></div><time>{formatTime(event.timestamp)}</time></div>
}


export function EmptyInline({ icon: Icon, title, text }: { icon: IconType; title: string; text: string }) {
  return <div className="empty-inline"><span><Icon size={18} /></span><strong>{title}</strong><p>{text}</p></div>
}


export function getStats(prospects: Prospect[]) {
  return {
    reviewed: prospects.filter((item) => item.status !== 'pending' && item.status !== 'error').length,
    pending: prospects.filter((item) => item.status === 'pending').length,
    eligible: prospects.filter((item) => item.eligibility === true).length,
    contacted: prospects.filter((item) => item.status === 'contacted').length,
    secondReview: prospects.filter((item) => item.status === 'second_review').length,
  }
}
