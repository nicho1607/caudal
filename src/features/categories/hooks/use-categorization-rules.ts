"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useInvalidateCategoryData } from "@/features/categories/hooks/use-categories";
import type { CreateRuleInput, UpdateRuleInput } from "@/features/categories/schemas";
import type { CategorizationRuleDTO, PayeeOptionDTO } from "@/features/categories/types";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

export const rulesApi = {
  list: () => apiFetch<CategorizationRuleDTO[]>("/api/v1/categorization-rules"),
  create: (input: CreateRuleInput) =>
    apiFetch<CategorizationRuleDTO>("/api/v1/categorization-rules", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: UpdateRuleInput) =>
    apiFetch<CategorizationRuleDTO>(`/api/v1/categorization-rules/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};

/** Reglas de categorización (todas), en orden de evaluación. */
export function useCategorizationRules({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({ queryKey: queryKeys.categorize.rules(), queryFn: rulesApi.list, enabled });
}

/** Comercios conocidos (`GET /api/v1/payees`). */
export function usePayees({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.payees.list(),
    queryFn: () => apiFetch<PayeeOptionDTO[]>("/api/v1/payees"),
    enabled,
    staleTime: 5 * 60_000,
  });
}

export function useCreateRule() {
  const invalidate = useInvalidateCategoryData();
  return useMutation({ mutationFn: rulesApi.create, onSettled: invalidate });
}

/** PATCH con cambio optimista en la lista (p. ej. el switch "activa"). */
export function useUpdateRule() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCategoryData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateRuleInput }) => rulesApi.update(id, input),
    onMutate: async ({ id, input }) => {
      const key = queryKeys.categorize.rules();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CategorizationRuleDTO[]>(key);
      if (input.isActive !== undefined) {
        queryClient.setQueryData<CategorizationRuleDTO[]>(key, (old) =>
          old?.map((r) => (r.id === id ? { ...r, isActive: input.isActive! } : r)),
        );
      }
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.categorize.rules(), context.previous);
    },
    onSettled: invalidate,
  });
}
