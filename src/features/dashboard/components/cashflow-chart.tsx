"use client";

import { useId, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { ChartTooltip, ChartTooltipRow } from "@/components/charts/chart-tooltip";
import { usePrefersReducedMotion } from "@/components/charts/use-reduced-motion";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { buildCashflowRows, isCashflowEmpty, type CashflowRow } from "@/features/dashboard/chart-data";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";
import type { CashflowRange } from "@/features/dashboard/types";
import { formatMoney } from "@/lib/format";
import { requestQuickAdd } from "@/lib/quick-add";

import { WidgetCard, WidgetError } from "./widget-card";

const RANGES: { value: CashflowRange; label: string }[] = [
  { value: "monthly", label: "Mes" },
  { value: "quarterly", label: "Trimestre" },
  { value: "yearly", label: "Año" },
];

// Colores siempre desde tokens CSS: cambian solos con `.dark`.
const INCOME = "var(--income)";
const EXPENSE = "var(--expense)";
const NET = "var(--foreground)";
const MUTED = "var(--muted-foreground)";
const GRID = "var(--border)";

const CHART_H = "h-60";

interface MoneyFmt {
  currency: string;
  locale: string;
}

/** Trama diagonal (segmento proyectado): fondo `*-subtle` + rayas del color semántico. */
function HatchPattern({ id, color, subtle }: { id: string; color: string; subtle: string }) {
  return (
    <pattern id={id} width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill={subtle} />
      <line x1="0" y1="0" x2="0" y2="5" stroke={color} strokeWidth="1.5" strokeOpacity="0.7" />
    </pattern>
  );
}

function LegendItem({ swatch, children }: { swatch: React.ReactNode; children: React.ReactNode }) {
  return (
    <li className="flex items-center gap-1.5">
      {swatch}
      {children}
    </li>
  );
}

function CashflowLegend({ projected }: { projected: boolean }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs leading-4 text-muted-foreground">
      <LegendItem swatch={<span aria-hidden className="size-2 rounded-[2px] bg-income" />}>Ingresos</LegendItem>
      <LegendItem swatch={<span aria-hidden className="size-2 rounded-[2px] bg-expense" />}>Gastos</LegendItem>
      <LegendItem swatch={<span aria-hidden className="h-0.5 w-3 rounded-full bg-foreground" />}>Neto</LegendItem>
      {projected ? (
        <LegendItem
          swatch={
            <span
              aria-hidden
              className="size-2 rounded-[2px] border border-dashed border-muted-foreground bg-[repeating-linear-gradient(45deg,var(--muted-foreground)_0_1px,transparent_1px_3px)]"
            />
          }
        >
          Proyección a fin de mes
        </LegendItem>
      ) : null}
    </ul>
  );
}

function CashflowTooltipContent({ row, fmt }: { row: CashflowRow; fmt: MoneyFmt }) {
  const money = (v: number) => formatMoney(v, fmt);
  return (
    <ChartTooltip title={row.projected ? `${row.label} · a la fecha` : row.label}>
      <ChartTooltipRow label="Ingresos" value={money(row.income)} color={INCOME} />
      <ChartTooltipRow label="Gastos" value={money(row.expense)} color={EXPENSE} />
      <ChartTooltipRow label="Neto" value={money(row.netToDate)} color={NET} line />
      {row.projection ? (
        <>
          <p className="mt-1.5 border-t pt-1.5 font-medium">Proyección a fin de mes</p>
          <ChartTooltipRow label="Ingresos" value={`≈ ${money(row.projection.income)}`} muted />
          <ChartTooltipRow label="Gastos" value={`≈ ${money(row.projection.expense)}`} muted />
          <ChartTooltipRow label="Neto" value={`≈ ${money(row.projection.net)}`} muted />
        </>
      ) : null}
    </ChartTooltip>
  );
}

function CashflowSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-3">
      <Skeleton className="h-4 w-56 motion-reduce:animate-none" />
      <Skeleton className={`${CHART_H} w-full motion-reduce:animate-none`} />
    </div>
  );
}

