"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { budgetRatio, budgetTone, expectedPace, type BudgetTone } from "@/features/dashboard/budget-pace";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";
import type { BudgetStatus } from "@/features/dashboard/types";
import { formatMoney, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";

import { WidgetCard, WidgetError } from "./widget-card";

const FILL: Record<BudgetTone, string> = {
  normal: "bg-foreground/60",
  ahead: "bg-foreground/60",
  warning: "bg-warning",
  over: "bg-expense",
};

const TONE_TEXT: Partial<Record<BudgetTone, string>> = {
  ahead: "Vas por delante de tu ritmo",
  warning: "Cerca del límite",
  over: "Límite superado",
};

/**
 * Muesca vertical en la posición donde "debería" ir el consumo hoy (docs §3,
 * "Elemento firma"). Sobresale de la barra para leerse también sobre el relleno.
 */
function PaceMarker({ pace }: { pace: number }) {
  return (
    <span
      aria-hidden
      data-slot="pace-marker"
      className="absolute -top-1 -bottom-1 w-0.5 -translate-x-1/2 rounded-full bg-foreground ring-2 ring-card"
      style={{ left: `${pace * 100}%` }}
    />
  );
}

interface BudgetProgressProps {
  budget: BudgetStatus;
  pace: number | null;
  currency: string;
  locale: string;
}

export function BudgetProgress({ budget, pace, currency, locale }: BudgetProgressProps) {
  const fmt = { currency, locale };
  const ratio = budgetRatio(budget);
  const tone = budgetTone(ratio, budget.alertThreshold, pace);
  const pct = formatPercent(ratio, locale, 0);
  const pacePct = pace === null ? null : formatPercent(pace, locale, 0);
  const toneText = TONE_TEXT[tone];

  const label =
    `${budget.categoryName}: ${pct} del presupuesto usado, ${formatMoney(budget.spent, fmt)} de ${formatMoney(budget.limit, fmt)}` +
    (pacePct ? `; ritmo esperado hoy ${pacePct}` : "") +
    (toneText ? `. ${toneText}` : "");

  return (
    <li className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-[13px] leading-5">
        <span className="min-w-0 truncate font-medium" title={budget.categoryName}>
          {budget.categoryName}
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-muted-foreground">
            <Money value={budget.spent} {...fmt} className="text-foreground" /> /{" "}
            <Money value={budget.limit} {...fmt} />
          </span>
          <span
            className={cn(
              "num inline-flex min-w-11 items-center justify-end gap-1 font-medium",
              tone === "over" && "text-expense",
            )}
          >
            {tone === "warning" && <TriangleAlert aria-hidden className="size-3.5 self-center text-warning" />}
            {pct}
          </span>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, Math.round(ratio * 100))}
        aria-valuetext={pct}
        className="relative h-2 w-full rounded-full bg-muted"
      >
        <div
          className={cn("h-full rounded-full", FILL[tone])}
          style={{ width: `${Math.min(1, ratio) * 100}%` }}
        />
        {pace !== null && <PaceMarker pace={pace} />}
      </div>
      {toneText && tone !== "warning" && tone !== "over" && (
        <p aria-hidden className="text-xs leading-4 text-muted-foreground">
          {toneText}
        </p>
      )}
    </li>
  );
}

function BudgetSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-2">
          <div className="flex justify-between">
            <Skeleton className="h-4 w-24 motion-reduce:animate-none" />
            <Skeleton className="h-4 w-40 motion-reduce:animate-none" />
          </div>
          <Skeleton className="h-2 w-full motion-reduce:animate-none" />
        </div>
      ))}
    </div>
  );
}

export function BudgetList({ className }: { className?: string }) {
  const { data, isPending, isError, refetch, isRefetching } = useDashboard();

  let body: React.ReactNode;
  if (isPending) {
    body = <BudgetSkeleton />;
  } else if (isError || !data) {
    body = <WidgetError onRetry={() => refetch()} retrying={isRefetching} />;
  } else if (data.budgets.length === 0) {
    body = (
      <EmptyState
        message="Aún no tienes presupuestos."
        action={
          <Button variant="outline" size="sm" asChild>
            <Link href="/budgets">Crear presupuesto</Link>
          </Button>
        }
      />
    );
  } else {
    const pace = expectedPace(data.health);
    const closed = data.health.daysElapsed >= data.health.daysInMonth;
    body = (
      <div className="flex flex-col gap-4">
        <ul className="flex flex-col divide-y" aria-label="Presupuestos del mes">
          {data.budgets.map((b) => (
            <BudgetProgress key={b.budgetId} budget={b} pace={pace} currency={data.currency} locale={data.locale} />
          ))}
        </ul>
        {pace !== null && (
          <p className="flex items-center gap-2 text-xs leading-4 text-muted-foreground">
            <span aria-hidden className="h-3 w-0.5 rounded-full bg-foreground" />
            <span>
              = ritmo esperado {closed ? "(mes cerrado, " : "hoy ("}
              <span className="num">{formatPercent(pace, data.locale, 0)}</span>)
            </span>
          </p>
        )}
      </div>
    );
  }

  return (
    <WidgetCard slot="budget-list" title="Presupuestos" className={className}>
      {body}
    </WidgetCard>
  );
}
