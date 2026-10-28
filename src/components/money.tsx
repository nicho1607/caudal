import { cn } from "@/lib/utils";

import { formatMoney, type MoneyFormatOptions } from "@/lib/format";

interface MoneyProps extends MoneyFormatOptions {
  value: number;
  className?: string;
}

/**
 * Importe formateado (moneda y locale del usuario) con cifras tabulares.
 * Todo importe de la UI pasa por aquí o por `formatMoney`: nunca el número crudo
 * (la API puede devolver decimales, p. ej. proyecciones).
 */
export function Money({ value, className, ...options }: MoneyProps) {
  return <span className={cn("num whitespace-nowrap", className)}>{formatMoney(value, options)}</span>;
}
