// Los colores de categorías, cuentas y etiquetas se guardan como token del tema
// (`chart-3`) o como color CSS literal. Esto devuelve un valor usable en `style`.

export function cssColor(color: string | null | undefined): string | null {
  if (!color) return null;
  return /^chart-\d+$/.test(color) ? `var(--${color})` : color;
}
