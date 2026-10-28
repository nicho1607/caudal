"use client";

// Lectura y mutaciones de movimientos con TanStack Query. Tras cada mutación se
// invalidan dashboard, movimientos y cuentas (KPIs, listas, saldos) y se hace
// router.refresh() porque los saldos del sidebar se renderizan en el servidor.
import { useMutation, useQuery, useQueryClient, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { toast } from "sonner";

import type { DashboardData } from "@/features/dashboard/types";
import { transactionsApi } from "@/features/transactions/api";
import { duplicateInput, matchesTarget, type TransactionTarget } from "@/features/transactions/form";
import type { CreateTransactionInput, UpdateTransactionInput } from "@/features/transactions/schemas";
import type { TransactionDTO, TransactionListDTO } from "@/features/transactions/types";
import { queryKeys } from "@/lib/query-keys";

/** Un movimiento completo (`GET /api/v1/transactions/[id]`). */
export function useTransaction(id: string | null) {
  return useQuery({
    queryKey: queryKeys.transactions.detail(id ?? ""),
    queryFn: () => transactionsApi.get(id!),
    enabled: !!id,
  });
}

/** Invalida todo lo que depende de los movimientos (incluido el sidebar RSC). */
export function useInvalidateTransactionData() {
  const queryClient = useQueryClient();
  const router = useRouter();
  return useCallback(async () => {
    router.refresh();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.transactions.all }),
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts.all }),
    ]);
  }, [queryClient, router]);
}

type Snapshot = [QueryKey, unknown][];

/** Listas de movimientos: `{ items }` (useQuery) o `{ pages: [{ items }] }` (useInfiniteQuery). */
function withoutTarget(old: unknown, target: TransactionTarget): unknown {
  if (!old || typeof old !== "object") return old;
  if ("pages" in old && Array.isArray(old.pages)) {
    return { ...old, pages: old.pages.map((page: unknown) => withoutTarget(page, target)) };
  }
  if ("items" in old && Array.isArray(old.items)) {
    const list = old as TransactionListDTO;
    return { ...list, items: list.items.filter((t) => !matchesTarget(t, target)) };
  }
  return old;
}

/** Quita el movimiento de las cachés visibles (dashboard + listas) y devuelve el snapshot. */
async function removeFromCaches(queryClient: QueryClient, target: TransactionTarget): Promise<Snapshot> {
  await Promise.all([
    queryClient.cancelQueries({ queryKey: queryKeys.dashboard.all }),
    queryClient.cancelQueries({ queryKey: queryKeys.transactions.lists() }),
  ]);
  const snapshot: Snapshot = [
    ...queryClient.getQueriesData({ queryKey: queryKeys.dashboard.all }),
    ...queryClient.getQueriesData({ queryKey: queryKeys.transactions.lists() }),
  ];
  queryClient.setQueriesData<DashboardData>({ queryKey: queryKeys.dashboard.all }, (old) =>
    old?.recent ? { ...old, recent: old.recent.filter((r) => !matchesTarget(r, target)) } : old,
  );
  queryClient.setQueriesData({ queryKey: queryKeys.transactions.lists() }, (old: unknown) =>
    withoutTarget(old, target),
  );
  return snapshot;
}

/** Borrado lógico con eliminación optimista de las filas (ambas patas en transferencias). */
export function useDeleteTransaction() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (target: TransactionTarget) => transactionsApi.remove(target.id),
    onMutate: async (target) => ({ snapshot: await removeFromCaches(queryClient, target) }),
    onError: (_error, _target, context) => {
      context?.snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));
    },
    onSettled: invalidate,
  });
}

export function useRestoreTransaction() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (id: string) => transactionsApi.restore(id),
    onSettled: invalidate,
  });
}

export function useUpdateTransaction() {
  const queryClient = useQueryClient();
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateTransactionInput }) =>
      transactionsApi.update(id, input),
    onSuccess: (dto) => queryClient.setQueryData(queryKeys.transactions.detail(dto.id), dto),
    onSettled: invalidate,
  });
}

export function useCreateTransaction() {
  const invalidate = useInvalidateTransactionData();
  return useMutation({
    mutationFn: (input: CreateTransactionInput) => transactionsApi.create(input),
    onSettled: invalidate,
  });
}

/** yyyy-mm-dd local del navegador. */
function localToday(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : "Inténtalo de nuevo.");

/**
 * Acciones de fila con toasts y "Deshacer" (docs §1: soft delete + toast 5 s,
 * sin diálogos de confirmación). Las usan el widget del dashboard y la tabla.
 */
export function useTransactionActions() {
  const queryClient = useQueryClient();
  const { mutateAsync: deleteAsync } = useDeleteTransaction();
  const { mutateAsync: restoreAsync } = useRestoreTransaction();
  const { mutateAsync: createAsync } = useCreateTransaction();

  const remove = useCallback(
    (target: TransactionTarget) => {
      const pending = deleteAsync(target);
      pending.catch((error) => toast.error("No se pudo eliminar el movimiento", { description: errorMessage(error) }));
      toast("Movimiento eliminado", {
        duration: 5000,
        action: {
          label: "Deshacer",
          onClick: () => {
            // Si el DELETE aún está en vuelo, restaurar después de que termine.
            pending
              .then(() => restoreAsync(target.id))
              .catch((error) => toast.error("No se pudo deshacer", { description: errorMessage(error) }));
          },
        },
      });
    },
    [deleteAsync, restoreAsync],
  );

  const duplicate = useCallback(
    async (id: string) => {
      try {
        const source = await queryClient.fetchQuery({
          queryKey: queryKeys.transactions.detail(id),
          queryFn: () => transactionsApi.get(id),
        });
        const created: TransactionDTO = await createAsync(duplicateInput(source, localToday()));
        toast("Movimiento duplicado", {
          duration: 5000,
          action: {
            label: "Deshacer",
            onClick: () => {
              deleteAsync({ id: created.id, transferGroupId: created.transferGroupId })
                .catch((error) => toast.error("No se pudo deshacer", { description: errorMessage(error) }));
            },
          },
        });
      } catch (error) {
        toast.error("No se pudo duplicar el movimiento", { description: errorMessage(error) });
      }
    },
    [queryClient, createAsync, deleteAsync],
  );

  return { remove, duplicate };
}
