"use client";

import { format, parse } from "date-fns";
import { es } from "date-fns/locale";
import { useCallback, useState } from "react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { TransactionSheet } from "@/features/transactions/components/transaction-sheet";
import { TransactionsTable, TransactionsTableSkeleton } from "@/features/transactions/components/transactions-table";
import { TransactionsToolbar } from "@/features/transactions/components/transactions-toolbar";
import type { TransactionTableSort } from "@/features/transactions/filters";
import { useTransactionFilters, useTransactionList } from "@/features/transactions/hooks/use-transaction-list";
import { requestQuickAdd } from "@/lib/quick-add";

interface TransactionsViewProps {
  locale: string;
  /** yyyy-mm-dd en la zona del usuario (atajos del rango de fechas). */
  today: string;
  /** YYYY-MM en la zona del usuario: mes por defecto sin `?month=`. */
  currentMonth: string;
}

/** Página de movimientos: toolbar de filtros en la URL + tabla con 'Cargar más'. */
export function TransactionsView({ locale, today, currentMonth }: TransactionsViewProps) {
  const { filters, setFilters, month, query, range, active, clear } = useTransactionFilters(currentMonth);
  const list = useTransactionList(query);
  const [editingId, setEditingId] = useState<string | null>(null);

  const onSort = useCallback((sort: TransactionTableSort) => void setFilters({ sort }), [setFilters]);
  const onClear = useCallback(() => void clear(), [clear]);

  const monthLabel = format(parse(month, "yyyy-MM", new Date()), "MMMM yyyy", { locale: es });
  const rows = list.data?.pages.flatMap((page) => page.items) ?? [];

  let body: React.ReactNode;
  if (list.isPending) {
    body = <TransactionsTableSkeleton />;
  } else if (list.isError && rows.length === 0) {
    body = (
      <EmptyState
        message="No se pudo cargar."
        action={
          <Button variant="outline" size="sm" onClick={() => list.refetch()} disabled={list.isRefetching}>
            Reintentar
          </Button>
        }
      />
    );
  } else if (rows.length === 0) {
    body = active ? (
      <EmptyState
        message="No hay movimientos que coincidan con estos filtros."
        action={
          <Button variant="outline" size="sm" onClick={onClear}>
            Limpiar filtros
          </Button>
        }
      />
    ) : (
      <EmptyState
        message={`Aún no hay movimientos en ${monthLabel}.`}
        action={
          <Button variant="outline" size="sm" onClick={() => requestQuickAdd()}>
            Añadir movimiento
          </Button>
        }
      />
    );
  } else {
    body = (
      <TransactionsTable
        rows={rows}
        locale={locale}
        today={today}
        sort={filters.sort}
        onSort={onSort}
        onEdit={setEditingId}
        stale={list.isPlaceholderData}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-[15px] leading-[22px] font-semibold">Movimientos</h1>
      <TransactionsToolbar
        filters={filters}
        setFilters={setFilters}
        range={range}
        monthLabel={monthLabel}
        today={today}
        locale={locale}
        active={active}
        onClear={onClear}
      />
      <section aria-label="Lista de movimientos" className="flex min-h-48 flex-col rounded-lg border bg-card px-2 md:px-3">
        {body}
      </section>
      {rows.length > 0 ? (
        <div className="flex flex-col items-center gap-2">
          {list.hasNextPage ? (
            <Button
              variant="outline"
              onClick={() => list.fetchNextPage()}
              disabled={list.isFetchingNextPage}
            >
              {list.isFetchingNextPage ? "Cargando…" : "Cargar más"}
            </Button>
          ) : null}
          <p className="num text-xs text-muted-foreground" aria-live="polite">
            {list.hasNextPage ? "Mostrando " : ""}
            {rows.length} {rows.length === 1 ? "movimiento" : "movimientos"}
          </p>
        </div>
      ) : null}
      <TransactionSheet transactionId={editingId} onOpenChange={(open) => !open && setEditingId(null)} />
    </div>
  );
}
