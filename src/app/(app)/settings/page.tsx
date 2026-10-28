import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import type { Metadata } from "next";

import { CategoriesSection } from "@/features/categories/components/categories-section";
import { RulesSection } from "@/features/categories/components/rules-section";
import { getQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { getSessionUser } from "@/server/auth";
import { listRules } from "@/server/services/categorization-rule.service";
import { listCategories } from "@/server/services/category.service";

export const metadata: Metadata = { title: "Ajustes · Caudal" };

export default async function SettingsPage() {
  const user = await getSessionUser();
  // Mismas claves que useCategoriesOverview() / useCategorizationRules(): hidrata sin pedir de nuevo.
  const queryClient = getQueryClient();
  await Promise.all([
    queryClient.prefetchQuery({
      queryKey: queryKeys.categories.overview(),
      queryFn: () => listCategories(user.id, { includeArchived: true }),
    }),
    queryClient.prefetchQuery({ queryKey: queryKeys.categorize.rules(), queryFn: () => listRules(user.id) }),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <div className="flex max-w-4xl flex-col gap-10">
        <h1 className="text-[15px] leading-[22px] font-semibold">Ajustes</h1>
        <CategoriesSection />
        <RulesSection locale={user.locale} />
      </div>
    </HydrationBoundary>
  );
}
