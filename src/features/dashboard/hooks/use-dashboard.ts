"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";

import type { DashboardData } from "@/features/dashboard/types";
import { queryKeys } from "@/lib/query-keys";

/** Filtros del dashboard: mismo shape que la query string (`month` ausente = mes en curso). */
export interface DashboardFilters {
  month?: string;
}

export function dashboardQueryKey(filters: DashboardFilters) {
  return queryKeys.dashboard.summary(filters.month ? { month: filters.month } : {});
}

export async function fetchDashboard(filters: DashboardFilters = {}): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (filters.month) params.set("month", filters.month);
  const qs = params.toString();
  const res = await fetch(`/api/v1/dashboard${qs ? `?${qs}` : ""}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `Error ${res.status} al cargar el dashboard`);
  }
  return res.json() as Promise<DashboardData>;
}

/** Datos del dashboard para el mes de `?month=YYYY-MM` (nuqs, igual que el MonthSwitcher). */
export function useDashboard() {
  const [month] = useQueryState("month", parseAsString);
  const filters: DashboardFilters = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? { month } : {};
  return useQuery({
    queryKey: dashboardQueryKey(filters),
    queryFn: () => fetchDashboard(filters),
    placeholderData: (previous) => previous,
  });
}
