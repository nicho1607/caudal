"use client";

import { useQuery } from "@tanstack/react-query";

import type { TagDTO } from "@/features/tags/types";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

/** Etiquetas del usuario (`GET /api/v1/tags`). */
export function useTags({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.tags.list(),
    queryFn: () => apiFetch<TagDTO[]>("/api/v1/tags"),
    enabled,
    staleTime: 5 * 60_000,
  });
}
