export type ProspectStatus =
  | 'pending'
  | 'reviewing'
  | 'eligible'
  | 'not_eligible'
  | 'preparing_message'
  | 'contacting'
  | 'contacted'
  | 'second_review'
  | 'error'

export type AutomationStatus = 'stopped' | 'running' | 'paused' | 'completed'

export interface Prospect {
  id: string
  dni: string
  name: string
  phone: string
  status: ProspectStatus
  offerAmount: number | null
  rate: number | null
  lastReview: string | null
  nextReview: string | null
  contactDate: string | null
  message: string | null
  /** Deterministic result used by the local demonstration flow. */
  mockEligibility: boolean
  eligibility: boolean | null
}

export interface HistoryEvent {
  id: string
  timestamp: string
  prospectId: string | null
  name: string
  action: string
  result: string
}

export interface DemoState {
  prospects: Prospect[]
  events: HistoryEvent[]
  automationStatus: AutomationStatus
  currentProspectId: string | null
  stageIndex: number
}
