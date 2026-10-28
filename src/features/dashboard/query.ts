// Clave y filtros del dashboard compartidos por el hook (cliente) y el prefetch
// de la página RSC. Sin "use client": una función exportada desde un módulo de
// cliente llega al servidor como referencia y no se puede invocar.

import { queryKeys } from "@/lib/query-keys";

/** Filtros del dashboard: mismo shape que la query string (`month` ausente = mes en curso). */
export interface DashboardFilters {
  month?: string;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** `?month=` → filtros válidos (un valor mal formado equivale al mes en curso). */
export function dashboardFilters(month: string | null | undefined): DashboardFilters {
  return month && MONTH_RE.test(month) ? { month } : {};
}

export function dashboardQueryKey(filters: DashboardFilters) {
  return queryKeys.dashboard.summary(filters.month ? { month: filters.month } : {});
}
