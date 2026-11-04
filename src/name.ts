/** Construye un nombre y un apellido cuando el archivo los trae separados. */
export function importedMessageName(givenName: string, surnames: string): string {
  const first = givenName.trim().split(/\s+/).filter(Boolean)[0]
  const words = surnames.trim().split(/\s+/).filter(Boolean)
  if (!first || !words.length) return ''
  const particles = new Set(['de', 'del', 'la', 'las', 'los', 'da', 'do', 'dos', 'van', 'von', 'der'])
  let end = 0
  while (end < words.length - 1 && particles.has(words[end].toLowerCase())) end++
  return `${first} ${words.slice(0, end + 1).join(' ')}`
}
