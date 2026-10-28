// Cálculos puros del dashboard (sin Prisma): fechas ISO, tasa de ahorro,
// proyección de fin de mes, ritmo de presupuesto, buckets de cash flow y
// sparklines. Todo opera sobre fechas `yyyy-mm-dd` en UTC para no depender de
// la zona horaria del servidor; "hoy" se resuelve con la zona del usuario.

import type { CashflowBucket, CashflowRange, SparkPoint } from "@/features/dashboard/types";

// ─── Fechas ISO (yyyy-mm-dd) ─────────────────────────────────────────────────

const DAY_MS = 86_400_000;

export function isoToUtc(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

export function utcToIso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return utcToIso(new Date(isoToUtc(iso).getTime() + days * DAY_MS));
}

/** Días entre dos fechas ISO (b − a). */
export function diffDays(a: string, b: string): number {
  return Math.round((isoToUtc(b).getTime() - isoToUtc(a).getTime()) / DAY_MS);
}

/** "2026-10" + n meses → "2026-11". */
export function addMonths(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const total = y * 12 + (m - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

export function daysInMonth(month: string): number {
  const [y, m] = month.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthStart(month: string): string {
  return `${month}-01`;
}

export function monthEnd(month: string): string {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}`;
}

/** Fecha de hoy (yyyy-mm-dd) en la zona horaria IANA del usuario. */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  // en-CA formatea como yyyy-mm-dd.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export interface MonthContext {
  month: string; // yyyy-mm
  start: string;
  end: string;
  /** Último día con datos "reales": hoy si es el mes en curso, fin de mes si es pasado, víspera del mes si es futuro. */
  refDate: string;
  daysInMonth: number;
  daysElapsed: number;
  daysRemaining: number;
  isCurrent: boolean;
  isPast: boolean;
}

export function monthContext(month: string, today: string): MonthContext {
  const start = monthStart(month);
  const end = monthEnd(month);
  const total = daysInMonth(month);
  const elapsed = Math.min(total, Math.max(0, diffDays(start, today) + 1));
  const refDate = today < start ? addDays(start, -1) : today > end ? end : today;
  return {
    month,
    start,
    end,
    refDate,
    daysInMonth: total,
    daysElapsed: elapsed,
    daysRemaining: total - elapsed,
    isCurrent: today >= start && today <= end,
    isPast: today > end,
  };
}

// ─── Indicadores ─────────────────────────────────────────────────────────────

/** (ingresos − gastos) / ingresos. 0 si no hay ingresos. Puede ser negativa. */
export function savingsRate(income: number, expense: number): number {
  if (income <= 0) return 0;
  return (income - expense) / income;
}

/** Fracción del periodo transcurrida (0..1): posición del marcador de ritmo. */
export function budgetPace(daysElapsed: number, daysInPeriod: number): number {
  if (daysInPeriod <= 0) return 0;
  return Math.min(1, Math.max(0, daysElapsed / daysInPeriod));
}

export interface ProjectionInput {
  actualIncome: number;
  actualExpense: number; // positivo
  /** Gastos recurrentes pendientes hasta fin de mes (positivo). */
  pendingRecurringExpense: number;
  /** Ingresos recurrentes pendientes hasta fin de mes. */
  pendingRecurringIncome: number;
  /** Media diaria del gasto variable de los últimos 90 días (positivo). */
  variableDailyAverage: number;
  daysRemaining: number;
}

/**
 * Proyección de fin de mes (docs §1):
 *   gasto   = real + recurrentes fijos pendientes + mediaDiariaVariable(90 d) × díasRestantes
 *   ingreso = real + recurrentes de ingreso pendientes
 */
export function projectMonthEnd(input: ProjectionInput) {
  const days = Math.max(0, input.daysRemaining);
  const income = input.actualIncome + input.pendingRecurringIncome;
  const expense =
    input.actualExpense + input.pendingRecurringExpense + input.variableDailyAverage * days;
  return { income, expense, net: income - expense };
}

// ─── Recurrentes ─────────────────────────────────────────────────────────────

export interface RecurringSchedule {
  frequency: "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
  interval: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  /** Próxima ocurrencia aún no materializada. */
  nextRunAt: string;
}

function clampDay(year: number, monthIndex: number, day: number) {
  const last = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return utcToIso(new Date(Date.UTC(year, monthIndex, Math.min(day, last))));
}

function nextOccurrence(rule: RecurringSchedule, iso: string): string {
  const step = Math.max(1, rule.interval);
  const d = isoToUtc(iso);
  switch (rule.frequency) {
    case "DAILY":
      return addDays(iso, step);
    case "WEEKLY":
      return addDays(iso, 7 * step);
    case "MONTHLY":
      return clampDay(
        d.getUTCFullYear(),
        d.getUTCMonth() + step,
        rule.dayOfMonth ?? isoToUtc(rule.startDate).getUTCDate(),
      );
    case "YEARLY":
      return clampDay(
        d.getUTCFullYear() + step,
        d.getUTCMonth(),
        rule.dayOfMonth ?? isoToUtc(rule.startDate).getUTCDate(),
      );
  }
}

/** Ocurrencias pendientes (desde `nextRunAt`) dentro de [from, to], ambas inclusive. */
export function pendingOccurrences(rule: RecurringSchedule, from: string, to: string): string[] {
  const out: string[] = [];
  let date = rule.nextRunAt;
  for (let i = 0; i < 400 && date <= to; i++) {
    if (rule.endDate && date > rule.endDate) break;
    if (date >= from) out.push(date);
    date = nextOccurrence(rule, date);
  }
  return out;
}

// ─── Cash flow ───────────────────────────────────────────────────────────────

export interface MonthlyTotals {
  month: string; // yyyy-mm
  income: number;
  expense: number; // positivo
}

const MONTH_LABELS = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Número de buckets por rango (el último es el que contiene `endMonth`). */
export const CASHFLOW_BUCKETS: Record<CashflowRange, number> = {
  monthly: 6,
  quarterly: 4,
  yearly: 3,
};

/** Primer mes (yyyy-mm) que necesitan los buckets de todos los rangos: enero del primer año del rango anual. */
export function cashflowStartMonth(endMonth: string): string {
  return `${Number(endMonth.slice(0, 4)) - (CASHFLOW_BUCKETS.yearly - 1)}-01`;
}

function bucketKey(month: string, range: CashflowRange): { key: string; label: string } {
  const [y, m] = month.split("-").map(Number);
  if (range === "monthly") return { key: month, label: MONTH_LABELS[m - 1] };
  if (range === "quarterly") {
    const q = Math.floor((m - 1) / 3) + 1;
    return { key: `${y}-Q${q}`, label: `T${q} ${y}` };
  }
  return { key: String(y), label: String(y) };
}

/**
 * Agrupa totales mensuales en buckets (meses, trimestres o años naturales)
 * terminando en el bucket que contiene `endMonth`. Los buckets sin datos salen
 * a 0; los meses posteriores a `endMonth` se ignoran.
 */
export function bucketCashflow(
  months: MonthlyTotals[],
  range: CashflowRange,
  endMonth: string,
): CashflowBucket[] {
  const step = range === "monthly" ? 1 : range === "quarterly" ? 3 : 12;
  const buckets = new Map<string, CashflowBucket>();
  for (let i = CASHFLOW_BUCKETS[range] - 1; i >= 0; i--) {
    const { key, label } = bucketKey(addMonths(endMonth, -i * step), range);
    buckets.set(key, { label, income: 0, expense: 0, net: 0 });
  }
  for (const row of months) {
    if (row.month > endMonth) continue;
    const bucket = buckets.get(bucketKey(row.month, range).key);
    if (!bucket) continue;
    bucket.income += row.income;
    bucket.expense += row.expense;
    bucket.net = bucket.income - bucket.expense;
  }
  return [...buckets.values()].map((b) => ({
    label: b.label,
    income: round2(b.income),
    expense: round2(b.expense),
    net: round2(b.income - b.expense),
  }));
}

// ─── Sparklines ──────────────────────────────────────────────────────────────

/** Fechas ISO de los `days` días que terminan en `end` (inclusive), en orden. */
export function dayRange(end: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => addDays(end, i - (days - 1)));
}

/**
 * Para cada uno de los `points` días que terminan en `end`, suma de los
 * valores diarios de la ventana móvil de `window` días que termina ese día.
 */
export function rollingSumSeries(
  daily: Map<string, number>,
  end: string,
  points = 30,
  window = 30,
): SparkPoint[] {
  return dayRange(end, points).map((date) => {
    let value = 0;
    for (const d of dayRange(date, window)) value += daily.get(d) ?? 0;
    return { date, value: round2(value) };
  });
}

/** Saldo al cierre de cada día: `opening` (saldo antes del primer día) + acumulado diario. */
export function balanceSeries(
  opening: number,
  daily: Map<string, number>,
  end: string,
  points = 30,
): SparkPoint[] {
  let running = opening;
  return dayRange(end, points).map((date) => {
    running += daily.get(date) ?? 0;
    return { date, value: round2(running) };
  });
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
