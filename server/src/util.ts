import { config } from './config.js'

export function normalizePhone(raw: string): string | null {
  let digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 9 && digits.startsWith('9')) digits = config.countryCode + digits
  // Perú: 51 + 9 dígitos que empiezan con 9.
  if (config.countryCode === '51') return /^519\d{8}$/.test(digits) ? digits : null
  return /^\d{10,15}$/.test(digits) ? digits : null
}

export const isValidDni = (value: string) => /^\d{8}$/.test(value)

export function titleCase(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, sep: string, ch: string) => sep + ch.toUpperCase())
}

export function parseNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const text = String(value).replace(/[^\d.,-]/g, '')
  if (!text) return null
  // "32,500.50" | "32.500,50" | "11,9"
  let normalized = text
  if (text.includes(',') && text.includes('.')) {
    normalized = text.lastIndexOf(',') > text.lastIndexOf('.') ? text.replace(/\./g, '').replace(',', '.') : text.replace(/,/g, '')
  } else if (text.includes(',')) {
    normalized = /,\d{3}$/.test(text) ? text.replace(/,/g, '') : text.replace(',', '.')
  }
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 })

export function requiredVars(template: string): Set<string> {
  const found = new Set<string>()
  for (const match of template.matchAll(/\[(nombre|monto|tasa)\]/gi)) found.add(match[1].toLowerCase())
  return found
}

export interface Renderable { name: string; offer_amount: number | null; rate: number | null }

/** Devuelve las variables que la plantilla necesita y el prospecto no tiene. */
export function missingVars(template: string, p: Renderable): string[] {
  const need = requiredVars(template)
  const missing: string[] = []
  if (need.has('monto') && p.offer_amount === null) missing.push('monto')
  if (need.has('tasa') && p.rate === null) missing.push('tasa')
  return missing
}

export function renderMessage(template: string, p: Renderable): string {
  const spun = template.replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_, group: string) => {
    const options = group.split('|')
    return options[Math.floor(Math.random() * options.length)].trim()
  })
  return spun
    .replace(/\[nombre\]/gi, titleCase(p.name))
    .replace(/\[monto\]/gi, p.offer_amount === null ? '' : money.format(p.offer_amount))
    .replace(/\[tasa\]/gi, p.rate === null ? '' : `${p.rate.toFixed(2)} %`)
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
export const randomBetween = (min: number, max: number) => min + Math.random() * Math.max(0, max - min)

export function startOfLocalDay(date = new Date()): string {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d.toISOString()
}

export function inWindow(start: string, end: string, date = new Date()): boolean {
  const toMin = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + (m || 0) }
  const now = date.getHours() * 60 + date.getMinutes()
  const a = toMin(start), b = toMin(end)
  return a <= b ? now >= a && now < b : now >= a || now < b
}
