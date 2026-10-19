import { createDemoProspects } from '../data/prospects'
import type { DemoState } from '../types'

const STORAGE_KEY = 'buybot-demo-v1'

export function initialDemoState(): DemoState {
  return {
    prospects: createDemoProspects(),
    events: [],
    automationStatus: 'stopped',
    currentProspectId: null,
    stageIndex: 0,
  }
}

export function loadDemoState(): DemoState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (!saved) return initialDemoState()
    const parsed = JSON.parse(saved) as Partial<DemoState>
    if (!Array.isArray(parsed.prospects) || !Array.isArray(parsed.events)) return initialDemoState()
    return {
      ...initialDemoState(),
      ...parsed,
      automationStatus: parsed.automationStatus === 'running' ? 'paused' : parsed.automationStatus ?? 'stopped',
      currentProspectId: parsed.currentProspectId ?? null,
      stageIndex: parsed.stageIndex ?? 0,
    }
  } catch {
    return initialDemoState()
  }
}

export function saveDemoState(state: DemoState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // The app remains usable if browser storage is disabled or full.
  }
}
