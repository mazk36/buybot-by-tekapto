const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN', maximumFractionDigits: 0 })
export const formatMoney = (v: number | null) => (v === null ? '—' : money.format(v))
export const formatRate = (v: number | null) => (v === null ? '—' : `${v.toFixed(2)} %`)

export function formatPhone(phone: string): string {
  const local = phone.startsWith('51') && phone.length === 11 ? phone.slice(2) : phone
  return local.length === 9 ? `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}` : phone
}
export function formatDateTime(value: string | null): string {
  if (!value) return '—'
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value))
}
export function formatTime(value: string): string {
  return new Intl.DateTimeFormat('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(new Date(value))
}
export function initials(name: string): string {
  return name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}
export function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches'
}
export function downloadUrl(url: string) {
  const a = document.createElement('a')
  a.href = url
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
}
export function renderPreview(template: string, name = 'Carlos Mendoza', amount = 32500, rate = 11.9): string {
  const spun = template.replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_, g: string) => g.split('|')[0].trim())
  return spun.replace(/\[nombre\]/gi, name).replace(/\[monto\]/gi, money.format(amount)).replace(/\[tasa\]/gi, `${rate.toFixed(2)} %`)
}
