"use client";

import { Button } from "@/components/ui/button";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";

import { BudgetList } from "./budget-list";
import { CashflowChart } from "./cashflow-chart";
import { CategoryDonut } from "./category-donut";
import { FinancialHealthPanel } from "./financial-health-panel";
import { KpiStrip, KpiStripSkeleton } from "./kpi-strip";
import { WidgetCard } from "./widget-card";

interface WidgetSlotProps {
  /** Identificador estable del hueco (`data-slot`), lo reemplaza la historia que lo implementa. */
  slot: string;
  title: string;
  className?: string;
}

/**
 * Hueco reservado para un widget aún no construido (DASH-005).
 * Mantiene la rejilla del wireframe (docs §3) sin mostrar datos inventados.
 */
function WidgetSlot({ slot, title, className }: WidgetSlotProps) {
  return (
    <WidgetCard slot={slot} title={title} className={className}>
      <div className="flex flex-1 items-center justify-center rounded-md border border-dashed">
        <p className="text-xs text-muted-foreground">Próximamente</p>
      </div>
    </WidgetCard>
  );
}

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
        <WidgetSlot
          slot="recent-transactions"
          title="Últimos movimientos"
          className="order-3 lg:order-none lg:col-span-12"
        />
      </div>
    </div>
  );
}
