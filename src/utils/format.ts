export function formatCurrency(value: number | null): string {
  if (value === null) return '—'
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(value)
}

export function formatDate(value: string | null, options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' }): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', options).format(new Date(value))
}

export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value))
}

export function formatPhone(value: string): string {
  return value.length === 9 ? `${value.slice(0, 3)} ${value.slice(3, 6)} ${value.slice(6)}` : value
}

export function localIsoDate(date = new Date()): string {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return local.toISOString().slice(0, 10)
}

export function addDays(date: Date, days: number): string {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return localIsoDate(next)
}

export const DEFAULT_MESSAGE_TEMPLATE = 'Hola [nombre] 👋\n\nTenemos disponible para ti una opción de compra de deuda por hasta [monto], con una tasa referencial de [tasa].\n\nSi deseas conocer más detalles, puedo ayudarte por este medio.'

export function makeMessage(name: string, amount: number, rate: number, template = DEFAULT_MESSAGE_TEMPLATE): string {
  const safeTemplate = template.trim() ? template : DEFAULT_MESSAGE_TEMPLATE
  const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 }).format(amount)
  return safeTemplate
    .replace(/\[nombre\]/gi, name.trim())
    .replace(/\[monto\]/gi, money)
    .replace(/\[tasa\]/gi, `${rate.toFixed(2)} %`)
}

export function deterministicEligibility(seed: string): boolean {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return hash % 10 < 6
}
