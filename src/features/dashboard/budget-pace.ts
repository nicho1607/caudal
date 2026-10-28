// Lógica pura de las barras de presupuesto y del marcador de ritmo (docs §3,
// "Elemento firma"). Sin "use client": se prueba en Vitest.

import type { BudgetStatus, FinancialHealth } from "@/features/dashboard/types";

/**
 * normal: por debajo del ritmo · ahead: por encima del ritmo pero bajo el umbral ·
 * warning: ≥ umbral de alerta · over: ≥ 100 % del límite.
 */
export type BudgetTone = "normal" | "ahead" | "warning" | "over";

/**
 * Posición del marcador de ritmo (0..1): días transcurridos / días del mes.
 * Mes pasado → 1 (daysElapsed = daysInMonth). Mes futuro → null (no se dibuja).
 */
export function expectedPace(health: Pick<FinancialHealth, "daysElapsed" | "daysInMonth">): number | null {
  if (health.daysInMonth <= 0 || health.daysElapsed <= 0) return null;
  return Math.min(1, health.daysElapsed / health.daysInMonth);
}

/** Fracción del límite consumida (puede superar 1). Límite 0 con gasto → 1. */
export function budgetRatio(budget: Pick<BudgetStatus, "spent" | "limit">): number {
  if (budget.limit <= 0) return budget.spent > 0 ? 1 : 0;
  return Math.max(0, budget.spent / budget.limit);
}

export function budgetTone(ratio: number, alertThreshold: number, pace: number | null): BudgetTone {
  if (ratio >= 1) return "over";
  if (ratio >= alertThreshold) return "warning";
  if (pace !== null && ratio > pace) return "ahead";
  return "normal";
}

/** Fracción de los gastos que son fijos (0..1); null si no hay gastos. */
export function fixedShare(fixed: number, variable: number): number | null {
  const total = Math.max(0, fixed) + Math.max(0, variable);
  if (total <= 0) return null;
  return Math.max(0, fixed) / total;
}
