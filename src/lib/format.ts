export const DEFAULT_CURRENCY = "COP";
export const DEFAULT_LOCALE = "es-CO";

/**
 * Monedas sin unidad menor en la práctica: ISO 4217 da 2 decimales al COP,
 * pero nadie escribe centavos de peso. Se formatean siempre sin decimales.
 */
const ZERO_DECIMAL_CURRENCIES = new Set(["COP", "CLP", "JPY", "KRW", "PYG", "VND", "ISK", "UGX", "XAF", "XOF"]);

export function currencyFractionDigits(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 0 : 2;
}

const currencyFormatters = new Map<string, Intl.NumberFormat>();

function getFormatter(currency: string, locale: string, compact: boolean) {
  const key = `${locale}:${currency}:${compact}`;
  let fmt = currencyFormatters.get(key);
  if (!fmt) {
    const digits = currencyFractionDigits(currency);
    fmt = new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: compact ? "compact" : "standard",
      // "always": también separa miles en importes de 4 cifras (es-* no lo hace por defecto).
      useGrouping: "always",
      maximumFractionDigits: compact ? 1 : digits,
      minimumFractionDigits: compact ? 0 : digits,
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
  {
    currency = DEFAULT_CURRENCY,
    locale = DEFAULT_LOCALE,
    compact = false,
    signed = false,
  }: MoneyFormatOptions = {},
) {
  const fmt = getFormatter(currency, locale, compact);
  const formatted = fmt.format(Math.abs(value));
  // Signo menos tipográfico (U+2212); sin signo si el redondeo deja "$ 0".
  if (value < 0 && formatted !== fmt.format(0)) return `−${formatted}`;
  if (signed && value > 0) return `+${formatted}`;
  return formatted;
}

export function formatPercent(value: number, locale = DEFAULT_LOCALE, digits = 1) {
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

const shortDateFormatters = new Map<string, Intl.DateTimeFormat>();

/** "2026-10-27" → "27 oct" (día + mes corto, sin "de" ni punto; fecha civil, sin zona). */
export function formatShortDate(isoDate: string, locale = DEFAULT_LOCALE) {
  let fmt = shortDateFormatters.get(locale);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" });
    shortDateFormatters.set(locale, fmt);
  }
  return fmt
    .formatToParts(new Date(`${isoDate}T00:00:00Z`))
    .filter((p) => p.type === "day" || p.type === "month")
    .map((p) => p.value.replace(/\.$/, ""))
    .join(" ");
}
