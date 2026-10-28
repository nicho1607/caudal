import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { AccountsView } from "@/features/accounts/components/accounts-view";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { getSessionUser } from "@/server/auth";
import { listAccountBalances } from "@/server/services/account.service";

export const metadata: Metadata = { title: "Cuentas · Caudal" };

export default async function AccountsPage() {
  const user = await getSessionUser();
  // Misma clave que useAccountsOverview(): la página hidrata sin pedir de nuevo.
  const queryClient = getQueryClient();
  await queryClient.prefetchQuery({
    queryKey: queryKeys.accounts.overview(),
    queryFn: () => listAccountBalances(user.id, { includeArchived: true }),
  });

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <AccountsView baseCurrency={user.baseCurrency} locale={user.locale} />
    </HydrationBoundary>
  );
}
