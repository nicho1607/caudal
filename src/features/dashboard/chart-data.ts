// Transformaciones puras de los datos del dashboard para los gráficos
// (CashflowChart, CategoryDonut). Sin "use client": se prueban en Vitest.

import type { CashflowBucket, CashflowRange, CategorySlice, FinancialHealth } from "@/features/dashboard/types";

export interface CashflowRow {
  label: string;
  income: number;
  expense: number;
  /** Neto real; null en el bucket proyectado (ahí se dibuja la línea punteada). */
  net: number | null;
  /** Ingreso/gasto que falta hasta fin de mes (segmento rayado sobre la barra real). */
  incomeRemaining: number | null;
  expenseRemaining: number | null;
  /** Serie punteada: neto del último bucket real → neto proyectado a fin de mes. */
  netProjected: number | null;
  /** Neto real a la fecha del bucket (también en el proyectado, para el tooltip). */
  netToDate: number;
  projected: boolean;
  projection: { income: number; expense: number; net: number } | null;
}

/** Hay proyección sólo para el mes en curso: ya empezó y aún quedan días. */
export function isProjectingMonth(health: Pick<FinancialHealth, "daysElapsed" | "daysInMonth">): boolean {
  return health.daysElapsed > 0 && health.daysElapsed < health.daysInMonth;
}

/**
 * Filas del ComposedChart. En el rango mensual y con el mes en curso, el último
 * bucket lleva lo que falta hasta la proyección de fin de mes (nunca negativo) y
 * la línea neta pasa a una serie punteada desde el mes anterior.
 */
export function buildCashflowRows(
  buckets: CashflowBucket[],
  range: CashflowRange,
  health: Pick<FinancialHealth, "daysElapsed" | "daysInMonth" | "projectedMonthEnd">,
): CashflowRow[] {
  const project = range === "monthly" && buckets.length > 0 && isProjectingMonth(health);
  const last = buckets.length - 1;

  return buckets.map((b, i) => {
    const base: CashflowRow = {
      label: b.label,
      income: b.income,
      expense: b.expense,
      net: b.net,
      incomeRemaining: null,
      expenseRemaining: null,
      netProjected: null,
      netToDate: b.net,
      projected: false,
      projection: null,
    };
    if (!project) return base;
    if (i === last - 1) return { ...base, netProjected: b.net };
    if (i !== last) return base;

    const { income, expense, net } = health.projectedMonthEnd;
    return {
      ...base,
      net: null,
      incomeRemaining: Math.max(0, income - b.income),
      expenseRemaining: Math.max(0, expense - b.expense),
      netProjected: net,
      projected: true,
      projection: { income: Math.max(income, b.income), expense: Math.max(expense, b.expense), net },
    };
  });
}

/** true si ningún bucket tiene movimientos. */
export function isCashflowEmpty(buckets: CashflowBucket[]): boolean {
  return buckets.every((b) => b.income === 0 && b.expense === 0);
}

export interface DonutSlice {
  id: string;
  name: string;
  color: string;
  amount: number;
  share: number; // 0..1 del total
}

export const OTHER_SLICE_ID = "other";
/** Gris neutro, distinto de "Sin categoría" (muted-foreground) y de las categorías. */
export const OTHER_SLICE_COLOR = "color-mix(in oklch, var(--muted-foreground) 45%, var(--card))";

/**
 * Top `limit` categorías por importe + "Otras" con el resto. Si el resto es una
 * sola categoría se muestra con su nombre (agruparla no ahorra nada).
 */
export function groupCategorySlices(slices: CategorySlice[], limit = 5): { slices: DonutSlice[]; total: number } {
  const sorted = slices.filter((s) => s.amount > 0).sort((a, b) => b.amount - a.amount);
  const total = sorted.reduce((sum, s) => sum + s.amount, 0);
  const share = (amount: number) => (total > 0 ? amount / total : 0);
  const toSlice = (s: CategorySlice): DonutSlice => ({
    id: s.categoryId,
    name: s.name,
    color: s.color,
    amount: s.amount,
    share: share(s.amount),
  });

  if (sorted.length <= limit + 1) return { slices: sorted.map(toSlice), total };

  const rest = sorted.slice(limit).reduce((sum, s) => sum + s.amount, 0);
  return {
    slices: [
      ...sorted.slice(0, limit).map(toSlice),
      { id: OTHER_SLICE_ID, name: "Otras", color: OTHER_SLICE_COLOR, amount: rest, share: share(rest) },
    ],
    total,
  };
}
