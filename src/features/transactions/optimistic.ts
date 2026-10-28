// Inserción optimista de un movimiento recién creado en las cachés visibles
// (listas de movimientos y "Movimientos recientes" del dashboard). Puro: sin
// React. Testeado en tests/unit/transaction-optimistic.test.ts. Tras la
// respuesta del servidor se invalidan las claves, así que basta con que la fila
// aparezca donde el usuario la espera; las listas cuyo filtro u orden no se
// puedan evaluar aquí se dejan intactas.
import { cssColor } from "@/lib/color";
import type { DashboardData, RecentTransaction } from "@/features/dashboard/types";
import type { CreateTransactionInput } from "@/features/transactions/schemas";
import type { TransactionDTO, TransactionListDTO } from "@/features/transactions/types";

export const OPTIMISTIC_ID_PREFIX = "optimistic-";

export interface PreviewLookups {
  accounts: { id: string; name: string; currency: string; color: string | null }[];
  categories: { id: string; name: string; color: string | null; icon: string | null; parentId: string | null }[];
  tags?: { id: string; name: string; color: string | null }[];
  /** Categoría que se mostrará si el servidor auto-categoriza (sugerencia aceptada). */
  suggestedCategoryId?: string | null;
  now?: Date;
  id?: string;
}

/** DTO provisional (pata de origen en transferencias) a partir del cuerpo del POST. */
export function previewTransaction(input: CreateTransactionInput, lookups: PreviewLookups): TransactionDTO {
  const account = lookups.accounts.find((a) => a.id === input.accountId);
  const abs = String(input.amount);
  const signed = input.type === "INCOME" ? abs : `-${abs}`;
  const now = (lookups.now ?? new Date()).toISOString();
  const id = lookups.id ?? `${OPTIMISTIC_ID_PREFIX}${Math.random().toString(36).slice(2)}`;
  const currency = account?.currency ?? "COP";

  let category: TransactionDTO["category"] = null;
  let payee: TransactionDTO["payee"] = null;
  let transfer: TransactionDTO["transfer"] = null;
  let autoCategorized = false;
  if (input.type === "TRANSFER") {
    const to = lookups.accounts.find((a) => a.id === input.toAccountId);
    transfer = {
      counterpartId: `${id}-in`,
      counterpartAccount: { id: input.toAccountId, name: to?.name ?? "" },
      direction: "out",
    };
  } else {
    const categoryId = input.categoryId === undefined ? lookups.suggestedCategoryId : input.categoryId;
    const c = categoryId ? lookups.categories.find((x) => x.id === categoryId) : undefined;
    if (c) category = { id: c.id, name: c.name, color: c.color, icon: c.icon, parentId: c.parentId };
    autoCategorized = input.categoryId === undefined && !!category;
    if (input.payee?.trim()) payee = { id: `${id}-payee`, name: input.payee.trim() };
  }

  return {
    id,
    type: input.type,
    status: "CLEARED",
    date: input.date,
    amount: signed,
    amountBase: signed,
    currency,
    fxRate: "1",
    description: input.description?.trim() || null,
    notes: input.notes?.trim() || null,
    autoCategorized,
    categorizationRuleId: null,
    recurringRuleId: null,
    transferGroupId: input.type === "TRANSFER" ? `${id}-group` : null,
    account: {
      id: input.accountId,
      name: account?.name ?? "",
      currency,
      color: account?.color ?? null,
    },
    category,
    payee,
    tags: (input.tagIds ?? []).flatMap((tagId) => lookups.tags?.filter((t) => t.id === tagId) ?? []),
    transfer,
    deletedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

const asList = (v: unknown): string[] | undefined =>
  v === undefined ? undefined : Array.isArray(v) ? v.map(String) : String(v).split(",").filter(Boolean);

/**
 * ¿La fila entra en la lista con estos filtros (los de la query key)? Sólo se
 * evalúan fecha, tipo y cuenta; con búsqueda, categoría o etiqueta → false
 * (no se puede saber sin el servidor), igual que con un orden que no sea por fecha.
 */
export function fitsListFilters(dto: TransactionDTO, filters: Record<string, unknown>): boolean {
  if (filters.q || filters.categoryIds || filters.tagIds) return false;
  if ((filters.sort ?? "date") !== "date") return false;
  if (typeof filters.dateFrom === "string" && dto.date < filters.dateFrom) return false;
  if (typeof filters.dateTo === "string" && dto.date > filters.dateTo) return false;
  const types = asList(filters.types);
  if (types && !types.includes(dto.type)) return false;
  const accountIds = asList(filters.accountIds);
  if (accountIds) {
    const ids = [dto.account.id, dto.transfer?.counterpartAccount.id].filter(Boolean) as string[];
    if (!ids.some((id) => accountIds.includes(id))) return false;
  }
  return true;
}

function insertByDate<T extends { date: string }>(items: T[], row: T, order: "asc" | "desc"): T[] {
  const index =
    order === "desc" ? items.findIndex((t) => t.date <= row.date) : items.findIndex((t) => t.date > row.date);
  if (index === -1) return [...items, row];
  return [...items.slice(0, index), row, ...items.slice(index)];
}

/**
 * Inserta la fila en una lista `{ items }` o infinita `{ pages: [{ items }] }`
 * (en la primera página cuyo rango la contenga; si cae después de la última
 * página cargada y hay más, no se inserta).
 */
export function insertIntoList(old: unknown, dto: TransactionDTO, filters: Record<string, unknown>): unknown {
  if (!old || typeof old !== "object" || !fitsListFilters(dto, filters)) return old;
  const order = filters.order === "asc" ? "asc" : "desc";
  if ("pages" in old && Array.isArray(old.pages)) {
    const pages = old.pages as TransactionListDTO[];
    const target = pages.findIndex((page) =>
      page.items.some((t) => (order === "desc" ? t.date <= dto.date : t.date > dto.date)),
    );
    const index = target === -1 ? (pages.at(-1)?.nextCursor ? -1 : pages.length - 1) : target;
    if (index === -1) return old;
    return {
      ...old,
      pages: pages.map((page, i) => (i === index ? { ...page, items: insertByDate(page.items, dto, order) } : page)),
    };
  }
  if ("items" in old && Array.isArray(old.items)) {
    const list = old as TransactionListDTO;
    return { ...list, items: insertByDate(list.items, dto, order) };
  }
  return old;
}

/** "Movimientos recientes": sólo si el movimiento es del mes del dashboard. Máx. 8 filas. */
export function insertIntoRecent(data: DashboardData | undefined, dto: TransactionDTO): DashboardData | undefined {
  if (!data?.recent || !dto.date.startsWith(data.month)) return data;
  const row: RecentTransaction = {
    id: dto.id,
    date: dto.date,
    description: dto.description ?? dto.payee?.name ?? "",
    payee: dto.payee?.name ?? null,
    categoryName: dto.category?.name ?? null,
    categoryColor: cssColor(dto.category?.color),
    accountName: dto.account.name,
    type: dto.type,
    amount: Number(dto.amount),
    currency: dto.currency,
    status: dto.status,
    autoCategorized: dto.autoCategorized,
    transferGroupId: dto.transferGroupId,
    counterpartAccountName: dto.transfer?.counterpartAccount.name ?? null,
  };
  return { ...data, recent: insertByDate(data.recent, row, "desc").slice(0, Math.max(8, data.recent.length)) };
}
