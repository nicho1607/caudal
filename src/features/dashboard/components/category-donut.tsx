"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";

import { ChartTooltip, ChartTooltipRow } from "@/components/charts/chart-tooltip";
import { usePrefersReducedMotion } from "@/components/charts/use-reduced-motion";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { groupCategorySlices, type DonutSlice } from "@/features/dashboard/chart-data";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";
import { formatMoney, formatPercent } from "@/lib/format";
import { requestQuickAdd } from "@/lib/quick-add";

import { WidgetCard, WidgetError } from "./widget-card";

const SIZE = 176;

function sharePercent(share: number, locale: string) {
  if (share > 0 && share < 0.01) return `<${formatPercent(0.01, locale, 0)}`;
  return formatPercent(share, locale, 0);
}

function DonutSkeleton() {
  return (
    <div aria-hidden className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
      <Skeleton className="size-44 shrink-0 rounded-full motion-reduce:animate-none" />
      <div className="flex w-full flex-col gap-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <Skeleton key={i} className="h-4 w-full motion-reduce:animate-none" />
        ))}
      </div>
    </div>
  );
}

export function CategoryDonut({ className }: { className?: string }) {
  const { data, isPending, isError, refetch, isRefetching } = useDashboard();
  const reducedMotion = usePrefersReducedMotion();

  let body: React.ReactNode;
  if (isPending) {
    body = <DonutSkeleton />;
  } else if (isError || !data) {
    body = <WidgetError onRetry={() => refetch()} retrying={isRefetching} />;
  } else {
    const fmt = { currency: data.currency, locale: data.locale };
    const { slices, total } = groupCategorySlices(data.categories);

    body =
      slices.length === 0 ? (
        <EmptyState
          message="Aún no hay gastos este mes."
          action={
            <Button variant="outline" size="sm" onClick={() => requestQuickAdd({ type: "EXPENSE" })}>
              Añadir movimiento
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center lg:flex-col xl:flex-row">
          <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
            <PieChart width={SIZE} height={SIZE} margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={slices}
                dataKey="amount"
                nameKey="name"
                innerRadius="66%"
                outerRadius="100%"
                startAngle={90}
                endAngle={-270}
                stroke="var(--card)"
                strokeWidth={2}
                isAnimationActive={!reducedMotion}
              >
                {slices.map((s) => (
                  <Cell key={s.id} fill={s.color} />
                ))}
              </Pie>
              <Tooltip
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const slice = payload?.[0]?.payload as DonutSlice | undefined;
                  if (!active || !slice) return null;
                  return (
                    <ChartTooltip className="min-w-0">
                      <ChartTooltipRow
                        label={slice.name}
                        value={formatMoney(slice.amount, fmt)}
                        color={slice.color}
                      />
                      <ChartTooltipRow label="Del total" value={sharePercent(slice.share, data.locale)} muted />
                    </ChartTooltip>
                  );
                }}
              />
            </PieChart>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs leading-4 text-muted-foreground">Total</span>
              <Money value={total} {...fmt} className="text-[15px] leading-[22px] font-semibold" />
            </div>
          </div>

          <ul className="flex w-full min-w-0 flex-col gap-2" aria-label="Gasto por categoría">
            {slices.map((s) => (
              <li key={s.id} className="flex items-center gap-2 text-[13px] leading-5">
                <span aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate" title={s.name}>
                  {s.name}
                </span>
                <Money value={s.amount} {...fmt} />
                <span className="num w-10 shrink-0 text-right text-xs text-muted-foreground">
                  {sharePercent(s.share, data.locale)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
  }

  return (
    <WidgetCard slot="category-donut" title="Gasto por categoría" className={className}>
      {body}
    </WidgetCard>
  );
}
