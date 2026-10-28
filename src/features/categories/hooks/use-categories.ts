"use client";

// Lectura y mutaciones de categorías. Tras cada mutación se invalidan
// categorías, sugerencias/reglas, dashboard, movimientos y cuentas
// (useInvalidateCategoryData).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { toast } from "sonner";

import type { CreateCategoryInput, UpdateCategoryInput } from "@/features/categories/schemas";
import type { CategoryDTO } from "@/features/categories/types";
import { useInvalidateTransactionData } from "@/features/transactions/hooks/use-transactions";
import { apiFetch } from "@/lib/api";
import { queryKeys } from "@/lib/query-keys";

const path = (id: string, suffix = "") => `/api/v1/categories/${encodeURIComponent(id)}${suffix}`;

export const categoriesApi = {
  list: () => apiFetch<CategoryDTO[]>("/api/v1/categories"),
  overview: () => apiFetch<CategoryDTO[]>("/api/v1/categories?include=archived"),
  create: (input: CreateCategoryInput) =>
    apiFetch<CategoryDTO>("/api/v1/categories", { method: "POST", body: JSON.stringify(input) }),
  update: (id: string, input: UpdateCategoryInput) =>
    apiFetch<CategoryDTO>(path(id), { method: "PATCH", body: JSON.stringify(input) }),
  archive: (id: string) => apiFetch<CategoryDTO>(path(id, "/archive"), { method: "POST" }),
  unarchive: (id: string) => apiFetch<CategoryDTO>(path(id, "/unarchive"), { method: "POST" }),
};

/** Categorías activas en orden de árbol (`GET /api/v1/categories`). */
export function useCategories({ enabled = true }: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: queryKeys.categories.list(),
    queryFn: categoriesApi.list,
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Activas + archivadas (ajustes; la prefetchea su RSC con la misma clave). */
export function useCategoriesOverview() {
  return useQuery({ queryKey: queryKeys.categories.overview(), queryFn: categoriesApi.overview });
}

/** Categorías, reglas/sugerencias y todo lo que muestra nombres o colores de categoría. */
export function useInvalidateCategoryData() {
  const queryClient = useQueryClient();
  const invalidateTransactionData = useInvalidateTransactionData();
  return useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.categories.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.categorize.all }),
      invalidateTransactionData(),
    ]);
  }, [queryClient, invalidateTransactionData]);
}

export function useCreateCategory() {
  const invalidate = useInvalidateCategoryData();
  return useMutation({ mutationFn: categoriesApi.create, onSettled: invalidate });
}

export function useUpdateCategory() {
  const invalidate = useInvalidateCategoryData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateCategoryInput }) => categoriesApi.update(id, input),
    onSettled: invalidate,
  });
}

/** Archivar / restaurar con cambio optimista (la categoría y sus subcategorías). */
function useSetArchived(archived: boolean) {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateCategoryData();
  return useMutation({
    mutationFn: (id: string) => (archived ? categoriesApi.archive(id) : categoriesApi.unarchive(id)),
    onMutate: async (id) => {
      const key = queryKeys.categories.overview();
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<CategoryDTO[]>(key);
      const at = new Date().toISOString();
      const target = previous?.find((c) => c.id === id);
      queryClient.setQueryData<CategoryDTO[]>(key, (old) =>
        old?.map((c) => {
          if (c.id === id) return { ...c, archivedAt: archived ? at : null };
          if (c.parentId !== id) return c;
          // Hijas: se archivan las activas; al restaurar vuelven las archivadas a la vez que el padre.
          if (archived) return c.archivedAt ? c : { ...c, archivedAt: at };
          return c.archivedAt && c.archivedAt === target?.archivedAt ? { ...c, archivedAt: null } : c;
        }),
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKeys.categories.overview(), context.previous);
    },
    onSettled: invalidate,
  });
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : undefined);

/** Archivar con toast "Categoría archivada" + Deshacer (sin confirmaciones) y Restaurar. */
export function useCategoryActions() {
  const { mutateAsync: archiveAsync } = useSetArchived(true);
  const { mutateAsync: unarchiveAsync } = useSetArchived(false);

  const archive = useCallback(
    (category: Pick<CategoryDTO, "id" | "name">, { childCount = 0 }: { childCount?: number } = {}) => {
      const pending = archiveAsync(category.id);
      pending.catch((error) => toast.error("No se pudo archivar la categoría", { description: errorMessage(error) }));
      toast("Categoría archivada", {
        description:
          childCount > 0
            ? `${category.name} y ${childCount === 1 ? "1 subcategoría" : `${childCount} subcategorías`}`
            : category.name,
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => {
            pending
              .then(() => unarchiveAsync(category.id))
              .catch((error) => toast.error("No se pudo deshacer", { description: errorMessage(error) }));
          },
        },
      });
    },
    [archiveAsync, unarchiveAsync],
  );

  const restore = useCallback(
    async (category: Pick<CategoryDTO, "id" | "name">) => {
      try {
        await unarchiveAsync(category.id);
        toast("Categoría restaurada", { description: category.name });
      } catch (error) {
        toast.error("No se pudo restaurar la categoría", { description: errorMessage(error) });
      }
    },
    [unarchiveAsync],
  );

  return { archive, restore };
}
