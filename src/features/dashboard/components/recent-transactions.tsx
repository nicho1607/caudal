"use client";

import Link from "next/link";
import { useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/features/dashboard/hooks/use-dashboard";
import type { RecentTransaction } from "@/features/dashboard/types";
import { TransactionRowActions } from "@/features/transactions/components/transaction-row-actions";
import { TransactionSheet } from "@/features/transactions/components/transaction-sheet";
import { formatShortDate } from "@/lib/format";
import { requestQuickAdd } from "@/lib/quick-add";
import { cn } from "@/lib/utils";

import { WidgetCard, WidgetError } from "./widget-card";

// Fecha · descripción · categoría · cuenta · importe · acciones. Por debajo de sm
// la fila pasa a dos líneas (descripción + importe; fecha · categoría · cuenta).
const ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 sm:h-10 sm:grid-cols-[3.5rem_minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,0.9fr)_8.5rem_1.75rem]";

/** Título de la fila: "Bancolombia Ahorros → Nu Ahorros" en transferencias, si no payee o descripción. */
export function recentTitle(t: RecentTransaction): string {
  if (t.type === "TRANSFER") {
    return t.counterpartAccountName ? `${t.accountName} → ${t.counterpartAccountName}` : t.accountName;
  }
  return t.payee || t.description || "Sin descripción";
}

const AMOUNT_TONE: Record<RecentTransaction["type"], string> = {
  INCOME: "text-income",
  EXPENSE: "text-expense",
  TRANSFER: "text-transfer",
};

function CategoryLabel({ t }: { t: RecentTransaction }) {
  if (t.type === "TRANSFER") return <span className="truncate text-muted-foreground">Transferencia</span>;
  if (!t.categoryName) return <span className="truncate text-muted-foreground">Sin categoría</span>;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full bg-muted-foreground"
        style={t.categoryColor ? { backgroundColor: t.categoryColor } : undefined}
      />
      <span className="truncate">{t.categoryName}</span>
      {t.autoCategorized ? (
        <span className="shrink-0 text-muted-foreground" title="Categoría asignada automáticamente">
          <span aria-hidden>✦</span>
          <span className="sr-only">(asignada automáticamente)</span>
        </span>
      ) : null}
    </span>
  );
}

function RecentRow({
  t,
  locale,
  onEdit,
}: {
  t: RecentTransaction;
  locale: string;
  onEdit: (id: string) => void;
}) {
  const title = recentTitle(t);
  const date = formatShortDate(t.date, locale);
  const pending = t.status === "PENDING";

  return (
    <li data-transaction-id={t.id} className={cn(ROW_GRID, "border-b py-2 text-[13px] leading-5 last:border-b-0 sm:py-0")}>
      <span className="num hidden text-xs text-muted-foreground sm:block">{date}</span>

      {/* En móvil el div se disuelve (contents): la meta ocupa la segunda línea bajo título e importe. */}
      <div className="min-w-0 max-sm:contents">
        <p className="flex min-w-0 items-center gap-2">
          <span className="truncate font-medium" title={title}>
            {title}
          </span>
          {pending ? <span className="shrink-0 text-xs text-muted-foreground">Pendiente</span> : null}
        </p>
        {/* Meta en móvil */}
        <p className="col-span-2 col-start-1 row-start-2 flex min-w-0 items-center gap-1 text-xs text-muted-foreground sm:hidden">
          <span className="num shrink-0">{date}</span>
          <span aria-hidden>·</span>
          {/* La categoría conserva su ancho (hasta 65 %) y la cuenta se trunca primero. */}
          <span className="flex min-w-0 max-w-[65%] shrink-0">
            <CategoryLabel t={t} />
          </span>
          {t.type !== "TRANSFER" ? (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 truncate">{t.accountName}</span>
            </>
          ) : null}
        </p>
      </div>

      <span className="hidden min-w-0 sm:flex">
        <CategoryLabel t={t} />
      </span>
      <span className="hidden truncate text-muted-foreground sm:block" title={t.accountName}>
        {t.type === "TRANSFER" ? "" : t.accountName}
      </span>

      <Money
        value={t.type === "TRANSFER" ? Math.abs(t.amount) : t.amount}
        currency={t.currency}
        locale={locale}
        signed={t.type === "INCOME"}
        className={cn("text-right font-medium", AMOUNT_TONE[t.type])}
      />

      <TransactionRowActions
        target={{ id: t.id, transferGroupId: t.transferGroupId }}
        label={title}
        onEdit={onEdit}
        className="-mr-1.5 text-muted-foreground max-sm:row-span-2"
      />
    </li>
  );
}

function RecentSkeleton() {
  return (
    <div aria-hidden className="flex flex-col">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className={cn(ROW_GRID, "h-12 border-b last:border-b-0 sm:h-10")}>
          <Skeleton className="hidden h-3 w-10 sm:block motion-reduce:animate-none" />
          <Skeleton className="h-3.5 w-3/4 motion-reduce:animate-none" />
          <Skeleton className="hidden h-3.5 w-2/3 sm:block motion-reduce:animate-none" />
          <Skeleton className="hidden h-3.5 w-1/2 sm:block motion-reduce:animate-none" />
          <Skeleton className="h-3.5 w-20 motion-reduce:animate-none" />
          <span className="size-7" />
        </div>
      ))}
    </div>
  );
}

/** Últimos 8 movimientos del mes con acciones por fila (editar, duplicar, eliminar). */
export function RecentTransactions({ className }: { className?: string }) {
  const { data, isPending, isError, refetch, isRefetching } = useDashboard();
  const [editingId, setEditingId] = useState<string | null>(null);

  let body: React.ReactNode;
  if (isPending) {
    body = <RecentSkeleton />;
  } else if (isError || !data) {
    body = <WidgetError onRetry={() => refetch()} retrying={isRefetching} />;
  } else if (data.recent.length === 0) {
    body = (
      <EmptyState
        message="Aún no hay movimientos este mes."
        action={
          <Button variant="outline" size="sm" onClick={() => requestQuickAdd()}>
            Añadir movimiento
          </Button>
        }
      />
    );
  } else {
    body = (
      <ul aria-label="Últimos movimientos del mes" className="-mx-1 px-1">
        {data.recent.map((t) => (
          <RecentRow key={t.id} t={t} locale={data.locale} onEdit={setEditingId} />
        ))}
      </ul>
    );
  }

  return (
    <WidgetCard
      slot="recent-transactions"
      title="Últimos movimientos"
      className={cn("min-h-0", className)}
      actions={
        <Button variant="link" size="sm" asChild className="h-auto px-0 text-muted-foreground">
          <Link href="/transactions">Ver todos</Link>
        </Button>
      }
    >
      {body}
      <TransactionSheet transactionId={editingId} onOpenChange={(open) => !open && setEditingId(null)} />
    </WidgetCard>
  );
}
