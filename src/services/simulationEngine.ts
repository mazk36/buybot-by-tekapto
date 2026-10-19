import type { DemoState, HistoryEvent, Prospect } from '../types'
import { addDays, DEFAULT_MESSAGE_TEMPLATE, deterministicEligibility, localIsoDate, makeMessage } from '../utils/format'

export const DAILY_GOAL = 100

const amounts = [18500, 25000, 32500, 41000, 28500, 22000, 36500, 30000]
const rates = [10.9, 11.5, 11.9, 12.2, 12.9]

export const automationStages = [
  'Consultando DNI',
  'Verificando elegibilidad',
  'Generando oferta',
  'Preparando mensaje',
  'Enviando mensaje',
  'Confirmando envío',
]

export function stageDelay(stageIndex: number): number {
  // A full eligible prospect path takes about 30 seconds across its six stages.
  return [4500, 5000, 5000, 5000, 6000, 4500][stageIndex] ?? 4500
}

function eventFor(prospect: Prospect | null, action: string, result: string): HistoryEvent {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    prospectId: prospect?.id ?? null,
    name: prospect?.name ?? 'Automatización',
    action,
    result,
  }
}

function pushEvent(state: DemoState, prospect: Prospect | null, action: string, result: string): HistoryEvent[] {
  return [eventFor(prospect, action, result), ...state.events].slice(0, 500)
}

function offerFor(prospect: Prospect): { amount: number; rate: number } {
  const digits = Number(prospect.dni.slice(-2)) || 0
  return { amount: amounts[digits % amounts.length], rate: rates[digits % rates.length] }
}

export function advanceSimulation(state: DemoState, messageTemplate = DEFAULT_MESSAGE_TEMPLATE): DemoState {
  if (state.automationStatus !== 'running') return state

  if (!state.currentProspectId) {
    const next = state.prospects.find((item) => item.status === 'pending')
    if (!next) {
      return {
        ...state,
        automationStatus: 'completed',
        currentProspectId: null,
        stageIndex: 0,
        events: pushEvent(state, null, 'Automatización finalizada', 'Base procesada'),
      }
    }
    return {
      ...state,
      currentProspectId: next.id,
      stageIndex: 0,
      prospects: state.prospects.map((item) => item.id === next.id ? { ...item, status: 'reviewing' } : item),
      events: pushEvent(state, next, 'Cliente cargado', 'Proceso iniciado'),
    }
  }

  const prospect = state.prospects.find((item) => item.id === state.currentProspectId)
  if (!prospect) return { ...state, currentProspectId: null, stageIndex: 0 }

  if (state.stageIndex === 0) {
    return { ...state, stageIndex: 1, events: pushEvent(state, prospect, 'DNI consultado', `DNI ${prospect.dni}`) }
  }

  if (state.stageIndex === 1) {
    const eligible = prospect.mockEligibility ?? deterministicEligibility(prospect.dni)
    const offer = eligible ? offerFor(prospect) : null
    return {
      ...state,
      stageIndex: 2,
      prospects: state.prospects.map((item) => item.id === prospect.id ? {
        ...item,
        status: eligible ? 'eligible' : 'not_eligible',
        eligibility: eligible,
        offerAmount: offer?.amount ?? null,
        rate: offer?.rate ?? null,
        lastReview: localIsoDate(),
      } : item),
      events: pushEvent(state, prospect, eligible ? 'Cliente apto' : 'Cliente no apto', eligible ? 'Elegibilidad confirmada' : 'Programando segunda revisión'),
    }
  }

  if (state.stageIndex === 2) {
    if (prospect.eligibility === false) {
      const nextReview = addDays(new Date(), 30)
      return {
        ...state,
        currentProspectId: null,
        stageIndex: 0,
        prospects: state.prospects.map((item) => item.id === prospect.id ? { ...item, status: 'second_review', nextReview } : item),
        events: pushEvent(state, prospect, 'Enviado a segunda revisión', `Nueva evaluación: ${nextReview}`),
      }
    }
    return { ...state, stageIndex: 3, events: pushEvent(state, prospect, 'Oferta generada', 'Propuesta disponible') }
  }

  if (state.stageIndex === 3) {
    if (prospect.offerAmount === null || prospect.rate === null) return { ...state, stageIndex: 4 }
    const message = makeMessage(prospect.name, prospect.offerAmount, prospect.rate, messageTemplate)
    return {
      ...state,
      stageIndex: 4,
      prospects: state.prospects.map((item) => item.id === prospect.id ? { ...item, status: 'preparing_message', message } : item),
      events: pushEvent(state, prospect, 'Mensaje preparado', 'Personalizado para el cliente'),
    }
  }

  if (state.stageIndex === 4) {
    return {
      ...state,
      stageIndex: 5,
      prospects: state.prospects.map((item) => item.id === prospect.id ? { ...item, status: 'contacting' } : item),
      events: pushEvent(state, prospect, 'Enviando mensaje', 'Canal de contacto habilitado'),
    }
  }

  return {
    ...state,
    currentProspectId: null,
    stageIndex: 0,
    prospects: state.prospects.map((item) => item.id === prospect.id ? { ...item, status: 'contacted', contactDate: new Date().toISOString() } : item),
    events: pushEvent(state, prospect, 'Mensaje enviado', 'Contacto completado'),
  }
}

export function addAutomationEvent(state: DemoState, action: string, result: string): DemoState {
  return { ...state, events: pushEvent(state, null, action, result) }
}

export function stopSimulation(state: DemoState): DemoState {
  if (!state.currentProspectId) return { ...state, automationStatus: 'stopped', stageIndex: 0 }
  const current = state.prospects.find((item) => item.id === state.currentProspectId) ?? null
  return {
    ...state,
    automationStatus: 'stopped',
    currentProspectId: null,
    stageIndex: 0,
    prospects: state.prospects.map((item) => item.id === state.currentProspectId ? {
      ...item, status: 'pending', eligibility: null, offerAmount: null, rate: null, lastReview: null, nextReview: null, message: null,
    } : item),
    events: pushEvent(state, current, 'Automatización detenida', 'El cliente actual quedó pendiente'),
  }
}
