"use client";

import { Button } from "@/components/ui/button";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";

import { BudgetList } from "./budget-list";
import { CashflowChart } from "./cashflow-chart";
import { CategoryDonut } from "./category-donut";
import { FinancialHealthPanel } from "./financial-health-panel";
import { KpiStrip, KpiStripSkeleton } from "./kpi-strip";
import { RecentTransactions } from "./recent-transactions";

export function DashboardView() {
  const { data, isPending, isError, refetch, isRefetching } = useDashboard();

  return (
    <div className="flex flex-col gap-6">
      <h1 className="sr-only">Resumen</h1>

      {isPending ? (
        <KpiStripSkeleton />
      ) : isError || !data ? (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border bg-card px-4 py-4">
          <p className="text-[13px] leading-5">No se pudo cargar.</p>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isRefetching}>
            Reintentar
          </Button>
        </div>
      ) : (
        <KpiStrip data={data} />
      )}

      {/* Rejilla de 12 columnas en ≥ lg; en una columna el orden es
          salud, presupuestos, movimientos y después los gráficos (docs §3). */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <CashflowChart className="order-4 lg:order-none lg:col-span-8" />
        <FinancialHealthPanel className="order-1 lg:order-none lg:col-span-4" />
        <CategoryDonut className="order-5 lg:order-none lg:col-span-5" />
        <BudgetList className="order-2 lg:order-none lg:col-span-7" />
        <RecentTransactions className="order-3 lg:order-none lg:col-span-12" />
      </div>
    </div>
  );
}
