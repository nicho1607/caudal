"use client";

import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fixedShare } from "@/features/dashboard/budget-pace";
import { isProjectingMonth } from "@/features/dashboard/chart-data";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";
import type { DashboardData } from "@/features/dashboard/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { requestQuickAdd } from "@/lib/quick-add";
import { cn } from "@/lib/utils";

import { WidgetCard, WidgetError } from "./widget-card";

function signTone(value: number) {
  if (value > 0) return "text-income";
  if (value < 0) return "text-expense";
  return "text-muted-foreground";
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5">
      <dt className="text-[13px] leading-5 text-muted-foreground">{label}</dt>
      <dd className="text-right">{children}</dd>
    </div>
  );
}

/**
 * Fijos vs. variables en tonos neutros: verde/naranja significan dinero que
 * entra/sale (docs §3), no tipo de gasto.
 */
function FixedVariableBar({ data }: { data: DashboardData }) {
  const { fixedExpenses: fixed, variableExpenses: variable } = data.health;
  const fmt = { currency: data.currency, locale: data.locale };
  const share = fixedShare(fixed, variable);

  if (share === null) {
    return <p className="text-[13px] leading-5 text-muted-foreground">Aún no hay gastos este mes.</p>;
  }

  const fixedPct = formatPercent(share, data.locale, 0);
  const variablePct = formatPercent(1 - share, data.locale, 0);
  const label = `Gastos fijos ${formatMoney(fixed, fmt)} (${fixedPct}), variables ${formatMoney(variable, fmt)} (${variablePct})`;

  return (
    <div className="flex flex-col gap-2">
      <div role="img" aria-label={label} className="flex h-2 w-full gap-0.5 overflow-hidden rounded-full">
        {share > 0 && <div className="h-full rounded-l-full bg-foreground/70" style={{ width: `${share * 100}%` }} />}
        {share < 1 && <div className="h-full flex-1 rounded-r-full bg-foreground/20" />}
      </div>
      <div aria-hidden className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-xs leading-4">
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-foreground/70" />
          <span className="text-muted-foreground">Fijos</span>
          <Money value={fixed} {...fmt} />
          <span className="num text-muted-foreground">{fixedPct}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-foreground/20" />
          <span className="text-muted-foreground">Variables</span>
          <Money value={variable} {...fmt} />
          <span className="num text-muted-foreground">{variablePct}</span>
        </span>
      </div>
    </div>
  );
}

function HealthSkeleton() {
  return (
    <div aria-hidden className="flex flex-col divide-y">
      {[0, 1].map((i) => (
        <div key={i} className="flex items-center justify-between py-3">
          <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
          <Skeleton className="h-5 w-28 motion-reduce:animate-none" />
        </div>
      ))}
      <div className="flex flex-col gap-2 py-3">
        <Skeleton className="h-4 w-32 motion-reduce:animate-none" />
        <Skeleton className="h-2 w-full motion-reduce:animate-none" />
      </div>
      <div className="flex items-center justify-between py-3">
        <Skeleton className="h-4 w-28 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-24 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function FinancialHealthPanel({ className }: { className?: string }) {
  const { data, isPending, isError, refetch, isRefetching } = useDashboard();

  let body: React.ReactNode;
  if (isPending) {
    body = <HealthSkeleton />;
  } else if (isError || !data) {
    body = <WidgetError onRetry={() => refetch()} retrying={isRefetching} />;
  } else {
    const fmt = { currency: data.currency, locale: data.locale };
    const { health } = data;
    const income = data.kpis.monthIncome.value;
    const hasActivity = income !== 0 || health.fixedExpenses + health.variableExpenses !== 0;
    const projecting = isProjectingMonth(health);
    const projected = health.projectedMonthEnd;

    body = !hasActivity ? (
      <EmptyState
        message="Aún no hay movimientos este mes."
        action={
          <Button variant="outline" size="sm" onClick={() => requestQuickAdd()}>
            Añadir movimiento
          </Button>
        }
      />
    ) : (
      <dl className="flex flex-col divide-y">
        <Row label="Cash flow neto">
          <Money
            value={health.netCashflow}
            {...fmt}
            signed
            className={cn("text-[15px] leading-[22px] font-semibold", signTone(health.netCashflow))}
          />
        </Row>
        <Row label="Tasa de ahorro">
          <span className="num text-[15px] leading-[22px] font-semibold">
            {income > 0 ? formatPercent(health.savingsRate, data.locale, 1) : "—"}
          </span>
        </Row>
        <div className="flex flex-col gap-2 py-2.5">
          <dt className="text-[13px] leading-5 text-muted-foreground">Gastos fijos y variables</dt>
          <dd>
            <FixedVariableBar data={data} />
          </dd>
        </div>
        {projecting ? (
          <div className="grid grid-cols-[1fr_auto] items-baseline gap-x-3 gap-y-1 py-2.5">
            <dt className="text-[13px] leading-5 text-muted-foreground">Proyección a fin de mes</dt>
            <dd className="text-right">
              <span className="text-muted-foreground" aria-hidden>
                ≈{" "}
              </span>
              <span className="sr-only">aproximadamente </span>
              <Money
                value={projected.net}
                {...fmt}
                signed
                className={cn("text-[15px] leading-[22px] font-semibold", signTone(projected.net))}
              />
            </dd>
            <dd className="col-span-2 text-xs leading-4 text-muted-foreground">
              Ingresos ≈ <Money value={projected.income} {...fmt} /> · Gastos ≈{" "}
              <Money value={projected.expense} {...fmt} />
            </dd>
          </div>
        ) : (
          <Row label="Proyección a fin de mes">
            <span className="text-[13px] leading-5 text-muted-foreground">
              {health.daysElapsed >= health.daysInMonth ? "Mes cerrado" : "El mes aún no empieza"}
            </span>
          </Row>
        )}
      </dl>
    );
  }

  return (
    <WidgetCard slot="financial-health" title="Salud financiera" className={className}>
      {body}
    </WidgetCard>
  );
}
