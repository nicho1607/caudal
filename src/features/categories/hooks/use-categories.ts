"use client";

import { useQuery } from "@tanstack/react-query";

import type { CategoryOptionDTO } from "@/features/categories/types";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** Categorías activas en orden de árbol (`GET /api/v1/categories`). */
export function useCategories({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: () => apiFetch<CategoryOptionDTO[]>("/api/v1/categories"),
    enabled,
    staleTime: 5 * 60_000,
  });
}
