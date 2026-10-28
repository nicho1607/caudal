"use client";

import { useQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState } from "nuqs";

import { dashboardFilters, dashboardQueryKey, type DashboardFilters } from "@/features/dashboard/query";
import type { DashboardData } from "@/features/dashboard/types";

export { dashboardQueryKey, type DashboardFilters };

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
  const filters = dashboardFilters(month);
  return useQuery({
    queryKey: dashboardQueryKey(filters),
    queryFn: () => fetchDashboard(filters),
    placeholderData: (previous) => previous,
  });
}
