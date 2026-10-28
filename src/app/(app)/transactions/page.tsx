import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { TransactionsView } from "@/features/transactions/components/transactions-view";
import {
  loadTransactionFilters,
  resolveMonth,
  toListQuery,
  transactionsListKey,
} from "@/features/transactions/filters";
import { listTransactionsQuerySchema } from "@/features/transactions/schemas";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { getSessionUser } from "@/server/auth";
import { listAccountBalances } from "@/server/services/account.service";
import { listCategories } from "@/server/services/category.service";
import { todayInTimeZone } from "@/server/services/dashboard.calc";
import { listTags } from "@/server/services/tag.service";
import { listTransactions } from "@/server/services/transaction.service";

export const metadata: Metadata = { title: "Movimientos · Caudal" };

interface TransactionsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function TransactionsPage({ searchParams }: TransactionsPageProps) {
  const params = await searchParams;
  const user = await getSessionUser();
  const today = todayInTimeZone(user.timezone);
  const currentMonth = today.slice(0, 7);

  const filters = loadTransactionFilters(params);
  const month = resolveMonth(typeof params.month === "string" ? params.month : undefined, currentMonth);
  const query = toListQuery(filters, month);

  // Prefetch de la primera página con la misma clave que useTransactionList():
  // al recargar con filtros en la URL, la tabla hidrata sin pedir de nuevo.
  const queryClient = getQueryClient();
  // Las opciones de las facetas también se prefetchean: la toolbar no salta al cargar.
  const parsed = listTransactionsQuerySchema.safeParse(query);
  await Promise.all([
    parsed.success
      ? queryClient.prefetchInfiniteQuery({
          queryKey: transactionsListKey(query),
          queryFn: () => listTransactions(user.id, parsed.data),
          initialPageParam: null as string | null,
        })
      : null,
    queryClient.prefetchQuery({ queryKey: queryKeys.accounts.list(), queryFn: () => listAccountBalances(user.id) }),
    queryClient.prefetchQuery({ queryKey: queryKeys.categories.list(), queryFn: () => listCategories(user.id) }),
    queryClient.prefetchQuery({ queryKey: queryKeys.tags.list(), queryFn: () => listTags(user.id) }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TransactionsView locale={user.locale} today={today} currentMonth={currentMonth} />
    </HydrationBoundary>
  );
}
