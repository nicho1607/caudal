"use client";

// Filtros de la página de movimientos (URL vía nuqs) + lista infinita por cursor.
import { keepPreviousData, useInfiniteQuery } from "@tanstack/react-query";
import { parseAsString, useQueryState, useQueryStates } from "nuqs";
import { useCallback, useEffect, useMemo, useRef } from "react";

import {
  hasActiveFilters,
  resolveDateRange,
  resolveMonth,
  toListQuery,
  toSearchParams,
  transactionFilterParsers,
  transactionsListKey,
} from "@/features/transactions/filters";
import type { ListTransactionsFilters } from "@/features/transactions/schemas";
import type { TransactionListDTO } from "@/features/transactions/types";
import { apiFetch } from "@/lib/api";

/**
 * Estado de filtros en la URL (`q, from, to, type, account, category, tag,
 * sort`) + el mes del selector del topbar. Al cambiar de mes en el selector se
 * borra el rango explícito para que la tabla siga al mes elegido.
 */
export function useTransactionFilters(currentMonth: string) {
  const [filters, setFilters] = useQueryStates(transactionFilterParsers);
  const [monthParam] = useQueryState("month", parseAsString);
  const month = resolveMonth(monthParam, currentMonth);

  const previousMonth = useRef(month);
  useEffect(() => {
    if (previousMonth.current === month) return;
    previousMonth.current = month;
    void setFilters({ from: null, to: null });
  }, [month, setFilters]);

  const query = useMemo(() => toListQuery(filters, month), [filters, month]);
  const range = resolveDateRange(filters, month);
  const active = hasActiveFilters(filters);

  const clear = useCallback(
    () => setFilters({ q: null, from: null, to: null, type: null, account: null, category: null, tag: null }),
    [setFilters],
  );

  return { filters, setFilters, month, query, range, active, clear };
}

/** Páginas de `GET /api/v1/transactions` con 'Cargar más' (cursor). */
export function useTransactionList(query: ListTransactionsFilters) {
  return useInfiniteQuery({
    queryKey: transactionsListKey(query),
    queryFn: ({ pageParam, signal }) =>
      apiFetch<TransactionListDTO>(`/api/v1/transactions?${toSearchParams(query, pageParam)}`, { signal }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    placeholderData: keepPreviousData,
  });
}
