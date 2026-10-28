import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { DashboardView } from "@/features/dashboard/components/dashboard-view";
import { dashboardFilters, dashboardQueryKey } from "@/features/dashboard/query";
import { getQueryClient } from "@/lib/query-client";
import { getSessionUser } from "@/server/auth";
import { getDashboard } from "@/server/services/dashboard.service";

export const metadata: Metadata = { title: "Resumen · Caudal" };

interface DashboardPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { month } = await searchParams;
  const filters = dashboardFilters(typeof month === "string" ? month : undefined);
  const user = await getSessionUser();

  // Prefetch con la misma clave que useDashboard(): el cliente hidrata sin pedir de nuevo.
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: dashboardQueryKey(filters),
    queryFn: () => getDashboard(user.id, filters),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <DashboardView />
    </HydrationBoundary>
  );
}