export function CashflowChart({ className }: { className?: string }) {
  const { data, isPending, isError, refetch, isRefetching } = useDashboard();
  const [range, setRange] = useState<CashflowRange>("monthly");
  const reducedMotion = usePrefersReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const toggle = (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      spacing={0}
      value={range}
      onValueChange={(v) => v && setRange(v as CashflowRange)}
      aria-label="Rango del gráfico"
    >
      {RANGES.map((r) => (
        <ToggleGroupItem key={r.value} value={r.value} className="px-3 text-muted-foreground data-[state=on]:text-foreground">
          {r.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  let body: React.ReactNode;
  if (isPending) {
    body = <CashflowSkeleton />;
  } else if (isError || !data) {
    body = <WidgetError onRetry={() => refetch()} retrying={isRefetching} />;
  } else {
    const buckets = data.cashflow[range];
    const fmt = { currency: data.currency, locale: data.locale };
    const rows = buildCashflowRows(buckets, range, data.health);
    const projected = rows.some((r) => r.projected);
    const animate = !reducedMotion;

    body = isCashflowEmpty(buckets) ? (
      <EmptyState
        message="Aún no hay movimientos en este periodo."
        action={
          <Button variant="outline" size="sm" onClick={() => requestQuickAdd()}>
            Añadir movimiento
          </Button>
        }
      />
    ) : (
      <div className="flex flex-col gap-3">
        <CashflowLegend projected={projected} />
        <div className={`num ${CHART_H} w-full`}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barGap={3} barCategoryGap="22%" maxBarSize={40}>
              <defs>
                <HatchPattern id={`${uid}-income`} color={INCOME} subtle="var(--income-subtle)" />
                <HatchPattern id={`${uid}-expense`} color={EXPENSE} subtle="var(--expense-subtle)" />
              </defs>
              <CartesianGrid vertical={false} stroke={GRID} />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={{ stroke: GRID }}
                tick={{ fill: MUTED, fontSize: 12 }}
                tickMargin={8}
              />
              <YAxis
                width={64}
                tickLine={false}
                axisLine={false}
                tick={{ fill: MUTED, fontSize: 12 }}
                tickCount={5}
                tickFormatter={(v: number) => formatMoney(v, { ...fmt, compact: true })}
              />
              <Tooltip
                cursor={{ fill: "var(--muted)", fillOpacity: 0.6 }}
                isAnimationActive={false}
                content={({ active, payload }) => {
                  const row = payload?.[0]?.payload as CashflowRow | undefined;
                  return active && row ? <CashflowTooltipContent row={row} fmt={fmt} /> : null;
                }}
              />
              <Bar dataKey="income" name="Ingresos" stackId="income" fill={INCOME} isAnimationActive={animate} />
              <Bar
                dataKey="incomeRemaining"
                name="Ingresos proyectados"
                stackId="income"
                fill={`url(#${uid}-income)`}
                stroke={INCOME}
                strokeWidth={1}
                strokeDasharray="3 2"
                isAnimationActive={animate}
              />
              <Bar dataKey="expense" name="Gastos" stackId="expense" fill={EXPENSE} isAnimationActive={animate} />
              <Bar
                dataKey="expenseRemaining"
                name="Gastos proyectados"
                stackId="expense"
                fill={`url(#${uid}-expense)`}
                stroke={EXPENSE}
                strokeWidth={1}
                strokeDasharray="3 2"
                isAnimationActive={animate}
              />
              <Line
                dataKey="net"
                name="Neto"
                type="linear"
                stroke={NET}
                strokeWidth={1.5}
                dot={{ r: 2.5, fill: NET, strokeWidth: 0 }}
                activeDot={{ r: 3.5, fill: NET, stroke: "var(--card)", strokeWidth: 2 }}
                connectNulls={false}
                isAnimationActive={animate}
              />
              {projected ? (
                <Line
                  dataKey="netProjected"
                  name="Neto proyectado"
                  type="linear"
                  stroke={NET}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={{ r: 3, fill: "var(--card)", stroke: NET, strokeWidth: 1.5 }}
                  activeDot={false}
                  connectNulls={false}
                  isAnimationActive={animate}
                />
              ) : null}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  }

  return (
    <WidgetCard slot="cashflow-chart" title="Ingresos vs gastos" actions={toggle} className={className}>
      {body}
    </WidgetCard>
  );
}
