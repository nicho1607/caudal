const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, locale: string, compact: boolean) {
  const key = `${locale}:${currency}:${compact}`;
  let fmt = currencyFormatters.get(key);
  if (!fmt) {
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      maximumFractionDigits: compact ? 1 : 2,
      minimumFractionDigits: compact ? 0 : 2,
    });
    currencyFormatters.set(key, fmt);
  }
  return fmt;
}

export interface MoneyFormatOptions {
  currency?: string;
  locale?: string;
  compact?: boolean;
  /** Muestra "+" en positivos (útil en listas de transacciones). */
  signed?: boolean;
}

export function formatMoney(
  value: number,
  { currency = "USD", locale = "es-ES", compact = false, signed = false }: MoneyFormatOptions = {},
) {
  const formatted = getFormatter(currency, locale, compact).format(Math.abs(value));
  if (value < 0) return `−${formatted}`; // signo menos tipográfico (U+2212)
  if (signed && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatPercent(value: number, locale = "es-ES", digits = 1) {
  return new Intl.NumberFormat(locale, {
    style: "percent",
    maximumFractionDigits: digits,
  }).format(value);
}

/** Variación relativa entre dos periodos; null si no hay base comparable. */
export function relativeChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return (current - previous) / Math.abs(previous);
}
