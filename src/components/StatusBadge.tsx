import type { ProspectStatus } from '../types'

const labels: Record<ProspectStatus, string> = {
  pending: 'Pendiente', reviewing: 'Revisando', eligible: 'Apto', not_eligible: 'No apto',
  preparing_message: 'Preparando mensaje', contacting: 'Contactando', contacted: 'Contactado',
  second_review: 'Segunda revisión', error: 'Error',
}

export function StatusBadge({ status }: { status: ProspectStatus }) {
  return <span className={`badge badge-${status}`}><span className="badge-dot" />{labels[status]}</span>
}
