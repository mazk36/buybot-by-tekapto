/** Interpretación del monograma compacto del tablero de identidad Tekapto. */
export function TekaptoSignature() {
  return <span className="tekapto-signature" aria-label="Tekapto">
    <svg viewBox="0 0 36 38" fill="none" aria-hidden="true">
      <path d="M1 2h28l-6 6h-8v24L9 37V8H1V2Z" fill="currentColor" />
      <path d="M26 10h9L23 22h-9l12-12Z" fill="#FF3B18" />
      <path d="m22 22 13 14H24L14 25v-3h8Z" fill="currentColor" />
    </svg>
    <span>TEKAPTO</span>
  </span>
}
