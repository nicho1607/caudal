// Estado de filtros de la página de movimientos en la URL (nuqs) y su
// traducción a la query de GET /api/v1/transactions. Sin "use client": lo usan
// tanto el prefetch de la página RSC como los hooks del cliente, así ambos
// construyen exactamente la misma query key.
//
// Fechas y mes: `?from` / `?to` (yyyy-mm-dd) son un rango explícito. Si no hay
// ninguno, el rango es el mes del selector del topbar (`?month=YYYY-MM`, sin
// parámetro = mes en curso). Al cambiar de mes en el selector, la vista borra
// from/to para que la tabla siga al mes (ver useTransactionFilters).
import {
  createLoader,
  parseAsArrayOf,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

import { TRANSACTION_TYPES, type ListTransactionsFilters } from "@/features/transactions/schemas";
import type { TransactionDTO } from "@/features/transactions/types";
import { queryKeys } from "@/lib/query-keys";

export const TRANSACTION_TABLE_SORTS = ["date-desc", "date-asc", "amount-desc", "amount-asc"] as const;
export type TransactionTableSort = (typeof TRANSACTION_TABLE_SORTS)[number];

/** Movimientos por página de la tabla ('Cargar más'). */
export const TRANSACTIONS_PAGE_SIZE = 50;

export const transactionFilterParsers = {
  q: parseAsString.withDefault(""),
  from: parseAsString,
  to: parseAsString,
  type: parseAsArrayOf(parseAsStringLiteral(TRANSACTION_TYPES)).withDefault([]),
  account: parseAsArrayOf(parseAsString).withDefault([]),
  category: parseAsArrayOf(parseAsString).withDefault([]),
  tag: parseAsArrayOf(parseAsString).withDefault([]),
  sort: parseAsStringLiteral(TRANSACTION_TABLE_SORTS).withDefault("date-desc"),
};

/** Lee los filtros de `searchParams` en la página RSC. */
export const loadTransactionFilters = createLoader(transactionFilterParsers);

export interface TransactionFilters {
  q: string;
  from: string | null;
  to: string | null;
  type: (typeof TRANSACTION_TYPES)[number][];
  account: string[];
  category: string[];
  tag: string[];
  sort: TransactionTableSort;
}

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/** yyyy-mm-dd válido (fecha real, no sólo el formato). */
export function isIsoDate(value: string | null | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** `?month=` válido o el mes en curso. */
export function resolveMonth(month: string | null | undefined, currentMonth: string): string {
  return month && MONTH_RE.test(month) ? month : currentMonth;
}

export function monthRange(month: string): { from: string; to: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * Rango efectivo: from/to explícitos (válidos) o, si no hay ninguno, el mes
 * seleccionado. Un rango invertido se ordena. `isMonth` = viene del selector.
 */
export function resolveDateRange(
  filters: Pick<TransactionFilters, "from" | "to">,
  month: string,
): { from?: string; to?: string; isMonth: boolean } {
  let from = isIsoDate(filters.from) ? filters.from : undefined;
  let to = isIsoDate(filters.to) ? filters.to : undefined;
  if (!from && !to) return { ...monthRange(month), isMonth: true };
  if (from && to && from > to) [from, to] = [to, from];
  return { from, to, isMonth: false };
}

/** Filtros que el usuario ha puesto (el mes por defecto no cuenta). */
export function hasActiveFilters(filters: TransactionFilters): boolean {
  return (
    filters.q.trim() !== "" ||
    isIsoDate(filters.from) ||
    isIsoDate(filters.to) ||
    filters.type.length > 0 ||
    filters.account.length > 0 ||
    filters.category.length > 0 ||
    filters.tag.length > 0
  );
}

/** Estado de URL → query del listado (sin cursor). Una fila por transferencia. */
export function toListQuery(filters: TransactionFilters, month: string): ListTransactionsFilters {
  const range = resolveDateRange(filters, month);
  const [sort, order] = filters.sort.split("-") as ["date" | "amount", "asc" | "desc"];
  const q = filters.q.trim().slice(0, 100);
  const list = (ids: string[]) => {
    const clean = [...new Set(ids.map((id) => id.trim()).filter((id) => id && id.length <= 64))].slice(0, 100);
    return clean.length ? clean : undefined;
  };
  return {
    dateFrom: range.from,
    dateTo: range.to,
    q: q || undefined,
    types: filters.type.length ? [...new Set(filters.type)] : undefined,
    accountIds: list(filters.account),
    categoryIds: list(filters.category),
    tagIds: list(filters.tag),
    collapseTransfers: true,
    sort,
    order,
    limit: TRANSACTIONS_PAGE_SIZE,
  };
}

/**
 * Clave de la lista infinita. Cuelga de `queryKeys.transactions.lists()` para
 * que el borrado optimista (setQueriesData sobre ese prefijo, shape `{ pages }`)
 * y las invalidaciones la alcancen. Sin claves `undefined`: mismo hash en
 * servidor y cliente.
 */
export function transactionsListKey(query: ListTransactionsFilters) {
  const clean = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined));
  return queryKeys.transactions.list({ view: "table", ...clean });
}

/** Query → `?a=b` para el fetch del cliente (listas separadas por comas). */
export function toSearchParams(query: ListTransactionsFilters, cursor?: string | null): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, Array.isArray(value) ? value.join(",") : String(value));
  }
  if (cursor) params.set("cursor", cursor);
  return params;
}

/** Título de la fila: "Bancolombia Ahorros → Nu Ahorros" en transferencias, si no payee o descripción. */
export function transactionTitle(t: TransactionDTO): string {
  if (t.type === "TRANSFER" && t.transfer) {
    const other = t.transfer.counterpartAccount.name;
    return t.transfer.direction === "out" ? `${t.account.name} → ${other}` : `${other} → ${t.account.name}`;
  }
  return t.payee?.name || t.description || "Sin descripción";
}
